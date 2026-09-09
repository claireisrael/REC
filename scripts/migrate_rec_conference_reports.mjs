import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const FORMAT = "1.9.0"
const APPLY_SCHEMA = process.argv.includes("--apply-schema")
const configuredEndpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const endpoint = configuredEndpoint.endsWith("/v1") ? configuredEndpoint : `${configuredEndpoint}/v1`
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
const reportsCollectionId =
  process.env.NEXT_PUBLIC_REC_CONFERENCE_REPORTS_COLLECTION_ID || "rec_conference_reports"

function requireConfig() {
  if (!configuredEndpoint || !projectId || !apiKey || !databaseId || !reportsCollectionId) {
    throw new Error("Appwrite endpoint, project, database, API key, and reports collection must be configured.")
  }
}

function collectionPath(suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(reportsCollectionId)}${suffix}`
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${endpoint}${path}`, {
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
    const error = new Error(payload?.message || `${method} ${path} failed with ${response.status}`)
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

async function ensureCollection() {
  const existing = await getOrNull(collectionPath())
  if (existing) {
    console.log(`Collection present: ${existing.name} (${reportsCollectionId})`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create collection: REC Conference Reports (${reportsCollectionId})`)
    return
  }
  await request(`/databases/${encodeURIComponent(databaseId)}/collections`, {
    method: "POST",
    body: {
      collectionId: reportsCollectionId,
      name: "REC Conference Reports",
      permissions: [],
      documentSecurity: false,
      enabled: true,
    },
  })
  console.log(`Created collection: REC Conference Reports (${reportsCollectionId})`)
}

async function ensureAttribute(type, key, body) {
  if (await getOrNull(collectionPath(`/attributes/${encodeURIComponent(key)}`))) {
    console.log(`Attribute present: ${key}`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create ${type} attribute: ${key}`)
    return
  }
  await request(collectionPath(`/attributes/${type}`), {
    method: "POST",
    body: { key, ...body },
  })
  console.log(`Created ${type} attribute: ${key}`)
}

async function waitForAttributes(keys) {
  if (!APPLY_SCHEMA) return
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const attributes = await Promise.all(
      keys.map((key) => getOrNull(collectionPath(`/attributes/${encodeURIComponent(key)}`)))
    )
    const failed = attributes.find((attribute) => attribute?.status === "failed")
    if (failed) throw new Error(`Attribute creation failed: ${failed.key}`)
    if (attributes.every((attribute) => attribute?.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error("Timed out waiting for REC report attributes.")
}

async function waitForIndex(key) {
  if (!APPLY_SCHEMA) return
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const index = await getOrNull(collectionPath(`/indexes/${encodeURIComponent(key)}`))
    if (index?.status === "available") return
    if (index?.status === "failed") throw new Error(`Index creation failed: ${key}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for REC report index: ${key}`)
}

async function ensureIndex(key, attributes) {
  if (await getOrNull(collectionPath(`/indexes/${encodeURIComponent(key)}`))) {
    console.log(`Index present: ${key}`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create index: ${key} (${attributes.join(", ")})`)
    return
  }
  await request(collectionPath("/indexes"), {
    method: "POST",
    body: { key, type: "key", attributes, orders: [] },
  })
  await waitForIndex(key)
  console.log(`Created index: ${key}`)
}

async function main() {
  requireConfig()
  console.log(`REC conference reports schema ${APPLY_SCHEMA ? "migration" : "dry run"}`)
  console.log(`Database: ${databaseId}`)
  console.log(`Collection: ${reportsCollectionId}`)

  await ensureCollection()
  const attributes = [
    ["string", "conferenceId", { size: 64, required: true }],
    ["enum", "reportType", {
      elements: ["conference_report", "proceedings", "outcomes", "communique", "other"],
      required: true,
    }],
    ["string", "title", { size: 180, required: true }],
    ["string", "summary", { size: 1200, required: false }],
    ["string", "reportUrl", { size: 2000, required: true }],
    ["string", "coverImageUrl", { size: 1000, required: false }],
    ["datetime", "publicationDate", { required: false }],
    ["integer", "displayOrder", { required: false, min: 0, default: 0 }],
    ["boolean", "isFeatured", { required: false, default: false }],
    ["boolean", "isPublished", { required: false, default: false }],
    ["string", "createdBy", { size: 64, required: false }],
    ["string", "updatedBy", { size: 64, required: false }],
    ["datetime", "createdAt", { required: true }],
    ["datetime", "updatedAt", { required: true }],
  ]

  for (const [type, key, body] of attributes) await ensureAttribute(type, key, body)
  await waitForAttributes(attributes.map(([, key]) => key))

  const indexes = [
    ["conference_order", ["conferenceId", "displayOrder", "title"]],
    ["conference_type_order", ["conferenceId", "reportType", "displayOrder", "title"]],
    ["conference_public_order", ["conferenceId", "isPublished", "displayOrder", "title"]],
    ["conference_public_type_order", ["conferenceId", "isPublished", "reportType", "displayOrder", "title"]],
    ["conference_featured", ["conferenceId", "isFeatured"]],
    ["published_lookup", ["isPublished", "conferenceId"]],
  ]
  for (const [key, keys] of indexes) await ensureIndex(key, keys)

  console.log(APPLY_SCHEMA ? "REC conference reports schema is ready." : "Dry run complete. Use --apply-schema to create it.")
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
