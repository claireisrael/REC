import { Query, ID } from "appwrite"
import { config } from "./config"
import {
  normalizeTimeBlockForSave,
  sortTimeBlocks,
  validateTimeBlocks,
} from "@/lib/rec-conference/schedule"

const getCollectionId = () => {
  if (!config.recProgramTimeBlocksCollectionId) {
    throw new Error("REC program time blocks collection is not configured.")
  }
  return config.recProgramTimeBlocksCollectionId
}

export const getProgramTimeBlocks = async (programId, appwriteServices, additionalQueries = []) => {
  if (!programId) return { documents: [], total: 0 }

  const response = await appwriteServices.databases.listDocuments(
    config.databaseId,
    getCollectionId(),
    [
      Query.equal("programId", programId),
      Query.orderAsc("day"),
      Query.orderAsc("startMinutes"),
      Query.limit(1000),
      ...additionalQueries,
    ]
  )

  return {
    ...response,
    documents: sortTimeBlocks(response.documents || []),
  }
}

export const getProgramTimeBlocksByDay = async (programId, day, appwriteServices) => (
  getProgramTimeBlocks(programId, appwriteServices, [Query.equal("day", Number(day))])
)

export const createProgramTimeBlock = async (blockData, appwriteServices, userId) => {
  const payload = {
    ...normalizeTimeBlockForSave(blockData),
    createdBy: userId || blockData.createdBy || "",
    createdAt: new Date().toISOString(),
  }

  return appwriteServices.databases.createDocument(
    config.databaseId,
    getCollectionId(),
    ID.unique(),
    payload
  )
}

export const updateProgramTimeBlock = async (blockId, blockData, appwriteServices) => {
  const payload = {
    ...normalizeTimeBlockForSave(blockData),
    updatedAt: new Date().toISOString(),
  }

  return appwriteServices.databases.updateDocument(
    config.databaseId,
    getCollectionId(),
    blockId,
    payload
  )
}

export const deleteProgramTimeBlock = async (blockId, appwriteServices) => (
  appwriteServices.databases.deleteDocument(
    config.databaseId,
    getCollectionId(),
    blockId
  )
)

export const syncProgramTimeBlocks = async ({
  program,
  blocks,
  appwriteServices,
  userId,
}) => {
  const sourceBlocks = sortTimeBlocks(blocks || [])
  const normalizedBlocks = sourceBlocks.map((block, index) => (
    normalizeTimeBlockForSave(
      { ...block, sortOrder: index },
      {
        conferenceId: program.conferenceId,
        programId: program.$id,
        date: block.date,
      }
    )
  ))

  const validationErrors = validateTimeBlocks(normalizedBlocks)
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0])
  }

  const existingResponse = await getProgramTimeBlocks(program.$id, appwriteServices)
  const existingById = new Map((existingResponse.documents || []).map((block) => [block.$id, block]))
  const desiredIds = new Set((blocks || []).map((block) => block.$id).filter(Boolean))

  const deletes = (existingResponse.documents || [])
    .filter((block) => !desiredIds.has(block.$id))
    .map((block) => deleteProgramTimeBlock(block.$id, appwriteServices))

  const writes = normalizedBlocks.map((payload, index) => {
    const source = sourceBlocks[index]
    const existingId = source?.$id

    if (existingId && existingById.has(existingId)) {
      return updateProgramTimeBlock(existingId, payload, appwriteServices)
    }

    return createProgramTimeBlock(payload, appwriteServices, userId)
  })

  const results = await Promise.all([...deletes, ...writes])
  return results.filter(Boolean)
}
