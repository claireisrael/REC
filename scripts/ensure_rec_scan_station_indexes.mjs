import dotenv from "dotenv"

dotenv.config({ path: ".env" })
dotenv.config({ path: ".env.local" })

const configuredEndpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const endpoint = configuredEndpoint.endsWith("/v1") ? configuredEndpoint : `${configuredEndpoint}/v1`
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
const collectionId = process.env.NEXT_PUBLIC_REC_SCANS_COLLECTION_ID || "rec_scans"

const INDEXES = [
  ["conference_device_time", ["conferenceId", "deviceId", "scannedAt"], ["ASC", "ASC", "DESC"]],
  ["conference_scanner_time", ["conferenceId", "scannedBy", "scannedAt"], ["ASC", "ASC", "DESC"]],
]

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

function collectionPath(suffix = "") {
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

async function waitForIndex(key) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const index = await getOrNull(collectionPath(`/indexes/${encodeURIComponent(key)}`))
    if (index?.status === "available") return
    if (index?.status === "failed") throw new Error(`Index creation failed: ${collectionId}.${key}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for index ${collectionId}.${key}`)
}

async function ensureIndex(key, attributes, orders) {
  const existing = await getOrNull(collectionPath(`/indexes/${encodeURIComponent(key)}`))
  if (existing?.status === "available") {
    console.log(`Index present: ${key}`)
    return
  }
  if (!existing) {
    await request(collectionPath("/indexes"), {
      method: "POST",
      body: { key, type: "key", attributes, orders },
    })
    console.log(`Creating index: ${key}`)
  }
  await waitForIndex(key)
  console.log(`Index ready: ${key}`)
}

async function main() {
  requireConfig()
  for (const [key, attributes, orders] of INDEXES) {
    await ensureIndex(key, attributes, orders)
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
