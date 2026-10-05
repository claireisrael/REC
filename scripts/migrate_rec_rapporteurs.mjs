import dotenv from "dotenv"

dotenv.config({ path: ".env" })
dotenv.config({ path: ".env.local", override: true })

const FORMAT = "1.9.0"
const APPLY_SCHEMA = process.argv.includes("--apply-schema")
const configuredEndpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const endpoint = configuredEndpoint.endsWith("/v1") ? configuredEndpoint : `${configuredEndpoint}/v1`
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID

const COLLECTIONS = [
  {
    id: "rec_rapporteurs",
    name: "REC Rapporteurs",
    attributes: [
      ["string", "conferenceId", { size: 64, required: true }],
      ["string", "email", { size: 180, required: true }],
      ["string", "name", { size: 120, required: true }],
      ["string", "phone", { size: 40, required: false }],
      ["string", "organization", { size: 160, required: false }],
      ["string", "hall", { size: 80, required: true }],
      ["string", "status", { size: 20, required: true }],
      ["string", "accessStartsAt", { size: 40, required: false }],
      ["string", "accessEndsAt", { size: 40, required: false }],
      ["string", "createdBy", { size: 64, required: false }],
      ["datetime", "createdAt", { required: true }],
      ["datetime", "updatedAt", { required: true }],
    ],
    indexes: [
      ["conference_email", "key", ["conferenceId", "email"]],
      ["email_lookup", "key", ["email"]],
    ],
  },
  {
    id: "rec_rapporteur_otps",
    name: "REC Rapporteur Access Codes",
    attributes: [
      ["string", "conferenceId", { size: 64, required: true }],
      ["string", "email", { size: 180, required: true }],
      ["string", "otpId", { size: 64, required: true }],
      ["string", "otpHash", { size: 128, required: true }],
      ["datetime", "expiresAt", { required: true }],
      ["integer", "attemptCount", { required: false, min: 0, max: 20, default: 0 }],
      ["string", "consumedAt", { size: 40, required: false }],
      ["datetime", "createdAt", { required: true }],
    ],
    indexes: [
      ["otp_lookup", "key", ["conferenceId", "email", "otpId"]],
    ],
  },
  {
    id: "rec_rapporteur_sessions",
    name: "REC Rapporteur Sessions",
    attributes: [
      ["string", "conferenceId", { size: 64, required: true }],
      ["string", "email", { size: 180, required: true }],
      ["string", "tokenHash", { size: 128, required: true }],
      ["datetime", "expiresAt", { required: true }],
      ["string", "revokedAt", { size: 40, required: false }],
      ["datetime", "createdAt", { required: true }],
    ],
    indexes: [
      ["token_lookup", "key", ["tokenHash"]],
    ],
  },
  {
    id: "rec_rapporteur_extras",
    name: "REC Unplanned Sessions",
    attributes: [
      ["string", "conferenceId", { size: 64, required: true }],
      ["string", "hall", { size: 80, required: true }],
      ["string", "title", { size: 180, required: true }],
      ["string", "date", { size: 40, required: false }],
      ["string", "startTime", { size: 20, required: false }],
      ["string", "endTime", { size: 20, required: false }],
      ["string", "mediaLinksJson", { size: 4000, required: false }],
      ["datetime", "createdAt", { required: true }],
    ],
    indexes: [
      ["conference_hall", "key", ["conferenceId"]],
    ],
  },
  {
    id: "rec_rapporteur_reports",
    name: "REC Rapporteur Reports",
    attributes: [
      ["string", "conferenceId", { size: 64, required: true }],
      ["string", "sessionKey", { size: 80, required: true }],
      ["string", "hall", { size: 80, required: true }],
      ["string", "title", { size: 180, required: false }],
      ["string", "sessionDate", { size: 40, required: false }],
      ["string", "startTime", { size: 20, required: false }],
      ["string", "endTime", { size: 20, required: false }],
      ["string", "authorEmail", { size: 180, required: true }],
      ["string", "authorName", { size: 120, required: false }],
      ["string", "authorPhone", { size: 40, required: false }],
      ["string", "status", { size: 20, required: true }],
      ["string", "contentJson", { size: 50000, required: false }],
      ["string", "mediaLinksJson", { size: 8000, required: false }],
      ["integer", "revision", { required: false, min: 1, max: 1000000, default: 1 }],
      ["string", "submittedAt", { size: 40, required: false }],
      ["string", "approvedAt", { size: 40, required: false }],
      ["string", "repositoryItemId", { size: 64, required: false }],
      ["datetime", "createdAt", { required: true }],
      ["datetime", "updatedAt", { required: true }],
    ],
    indexes: [
      ["session_key", "unique", ["sessionKey"]],
      ["conference_reports", "key", ["conferenceId"]],
    ],
  },
  {
    id: "rec_rapporteur_comments",
    name: "REC Rapporteur Comments",
    attributes: [
      ["string", "reportId", { size: 64, required: true }],
      ["string", "authorEmail", { size: 180, required: false }],
      ["string", "authorName", { size: 120, required: false }],
      ["string", "authorRole", { size: 20, required: true }],
      ["string", "message", { size: 4000, required: true }],
      ["datetime", "createdAt", { required: true }],
    ],
    indexes: [
      ["report_comments", "key", ["reportId"]],
    ],
  },
]

function requireConfig() {
  if (!configuredEndpoint || !projectId || !apiKey || !databaseId) {
    throw new Error("Appwrite endpoint, project, database, and API key must be configured.")
  }
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

function collectionPath(collectionId, suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}${suffix}`
}

async function ensureCollection(collection) {
  const existing = await getOrNull(collectionPath(collection.id))
  if (existing) {
    console.log(`Collection present: ${collection.name}`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create collection: ${collection.name}`)
    return
  }
  await request(`/databases/${encodeURIComponent(databaseId)}/collections`, {
    method: "POST",
    body: {
      collectionId: collection.id,
      name: collection.name,
      permissions: [],
      documentSecurity: false,
      enabled: true,
    },
  })
  console.log(`Created collection: ${collection.name}`)
}

async function ensureAttribute(collectionId, type, key, body) {
  if (await getOrNull(collectionPath(collectionId, `/attributes/${encodeURIComponent(key)}`))) {
    console.log(`Attribute present: ${collectionId}.${key}`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create attribute: ${collectionId}.${key}`)
    return
  }
  await request(collectionPath(collectionId, `/attributes/${type}`), {
    method: "POST",
    body: { key, ...body },
  })
  console.log(`Created attribute: ${collectionId}.${key}`)
}

async function waitForAttributes(collectionId, keys) {
  if (!APPLY_SCHEMA) return
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const attributes = await Promise.all(
      keys.map((key) => getOrNull(collectionPath(collectionId, `/attributes/${encodeURIComponent(key)}`)))
    )
    const failed = attributes.find((attribute) => attribute?.status === "failed")
    if (failed) throw new Error(`Attribute creation failed: ${collectionId}.${failed.key}`)
    if (attributes.every((attribute) => attribute?.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for ${collectionId} attributes.`)
}

async function ensureIndex(collectionId, key, type, attributes) {
  if (await getOrNull(collectionPath(collectionId, `/indexes/${encodeURIComponent(key)}`))) {
    console.log(`Index present: ${collectionId}.${key}`)
    return
  }
  if (!APPLY_SCHEMA) {
    console.log(`Would create index: ${collectionId}.${key}`)
    return
  }
  await request(collectionPath(collectionId, "/indexes"), {
    method: "POST",
    body: { key, type, attributes, orders: attributes.map(() => "ASC") },
  })
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const index = await getOrNull(collectionPath(collectionId, `/indexes/${encodeURIComponent(key)}`))
    if (index?.status === "available") {
      console.log(`Created index: ${collectionId}.${key}`)
      return
    }
    if (index?.status === "failed") throw new Error(`Index creation failed: ${collectionId}.${key}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for index ${collectionId}.${key}`)
}

async function main() {
  requireConfig()
  console.log(`REC rapporteur schema ${APPLY_SCHEMA ? "migration" : "dry run"}`)
  for (const collection of COLLECTIONS) {
    await ensureCollection(collection)
    for (const [type, key, body] of collection.attributes) {
      await ensureAttribute(collection.id, type, key, body)
    }
    await waitForAttributes(collection.id, collection.attributes.map(([, key]) => key))
    for (const [key, type, attributes] of collection.indexes) {
      await ensureIndex(collection.id, key, type, attributes)
    }
  }
  console.log(APPLY_SCHEMA ? "REC rapporteur schema is ready." : "Dry run complete. Use --apply-schema to create it.")
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
