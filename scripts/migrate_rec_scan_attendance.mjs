import dotenv from "dotenv"
import { Query } from "node-appwrite"
import {
  getRecScanAttendanceEligibility,
  getRecScanEventRequiredAttendanceDays,
} from "../lib/rec-conference/scanning-rules.mjs"

dotenv.config({ path: ".env.local" })

const FORMAT = "1.9.0"
const APPLY_SCHEMA = process.argv.includes("--apply-schema")
const BACKFILL = process.argv.includes("--backfill")
const PURGE_SCANS = process.argv.includes("--purge-scans")
const YES = process.argv.includes("--yes")

const endpoint = (process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID

const collections = {
  scans: process.env.NEXT_PUBLIC_REC_SCANS_COLLECTION_ID || "rec_scans",
  events: process.env.NEXT_PUBLIC_REC_SCAN_EVENTS_COLLECTION_ID || "rec_scan_events",
  registrations: process.env.NEXT_PUBLIC_REC_REGISTRATIONS_COLLECTION_ID,
  conferences: process.env.NEXT_PUBLIC_REC_CONFERENCES_COLLECTION_ID,
}

function requireConfig() {
  if (!endpoint || !projectId || !apiKey || !databaseId) {
    throw new Error("Appwrite endpoint, project, database and API key must be configured in .env.local")
  }
  Object.entries(collections).forEach(([name, id]) => {
    if (!id) throw new Error(`Missing REC collection configuration: ${name}`)
  })
}

function collectionPath(collectionId, suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}${suffix}`
}

function documentsPath(collectionId, suffix = "") {
  return `${collectionPath(collectionId)}/documents${suffix}`
}

async function request(path, { method = "GET", body, queries = [] } = {}) {
  const url = new URL(`${endpoint}${path}`)
  queries.forEach((query) => url.searchParams.append("queries[]", query))
  const response = await fetch(url, {
    method,
    headers: {
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
      "X-Appwrite-Response-Format": FORMAT,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || `${method} ${path} failed`)
    error.status = response.status
    throw error
  }
  return payload
}

async function getOrNull(path) {
  try {
    return await request(path)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function ensureStringArrayAttribute(key, size = 120) {
  const path = collectionPath(collections.scans, `/attributes/${encodeURIComponent(key)}`)
  if (await getOrNull(path)) {
    console.log(`Attribute present: ${collections.scans}.${key}`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would add string[] attribute: ${collections.scans}.${key}`)
    return
  }
  await request(collectionPath(collections.scans, "/attributes/string"), {
    method: "POST",
    body: { key, size, required: false, array: true },
  })
  console.log(`Created string[] attribute: ${collections.scans}.${key}`)
}

async function waitForAttributes(keys) {
  if (!APPLY_SCHEMA) return
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const states = await Promise.all(keys.map((key) =>
      getOrNull(collectionPath(collections.scans, `/attributes/${encodeURIComponent(key)}`))
    ))
    if (states.every((state) => state?.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error("Timed out waiting for REC scan attendance attributes")
}

async function listAllDocuments(collectionId, queries = []) {
  const documents = []
  let total = 0
  do {
    const result = await request(documentsPath(collectionId), {
      queries: [...queries, Query.limit(100), Query.offset(documents.length)],
    })
    documents.push(...(result.documents || []))
    total = result.total || documents.length
  } while (documents.length < total)
  return documents
}

async function getDocument(collectionId, documentId, cache) {
  if (!documentId) return null
  const key = `${collectionId}:${documentId}`
  if (cache.has(key)) return cache.get(key)
  const doc = await getOrNull(documentsPath(collectionId, `/${encodeURIComponent(documentId)}`))
  cache.set(key, doc)
  return doc
}

function parseJson(value, fallback) {
  if (!value || typeof value !== "string") return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function conferenceWithDays(conference) {
  if (!conference) return null
  return {
    ...conference,
    days: parseJson(conference.days, []),
  }
}

function scanPayloadFor(scan, event, conference, registration) {
  const attendance = registration
    ? getRecScanAttendanceEligibility(registration, event, conference)
    : {
        registeredDays: [],
        requiredDays: getRecScanEventRequiredAttendanceDays(event, conference),
        matchedDays: [],
        reason: scan.resultReason || "",
        message: "",
      }
  const metadata = parseJson(scan.metadata, {})
  return {
    registrationDaysAttending: attendance.registeredDays || [],
    eventAllowedDaysAttending: attendance.requiredDays || [],
    matchedAttendanceDays: attendance.matchedDays || [],
    metadata: JSON.stringify({
      ...metadata,
      attendance: {
        registeredDays: attendance.registeredDays || [],
        requiredDays: attendance.requiredDays || [],
        matchedDays: attendance.matchedDays || [],
        reason: attendance.reason || scan.resultReason || "",
        message: attendance.message || "",
      },
    }),
  }
}

async function applySchema() {
  const keys = ["registrationDaysAttending", "eventAllowedDaysAttending", "matchedAttendanceDays"]
  for (const key of keys) await ensureStringArrayAttribute(key)
  await waitForAttributes(keys)
}

async function backfillScans() {
  const scans = await listAllDocuments(collections.scans)
  const cache = new Map()
  let updated = 0
  let skipped = 0

  for (const scan of scans) {
    const event = await getDocument(collections.events, scan.eventId, cache)
    if (!event) {
      skipped += 1
      continue
    }
    const conference = conferenceWithDays(await getDocument(collections.conferences, event.conferenceId || scan.conferenceId, cache))
    const registration = await getDocument(collections.registrations, scan.registrationId, cache)
    const payload = scanPayloadFor(scan, event, conference, registration)

    if (!BACKFILL) {
      updated += 1
      continue
    }

    await request(documentsPath(collections.scans, `/${encodeURIComponent(scan.$id)}`), {
      method: "PATCH",
      body: { data: payload },
    })
    updated += 1
  }

  console.log(`${BACKFILL ? "Backfilled" : "Would backfill"} ${updated} scan record(s). Skipped ${skipped}.`)
}

async function purgeScans() {
  const scans = await listAllDocuments(collections.scans)
  if (!PURGE_SCANS) {
    console.log(`Would purge ${scans.length} REC scan record(s).`)
    return
  }
  if (!YES) {
    throw new Error("Refusing to purge scans without --yes")
  }
  for (const scan of scans) {
    await request(documentsPath(collections.scans, `/${encodeURIComponent(scan.$id)}`), { method: "DELETE" })
  }
  console.log(`Purged ${scans.length} REC scan record(s).`)
}

async function main() {
  requireConfig()
  const dryRun = !APPLY_SCHEMA && !BACKFILL && !PURGE_SCANS
  console.log("REC scan attendance migration")
  console.log(`Database: ${databaseId}`)
  console.log(`Scans collection: ${collections.scans}`)

  await applySchema()
  if (BACKFILL || dryRun) await backfillScans()
  if (PURGE_SCANS || dryRun) await purgeScans()
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
