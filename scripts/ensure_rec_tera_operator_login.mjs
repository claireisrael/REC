// Schema for Tera operator sign-in:
// - rec_scanner_operators.teraSerials: the Tera units an operator may unlock
// - rec_scanner_sessions index on deviceId, so a new sign-in can close the
//   unit's earlier session
//
//   node scripts/ensure_rec_tera_operator_login.mjs
//
// Safe to run more than once; it only adds what is missing.
import dotenv from "dotenv"

dotenv.config({ path: ".env" })
dotenv.config({ path: ".env.local" })

const configuredEndpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const endpoint = configuredEndpoint.endsWith("/v1") ? configuredEndpoint : `${configuredEndpoint}/v1`
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
const operatorsCollectionId = process.env.NEXT_PUBLIC_REC_SCANNER_OPERATORS_COLLECTION_ID || "rec_scanner_operators"
const sessionsCollectionId = process.env.NEXT_PUBLIC_REC_SCANNER_SESSIONS_COLLECTION_ID || "rec_scanner_sessions"

function requireConfig() {
  if (!configuredEndpoint || !projectId || !apiKey || !databaseId) {
    throw new Error("Appwrite endpoint, project, database, and API key must be set in .env")
  }
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
      "X-Appwrite-Response-Format": "1.9.0",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || `${method} ${path} failed with ${response.status}`)
    error.status = response.status
    throw error
  }
  return payload
}

function collectionPath(collectionId, suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}${suffix}`
}

async function getOrNull(path) {
  try {
    return await request(path)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function waitFor(path, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const item = await getOrNull(path)
    if (item?.status === "available") return
    if (item?.status === "failed") throw new Error(`${label} creation failed`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function ensureStringArrayAttribute(collectionId, key, size) {
  const path = collectionPath(collectionId, `/attributes/${encodeURIComponent(key)}`)
  const existing = await getOrNull(path)
  if (existing?.status === "available") {
    console.log(`Attribute present: ${collectionId}.${key}`)
    return
  }
  if (!existing) {
    await request(collectionPath(collectionId, "/attributes/string"), {
      method: "POST",
      body: { key, size, required: false, array: true },
    })
    console.log(`Creating attribute: ${collectionId}.${key}`)
  }
  await waitFor(path, `${collectionId}.${key}`)
  console.log(`Attribute ready: ${collectionId}.${key}`)
}

async function ensureIndex(collectionId, key, attributes, orders) {
  const path = collectionPath(collectionId, `/indexes/${encodeURIComponent(key)}`)
  const existing = await getOrNull(path)
  if (existing?.status === "available") {
    console.log(`Index present: ${collectionId}.${key}`)
    return
  }
  if (!existing) {
    await request(collectionPath(collectionId, "/indexes"), {
      method: "POST",
      body: { key, type: "key", attributes, orders },
    })
    console.log(`Creating index: ${collectionId}.${key}`)
  }
  await waitFor(path, `${collectionId}.${key}`)
  console.log(`Index ready: ${collectionId}.${key}`)
}

async function main() {
  requireConfig()
  await ensureStringArrayAttribute(operatorsCollectionId, "teraSerials", 32)
  await ensureIndex(sessionsCollectionId, "session_device", ["deviceId"], ["ASC"])
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
