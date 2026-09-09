import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const FORMAT = "1.9.0"
const APPLY_SCHEMA = process.argv.includes("--apply-schema")
const configuredEndpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const endpoint = configuredEndpoint.endsWith("/v1") ? configuredEndpoint : `${configuredEndpoint}/v1`
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID

const collections = {
  imports:
    process.env.REC_REGISTRATION_IMPORTS_COLLECTION_ID || "rec_registration_imports",
  rows:
    process.env.REC_REGISTRATION_IMPORT_ROWS_COLLECTION_ID || "rec_registration_import_rows",
  locks:
    process.env.REC_REGISTRATION_LOCKS_COLLECTION_ID || "rec_registration_locks",
}

function requireConfig() {
  if (
    !configuredEndpoint ||
    !projectId ||
    !apiKey ||
    !databaseId ||
    Object.values(collections).some((value) => !value)
  ) {
    throw new Error("Appwrite endpoint, project, database, API key, and import collection IDs are required.")
  }
}

function collectionPath(collectionId, suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}${suffix}`
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

async function ensureCollection(collectionId, name) {
  const existing = await getOrNull(collectionPath(collectionId))
  if (existing) {
    console.log(`Collection present: ${name} (${collectionId})`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create collection: ${name} (${collectionId})`)
    return
  }

  await request(`/databases/${encodeURIComponent(databaseId)}/collections`, {
    method: "POST",
    body: {
      collectionId,
      name,
      permissions: [],
      documentSecurity: false,
      enabled: true,
    },
  })
  console.log(`Created collection: ${name} (${collectionId})`)
}

async function ensureAttribute(collectionId, type, key, body) {
  const path = collectionPath(collectionId, `/attributes/${encodeURIComponent(key)}`)
  if (await getOrNull(path)) {
    console.log(`Attribute present: ${collectionId}.${key}`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create ${type} attribute: ${collectionId}.${key}`)
    return
  }

  await request(collectionPath(collectionId, `/attributes/${type}`), {
    method: "POST",
    body: { key, ...body },
  })
  console.log(`Created ${type} attribute: ${collectionId}.${key}`)
}

async function waitForAttributes(collectionId, keys) {
  if (!APPLY_SCHEMA) return

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const attributes = await Promise.all(
      keys.map((key) =>
        getOrNull(collectionPath(collectionId, `/attributes/${encodeURIComponent(key)}`))
      )
    )
    const failed = attributes.find((attribute) => attribute?.status === "failed")
    if (failed) throw new Error(`Attribute creation failed: ${collectionId}.${failed.key}`)
    if (attributes.every((attribute) => attribute?.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Timed out waiting for attributes on ${collectionId}.`)
}

async function waitForIndex(collectionId, key) {
  if (!APPLY_SCHEMA) return

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const index = await getOrNull(
      collectionPath(collectionId, `/indexes/${encodeURIComponent(key)}`)
    )
    if (index?.status === "available") return
    if (index?.status === "failed") throw new Error(`Index creation failed: ${collectionId}.${key}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Timed out waiting for index ${collectionId}.${key}.`)
}

async function ensureIndex(collectionId, key, type, attributes) {
  const path = collectionPath(collectionId, `/indexes/${encodeURIComponent(key)}`)
  if (await getOrNull(path)) {
    console.log(`Index present: ${collectionId}.${key}`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create ${type} index: ${collectionId}.${key}`)
    return
  }

  await request(collectionPath(collectionId, "/indexes"), {
    method: "POST",
    body: { key, type, attributes, orders: [] },
  })
  await waitForIndex(collectionId, key)
  console.log(`Created ${type} index: ${collectionId}.${key}`)
}

const importAttributes = [
  ["string", "conferenceId", { size: 64, required: true }],
  ["integer", "conferenceYear", { required: true }],
  ["string", "conferenceTitle", { size: 200, required: true }],
  ["enum", "templateType", {
    elements: ["standard", "sponsored"],
    required: true,
  }],
  ["enum", "status", {
    elements: ["validated", "processing", "completed", "completed_with_errors", "failed", "cancelled"],
    required: true,
  }],
  ["string", "fileName", { size: 255, required: true }],
  ["boolean", "sendEmails", { required: false, default: false }],
  ["boolean", "updateExisting", { required: false, default: false }],
  ["integer", "rowCount", { required: false, min: 0, default: 0 }],
  ["integer", "readyCount", { required: false, min: 0, default: 0 }],
  ["integer", "invalidCount", { required: false, min: 0, default: 0 }],
  ["integer", "createdCount", { required: false, min: 0, default: 0 }],
  ["integer", "returningCount", { required: false, min: 0, default: 0 }],
  ["integer", "updatedCount", { required: false, min: 0, default: 0 }],
  ["integer", "skippedCount", { required: false, min: 0, default: 0 }],
  ["integer", "failedCount", { required: false, min: 0, default: 0 }],
  ["integer", "emailsSent", { required: false, min: 0, default: 0 }],
  ["integer", "emailsFailed", { required: false, min: 0, default: 0 }],
  ["string", "couponSummaryJson", { size: 8000, required: false }],
  ["string", "createdBy", { size: 64, required: true }],
  ["string", "createdByName", { size: 180, required: false }],
  ["string", "idempotencyKey", { size: 64, required: true }],
  ["datetime", "createdAt", { required: true }],
  ["datetime", "validatedAt", { required: true }],
  ["datetime", "startedAt", { required: false }],
  ["datetime", "completedAt", { required: false }],
  ["string", "errorMessage", { size: 2000, required: false }],
]

const rowAttributes = [
  ["string", "importId", { size: 36, required: true }],
  ["integer", "rowNumber", { required: true, min: 2 }],
  ["string", "email", { size: 320, required: false }],
  ["string", "couponCode", { size: 10, required: false }],
  ["enum", "action", {
    elements: ["create", "register_existing", "update_existing", "skip"],
    required: true,
  }],
  ["enum", "status", {
    elements: ["pending", "invalid", "processing", "completed", "skipped", "failed"],
    required: true,
  }],
  ["string", "payloadJson", { size: 8000, required: true }],
  ["string", "errorMessage", { size: 2000, required: false }],
  ["string", "registrationId", { size: 36, required: false }],
  ["enum", "emailStatus", {
    elements: ["not_requested", "pending", "sent", "failed"],
    required: true,
  }],
  ["string", "emailError", { size: 1000, required: false }],
  ["datetime", "processedAt", { required: false }],
]

const lockAttributes = [
  ["string", "scope", { size: 128, required: true }],
  ["datetime", "expiresAt", { required: true }],
]

async function main() {
  requireConfig()
  console.log(`REC registration import schema ${APPLY_SCHEMA ? "migration" : "dry run"}`)
  console.log(`Database: ${databaseId}`)

  await ensureCollection(collections.imports, "REC Registration Imports")
  await ensureCollection(collections.rows, "REC Registration Import Rows")
  await ensureCollection(collections.locks, "REC Registration Locks")

  for (const [type, key, body] of importAttributes) {
    await ensureAttribute(collections.imports, type, key, body)
  }
  for (const [type, key, body] of rowAttributes) {
    await ensureAttribute(collections.rows, type, key, body)
  }
  for (const [type, key, body] of lockAttributes) {
    await ensureAttribute(collections.locks, type, key, body)
  }

  await waitForAttributes(collections.imports, importAttributes.map(([, key]) => key))
  await waitForAttributes(collections.rows, rowAttributes.map(([, key]) => key))
  await waitForAttributes(collections.locks, lockAttributes.map(([, key]) => key))

  const indexes = [
    [collections.imports, "idx_rec_import_key", "unique", ["idempotencyKey"]],
    [collections.imports, "idx_rec_import_conference", "key", ["conferenceId"]],
    [collections.imports, "idx_rec_import_status", "key", ["status"]],
    [collections.imports, "idx_rec_import_creator", "key", ["createdBy"]],
    [collections.rows, "idx_rec_import_row_unique", "unique", ["importId", "rowNumber"]],
    [collections.rows, "idx_rec_import_row_status", "key", ["importId", "status", "rowNumber"]],
    [collections.rows, "idx_rec_import_row_email", "key", ["importId", "emailStatus", "rowNumber"]],
    [collections.rows, "idx_rec_import_email", "key", ["email"]],
    [collections.locks, "scope", "key", ["scope"]],
  ]

  for (const [collectionId, key, type, attributes] of indexes) {
    await ensureIndex(collectionId, key, type, attributes)
  }

  console.log(
    APPLY_SCHEMA
      ? "REC registration import schema is ready."
      : "Dry run complete. Use --apply-schema to create it."
  )
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
