import fs from "node:fs"
import dotenv from "dotenv"
import { Query } from "node-appwrite"

dotenv.config({ path: ".env" })

const configuredEndpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const endpoint = configuredEndpoint.endsWith("/v1") ? configuredEndpoint : `${configuredEndpoint}/v1`
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID

const needed = [
  { env: "NEXT_PUBLIC_REC_CONFERENCES_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_CONFERENCES_COLLECTION_ID, role: "Conferences" },
  { env: "NEXT_PUBLIC_REC_REGISTRATIONS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_REGISTRATIONS_COLLECTION_ID, role: "Registrations" },
  { env: "NEXT_PUBLIC_REC_COUPONS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_COUPONS_COLLECTION_ID, role: "Coupons" },
  { env: "REC_REGISTRATION_IMPORTS_COLLECTION_ID", id: process.env.REC_REGISTRATION_IMPORTS_COLLECTION_ID, role: "Registration imports" },
  { env: "REC_REGISTRATION_IMPORT_ROWS_COLLECTION_ID", id: process.env.REC_REGISTRATION_IMPORT_ROWS_COLLECTION_ID, role: "Import rows" },
  { env: "REC_REGISTRATION_LOCKS_COLLECTION_ID", id: process.env.REC_REGISTRATION_LOCKS_COLLECTION_ID, role: "Registration locks" },
  { env: "NEXT_PUBLIC_REC_SESSIONS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SESSIONS_COLLECTION_ID, role: "Sessions" },
  { env: "NEXT_PUBLIC_REC_PROGRAMMES_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_PROGRAMMES_COLLECTION_ID, role: "Programmes" },
  { env: "NEXT_PUBLIC_REC_PROGRAM_TIME_BLOCKS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_PROGRAM_TIME_BLOCKS_COLLECTION_ID, role: "Program time blocks" },
  { env: "NEXT_PUBLIC_REC_SPONSOR_CATEGORIES_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SPONSOR_CATEGORIES_COLLECTION_ID, role: "Sponsor categories" },
  { env: "NEXT_PUBLIC_REC_SPONSORS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SPONSORS_COLLECTION_ID, role: "Sponsors" },
  { env: "NEXT_PUBLIC_REC_MEDIA_ITEMS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_MEDIA_ITEMS_COLLECTION_ID, role: "Media items" },
  { env: "NEXT_PUBLIC_REC_CONFERENCE_REPORTS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_CONFERENCE_REPORTS_COLLECTION_ID, role: "Conference reports" },
  { env: "NEXT_PUBLIC_REC_SCAN_EVENTS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SCAN_EVENTS_COLLECTION_ID, role: "Scan events (legacy OTP)" },
  { env: "NEXT_PUBLIC_REC_SCANS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SCANS_COLLECTION_ID, role: "Scans (legacy OTP)" },
  { env: "NEXT_PUBLIC_REC_BADGE_TOKENS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_BADGE_TOKENS_COLLECTION_ID, role: "Badge tokens" },
  { env: "NEXT_PUBLIC_REC_SCANNER_OPERATORS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SCANNER_OPERATORS_COLLECTION_ID, role: "Scanner operators" },
  { env: "NEXT_PUBLIC_REC_SCANNER_OTPS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SCANNER_OTPS_COLLECTION_ID, role: "Scanner OTPs" },
  { env: "NEXT_PUBLIC_REC_SCANNER_SESSIONS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SCANNER_SESSIONS_COLLECTION_ID, role: "Scanner sessions" },
  { env: "NEXT_PUBLIC_REC_SCANNER_ALLOCATIONS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SCANNER_ALLOCATIONS_COLLECTION_ID, role: "Tera allocations" },
  { env: "NEXT_PUBLIC_REC_EVENT_SCANS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_EVENT_SCANS_COLLECTION_ID, role: "HID event scans" },
  { env: "NEXT_PUBLIC_REC_SESSION_CROSS_FLAGS_COLLECTION_ID", id: process.env.NEXT_PUBLIC_REC_SESSION_CROSS_FLAGS_COLLECTION_ID, role: "Session hop flags" },
]

async function request(path, queries = []) {
  const url = new URL(`${endpoint}${path}`)
  queries.forEach((query) => url.searchParams.append("queries[]", query))
  const response = await fetch(url, {
    headers: {
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
      "X-Appwrite-Response-Format": "1.9.0",
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || `${path} ${response.status}`)
    error.status = response.status
    throw error
  }
  return payload
}

async function listAll(path) {
  const documents = []
  let total = 0
  do {
    const result = await request(path, [Query.limit(100), Query.offset(documents.length)])
    documents.push(...(result.databases || result.collections || result.buckets || result.documents || []))
    total = result.total || documents.length
  } while (documents.length < total)
  return documents
}

const databases = await listAll("/databases")
const buckets = await listAll("/storage/buckets")

const dbCollections = {}
for (const db of databases) {
  dbCollections[db.$id] = await listAll(`/databases/${encodeURIComponent(db.$id)}/collections`)
}

const recName = /rec|scanner|conference|sponsor|coupon|badge|programme|program/i
const recLike = []
for (const db of databases) {
  for (const col of dbCollections[db.$id] || []) {
    if (recName.test(col.name) || recName.test(col.$id)) {
      recLike.push({
        databaseId: db.$id,
        databaseName: db.name,
        id: col.$id,
        name: col.name,
        documents: col.documentsTotal ?? col.documentCount ?? null,
        attributes: (col.attributes || []).map((attr) => attr.key).filter(Boolean),
      })
    }
  }
}

const neededRows = []
for (const item of needed) {
  const id = String(item.id || "").trim()
  let found = null
  let databaseName = ""
  if (id) {
    for (const db of databases) {
      const match = (dbCollections[db.$id] || []).find((col) => col.$id === id)
      if (match) {
        found = match
        databaseName = db.name
        break
      }
    }
  }
  neededRows.push({
    role: item.role,
    env: item.env,
    configuredId: id || null,
    status: !id ? "missing_env" : found ? "found" : "missing_collection",
    name: found?.name || null,
    databaseName: databaseName || null,
    documents: found ? (found.documentsTotal ?? found.documentCount ?? 0) : 0,
    attributes: found ? (found.attributes || []).map((attr) => attr.key).filter(Boolean) : [],
  })
}

const bucketId = process.env.NEXT_PUBLIC_REC_CONFERENCE_BUCKET_ID
const bucket = buckets.find((item) => item.$id === bucketId)

const inventory = {
  projectId,
  databases: databases.map((db) => ({
    id: db.$id,
    name: db.name,
    collections: (dbCollections[db.$id] || []).length,
  })),
  recBucket: bucket
    ? { id: bucket.$id, name: bucket.name, enabled: bucket.enabled }
    : { id: bucketId || null, name: null, enabled: false },
  needed: neededRows,
  recLike,
  parentCollectionCount: (dbCollections[databaseId] || []).length,
}

fs.writeFileSync("scripts/.rec-appwrite-inventory.json", JSON.stringify(inventory, null, 2))
console.log(JSON.stringify({
  databases: inventory.databases,
  neededFound: neededRows.filter((row) => row.status === "found").length,
  neededMissing: neededRows.filter((row) => row.status !== "found").length,
  recLike: recLike.length,
  bucket: inventory.recBucket,
}, null, 2))
