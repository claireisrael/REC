import { Query } from "node-appwrite"
import { config } from "@/lib/appwrite/config"
import { getRestDocument, listRestDocuments } from "@/lib/appwrite/appwrite-rest-server"
import { exhibitorCollections as C } from "./exhibitor-schema.mjs"
import {
  DEFAULT_EXHIBITION_SETTINGS,
  ExhibitorError,
  normalizeExhibitorApplication,
  normalizedEmail,
  parseExhibitorJson as json,
  representativeEmails,
} from "./exhibitor-rules.mjs"

async function listAll(table, queries = []) {
  const rows = []
  let cursor
  for (;;) {
    const page = await listRestDocuments(table, [
      ...queries,
      Query.limit(100),
      Query.orderAsc("$id"),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ])
    rows.push(...page.documents)
    if (page.documents.length < 100) return rows
    cursor = page.documents.at(-1).$id
  }
}

async function optional(table, id) {
  try {
    return await getRestDocument(table, id)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function exhibitionSettings(conferenceId) {
  return { ...DEFAULT_EXHIBITION_SETTINGS, ...json((await optional(C.settings, conferenceId))?.settingsJson) }
}

async function representativeReadiness(record, links, conference, setup) {
  const data = json(record.dataJson)
  const reps = data.representatives || []
  const emails = representativeEmails(data)
  const matches = emails.length ? await listAll(config.recRegistrationsCollectionId, [Query.equal("email", emails)]) : []
  const days = json(conference.days, []).map((d) => d.label)
  const validation = normalizeExhibitorApplication(data, setup, {
    allowMissingPassport: true,
    conferenceDays: conference.days,
    existingRepresentatives: data.representatives,
  })
  return reps.map((rep, index) => {
    const identities = matches.filter((r) => normalizedEmail(r.email) === rep.email)
    const link = links.find((l) => l.representativeId === rep.id && l.active && l.email === rep.email)
    const reasons = []
    if (record.status !== "confirmed") reasons.push("Company participation must be confirmed.")
    if (reps.filter((r) => r.email === rep.email).length > 1 || identities.length > 1) reasons.push("Resolve the shared or duplicate email identity.")
    if (!rep.days?.length || rep.days.some((d) => !days.includes(d))) reasons.push("Select valid attendance days.")
    for (const [field, message] of Object.entries(validation.fields))
      if (field.startsWith(`representatives.${index}.`) && !field.endsWith(".days")) reasons.push(message)
    if (!identities.length) {
      if (!rep.firstName || !rep.lastName) reasons.push("Provide first and last names.")
      if (!data.country || !data.city || !data.stateRegion) reasons.push("Complete the company location.")
    }
    return {
      representativeId: rep.id,
      status: link && record.status === "confirmed" ? "active" : reasons.length ? "blocked" : identities.length ? "identity_confirmation" : "ready",
      reasons,
    }
  })
}

export async function listExhibitorReadiness(conferenceId, input = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,35}$/.test(String(conferenceId || ""))) throw new ExhibitorError("Select a conference.")
  const page = Math.max(1, parseInt(input.page) || 1)
  const limit = 5
  const result = await listRestDocuments(C.applications, [
    Query.equal("conferenceId", conferenceId),
    Query.orderDesc("$createdAt"),
    Query.limit(limit),
    Query.offset((page - 1) * limit),
  ])
  const conference = await getRestDocument(config.recConferencesCollectionId, conferenceId)
  const setup = await exhibitionSettings(conferenceId)
  const documents = []
  for (const record of result.documents || []) {
    const links = await listAll(C.representatives, [Query.equal("applicationId", record.$id)])
    const readiness = await representativeReadiness(record, links, conference, setup)
    documents.push({
      $id: record.$id,
      companyName: record.companyName,
      status: record.status,
      representatives: (json(record.dataJson).representatives || []).map((r) => ({ id: r.id, fullName: r.fullName })),
      readiness,
    })
  }
  return {
    total: result.total || 0,
    documents,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil((result.total || 0) / limit)),
  }
}
