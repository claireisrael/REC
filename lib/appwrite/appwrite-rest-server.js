import { ID } from "node-appwrite"
import { config } from "@/lib/appwrite/config"

const APPWRITE_RESPONSE_FORMAT = "1.9.0"

const getHeaders = (hasBody = false) => {
  const headers = {
    "X-Appwrite-Project": config.projectId || "",
    "X-Appwrite-Key": process.env.APPWRITE_API_KEY || "",
    "X-Appwrite-Response-Format": APPWRITE_RESPONSE_FORMAT,
  }

  if (hasBody) headers["Content-Type"] = "application/json"
  return headers
}

const getUrl = (path, queries = []) => {
  const endpoint = (config.endpoint || "").replace(/\/$/, "")
  if (!endpoint || !config.projectId || !process.env.APPWRITE_API_KEY) {
    throw new Error("Appwrite server REST configuration is incomplete")
  }

  const url = new URL(`${endpoint}${path}`)
  queries.forEach((query) => url.searchParams.append("queries[]", query))
  return url
}

export const requestAppwriteRest = async (path, { method = "GET", queries = [], body } = {}) => {
  const response = await fetch(getUrl(path, queries), {
    method,
    cache: "no-store",
    headers: getHeaders(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return null

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || "Appwrite request failed")
    error.status = response.status
    error.type = payload?.type
    throw error
  }

  return payload
}

export const requestAppwriteMultipart = async (path, formData, { headers = {} } = {}) => {
  const response = await fetch(getUrl(path), {
    method: "POST",
    cache: "no-store",
    headers: { ...getHeaders(false), ...headers },
    body: formData,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || "Appwrite file upload failed")
    error.status = response.status
    error.type = payload?.type
    throw error
  }
  return payload
}

export const requestAppwriteBinary = async (path) => {
  const response = await fetch(getUrl(path), {
    method: "GET",
    cache: "no-store",
    headers: getHeaders(false),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const error = new Error(payload?.message || "Appwrite file request failed")
    error.status = response.status
    throw error
  }
  return response
}

const documentsPath = (collectionId) =>
  `/databases/${encodeURIComponent(config.databaseId)}/collections/${encodeURIComponent(collectionId)}/documents`

export const listRestDocuments = (collectionId, queries = []) =>
  requestAppwriteRest(documentsPath(collectionId), { queries })

export const getRestDocument = (collectionId, documentId) =>
  requestAppwriteRest(`${documentsPath(collectionId)}/${encodeURIComponent(documentId)}`)

export const createRestDocument = (collectionId, data) =>
  requestAppwriteRest(documentsPath(collectionId), {
    method: "POST",
    body: {
      documentId: ID.unique(),
      data,
    },
  })

export const createRestDocumentWithId = (collectionId, documentId, data) =>
  requestAppwriteRest(documentsPath(collectionId), {
    method: "POST",
    body: {
      documentId,
      data,
    },
  })

export const updateRestDocument = (collectionId, documentId, data) =>
  requestAppwriteRest(`${documentsPath(collectionId)}/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    body: { data },
  })

export const deleteRestDocument = (collectionId, documentId) =>
  requestAppwriteRest(`${documentsPath(collectionId)}/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  })

const storageFilePath = (bucketId, fileId = "") =>
  `/storage/buckets/${encodeURIComponent(bucketId)}/files${fileId ? `/${encodeURIComponent(fileId)}` : ""}`

export const createRestFile = async (bucketId, file, options = {}) => {
  const fileId = ID.unique()
  const permissions = Array.isArray(options.permissions)
    ? options.permissions
    : ['read("users")']
  const chunkSize = 5 * 1024 * 1024
  let response = null

  for (let start = 0; start < file.size; start += chunkSize) {
    const end = Math.min(file.size, start + chunkSize)
    const formData = new FormData()
    formData.append("fileId", fileId)
    formData.append("file", file.slice(start, end, file.type), file.name)
    permissions.forEach((permission) => formData.append("permissions[]", permission))
    response = await requestAppwriteMultipart(storageFilePath(bucketId), formData, {
      headers: file.size > chunkSize ? {
        "Content-Range": `bytes ${start}-${end - 1}/${file.size}`,
        ...(response?.$id ? { "X-Appwrite-ID": response.$id } : {}),
      } : {},
    })
  }

  return response
}

export const deleteRestFile = (bucketId, fileId) =>
  requestAppwriteRest(storageFilePath(bucketId, fileId), { method: "DELETE" })

export const getRestFile = (bucketId, fileId) =>
  requestAppwriteRest(storageFilePath(bucketId, fileId))

export const getRestFileDownload = (bucketId, fileId) =>
  requestAppwriteBinary(`${storageFilePath(bucketId, fileId)}/download`)

export const getRestFileViewUrl = (bucketId, fileId) => {
  const endpoint = (config.endpoint || "").replace(/\/$/, "")
  return `${endpoint}${storageFilePath(bucketId, fileId)}/view?project=${encodeURIComponent(config.projectId || "")}`
}
