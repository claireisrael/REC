import dotenv from "dotenv"
import { Query } from "node-appwrite"
import { REC_TERA_HW0009_DEPLOYMENTS } from "../lib/rec-conference/scanning-rules.mjs"

dotenv.config({ path: ".env" })

const FORMAT = "1.9.0"
const endpoint = "https://appwrite.nrep.ug/v1"

const source = {
  projectId: process.env.HR_APPWRITE_PROJECT_ID || "66bcc8450005201fa1af",
  apiKey: process.env.HR_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY,
  databaseId: process.env.HR_SOURCE_DATABASE_ID || "rec_system",
}

const target = {
  projectId: process.env.TARGET_APPWRITE_PROJECT_ID,
  apiKey: process.env.TARGET_APPWRITE_API_KEY,
  databaseId: process.env.TARGET_APPWRITE_DATABASE_ID || "rec_system",
  databaseName: process.env.TARGET_APPWRITE_DATABASE_NAME || "REC-SYSTEM",
  bucketId: process.env.TARGET_REC_BUCKET_ID || "rec_conference",
  bucketName: "REC Conference",
}

const REC_COLLECTION_IDS = [
  process.env.NEXT_PUBLIC_REC_CONFERENCES_COLLECTION_ID,
  process.env.NEXT_PUBLIC_REC_REGISTRATIONS_COLLECTION_ID,
  process.env.NEXT_PUBLIC_REC_COUPONS_COLLECTION_ID,
  process.env.REC_REGISTRATION_IMPORTS_COLLECTION_ID || "rec_registration_imports",
  process.env.REC_REGISTRATION_IMPORT_ROWS_COLLECTION_ID || "rec_registration_import_rows",
  process.env.REC_REGISTRATION_LOCKS_COLLECTION_ID || "rec_registration_locks",
  process.env.NEXT_PUBLIC_REC_SESSIONS_COLLECTION_ID,
  process.env.NEXT_PUBLIC_REC_PROGRAMMES_COLLECTION_ID,
  process.env.NEXT_PUBLIC_REC_PROGRAM_TIME_BLOCKS_COLLECTION_ID || "rec_program_time_blocks",
  process.env.NEXT_PUBLIC_REC_SPONSOR_CATEGORIES_COLLECTION_ID || "rec_sponsor_categories",
  process.env.NEXT_PUBLIC_REC_SPONSORS_COLLECTION_ID || "rec_sponsors",
  process.env.NEXT_PUBLIC_REC_MEDIA_ITEMS_COLLECTION_ID || "rec_media_items",
  process.env.NEXT_PUBLIC_REC_CONFERENCE_REPORTS_COLLECTION_ID || "rec_conference_reports",
  process.env.NEXT_PUBLIC_REC_SCAN_EVENTS_COLLECTION_ID || "rec_scan_events",
  process.env.NEXT_PUBLIC_REC_SCANS_COLLECTION_ID || "rec_scans",
  process.env.NEXT_PUBLIC_REC_BADGE_TOKENS_COLLECTION_ID || "rec_badge_tokens",
  process.env.NEXT_PUBLIC_REC_SCANNER_OPERATORS_COLLECTION_ID || "rec_scanner_operators",
  process.env.NEXT_PUBLIC_REC_SCANNER_OTPS_COLLECTION_ID || "rec_scanner_otps",
  process.env.NEXT_PUBLIC_REC_SCANNER_SESSIONS_COLLECTION_ID || "rec_scanner_sessions",
  "rec_registration_verifications",
  "rec_excursions",
  "rec_excursion_events",
  "scanner_allocations",
  "event_scans",
  "session_cross_flags",
].filter(Boolean)

const HARDWARE_SEEDS = REC_TERA_HW0009_DEPLOYMENTS

const COLLECTION_PERMISSIONS = ['read("any")', 'create("any")', 'update("any")', 'delete("any")']
const DOCUMENT_PERMISSIONS = ['read("any")', 'update("any")', 'delete("any")']

async function request(client, path, { method = "GET", body, queries = [], headers = {} } = {}) {
  const url = new URL(`${endpoint}${path}`)
  queries.forEach((query) => url.searchParams.append("queries[]", query))
  let lastError = null
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "X-Appwrite-Project": client.projectId,
          "X-Appwrite-Key": client.apiKey,
          "X-Appwrite-Response-Format": FORMAT,
          ...(body === undefined && headers["Content-Type"] === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body:
          body === undefined
            ? undefined
            : typeof body === "string" || body instanceof Buffer || body instanceof Uint8Array
              ? body
              : JSON.stringify(body),
      })
      if (response.status === 204) return null
      const contentType = response.headers.get("content-type") || ""
      const payload = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.arrayBuffer()
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${method} ${path} failed with ${response.status}`)
        lastError.status = response.status
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
        continue
      }
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && !(payload instanceof ArrayBuffer)
            ? payload.message
            : `${method} ${path} failed with ${response.status}`
        const error = new Error(message || `${method} ${path} failed with ${response.status}`)
        error.status = response.status
        error.type = payload?.type
        throw error
      }
      return payload
    } catch (error) {
      if (error.status && error.status !== 429 && error.status < 500) throw error
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
    }
  }
  throw lastError || new Error(`${method} ${path} failed`)
}

async function getOrNull(client, path) {
  try {
    return await request(client, path)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

function collectionPath(databaseId, collectionId, suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}${suffix}`
}

function attributeEndpoint(attribute) {
  if (attribute.format === "email") return "email"
  if (attribute.format === "url") return "url"
  if (attribute.format === "ip") return "ip"
  if (attribute.format === "enum" || attribute.type === "enum") return "enum"
  if (attribute.type === "integer") return "integer"
  if (attribute.type === "double" || attribute.type === "float") return "float"
  if (attribute.type === "boolean") return "boolean"
  if (attribute.type === "datetime") return "datetime"
  if (attribute.type === "relationship") return null
  return "string"
}

function attributeBody(attribute) {
  const body = {
    key: attribute.key,
    required: Boolean(attribute.required),
    array: Boolean(attribute.array),
  }
  const type = attributeEndpoint(attribute)
  if (type === "string") body.size = attribute.size || 255
  if (type === "enum") body.elements = attribute.elements || []
  if (type === "integer" || type === "float") {
    const min = Number(attribute.min)
    const max = Number(attribute.max)
    if (Number.isFinite(min) && Math.abs(min) <= Number.MAX_SAFE_INTEGER) body.min = min
    if (Number.isFinite(max) && max <= Number.MAX_SAFE_INTEGER && max >= -Number.MAX_SAFE_INTEGER) {
      body.max = max
    }
  }
  if (!attribute.required && attribute.default != null) body.default = attribute.default
  return body
}

async function waitForAttributes(collectionId, keys) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const attributes = await Promise.all(
      keys.map((key) => getOrNull(target, collectionPath(target.databaseId, collectionId, `/attributes/${encodeURIComponent(key)}`)))
    )
    const failed = attributes.find((attribute) => attribute?.status === "failed")
    if (failed) throw new Error(`Attribute failed: ${collectionId}.${failed.key} ${failed.error || ""}`)
    if (attributes.every((attribute) => attribute?.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for attributes on ${collectionId}`)
}

async function waitForIndex(collectionId, key) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const index = await getOrNull(target, collectionPath(target.databaseId, collectionId, `/indexes/${encodeURIComponent(key)}`))
    if (index?.status === "available") return
    if (index?.status === "failed") throw new Error(`Index failed: ${collectionId}.${key}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for index ${collectionId}.${key}`)
}

async function ensureDatabase() {
  const existing = await getOrNull(target, `/databases/${encodeURIComponent(target.databaseId)}`)
  if (existing) {
    console.log(`Database present: ${existing.name} (${existing.$id})`)
    return existing
  }
  const created = await request(target, "/databases", {
    method: "POST",
    body: {
      databaseId: target.databaseId,
      name: target.databaseName,
      enabled: true,
    },
  })
  console.log(`Created database: ${created.name} (${created.$id})`)
  return created
}

async function cloneCollection(collectionId) {
  const sourceCollection = await getOrNull(source, collectionPath(source.databaseId, collectionId))
  if (!sourceCollection) {
    console.log(`Skip missing source collection: ${collectionId}`)
    return { collectionId, copied: 0, skipped: true }
  }

  let targetCollection = await getOrNull(target, collectionPath(target.databaseId, collectionId))
  if (!targetCollection) {
    targetCollection = await request(target, `/databases/${encodeURIComponent(target.databaseId)}/collections`, {
      method: "POST",
      body: {
        collectionId,
        name: sourceCollection.name,
        permissions: COLLECTION_PERMISSIONS,
        documentSecurity: false,
        enabled: sourceCollection.enabled !== false,
      },
    })
    console.log(`Created collection: ${sourceCollection.name} (${collectionId})`)
  } else {
    console.log(`Collection present: ${targetCollection.name} (${collectionId})`)
  }

  const cloneable = (sourceCollection.attributes || []).filter((attribute) => attributeEndpoint(attribute))
  const existingAttributeKeys = new Set((targetCollection.attributes || []).map((attribute) => attribute.key))
  const pendingAttributeKeys = []
  for (const attribute of cloneable) {
    if (existingAttributeKeys.has(attribute.key)) continue
    const type = attributeEndpoint(attribute)
    try {
      await request(target, collectionPath(target.databaseId, collectionId, `/attributes/${type}`), {
        method: "POST",
        body: attributeBody(attribute),
      })
      pendingAttributeKeys.push(attribute.key)
      console.log(`  attribute ${collectionId}.${attribute.key}`)
    } catch (error) {
      if (String(error.message || "").includes("already exists")) {
        pendingAttributeKeys.push(attribute.key)
        console.log(`  attribute present ${collectionId}.${attribute.key}`)
        continue
      }
      throw error
    }
  }
  if (pendingAttributeKeys.length) {
    await waitForAttributes(collectionId, pendingAttributeKeys)
  }

  const existingIndexKeys = new Set((targetCollection.indexes || []).map((index) => index.key))
  for (const index of sourceCollection.indexes || []) {
    if (existingIndexKeys.has(index.key)) continue
    try {
      await request(target, collectionPath(target.databaseId, collectionId, "/indexes"), {
        method: "POST",
        body: {
          key: index.key,
          type: index.type,
          attributes: index.attributes,
          orders: (index.orders || []).filter((order) => order === "asc" || order === "desc").length
            ? index.orders
            : index.attributes.map(() => "asc"),
        },
      })
      await waitForIndex(collectionId, index.key)
      console.log(`  index ${collectionId}.${index.key}`)
    } catch (error) {
      console.log(`  skip index ${collectionId}.${index.key}: ${error.message}`)
    }
  }

  const attributeKeys = cloneable.map((attribute) => attribute.key)
  const existingIds = new Set()
  let existingOffset = 0
  while (true) {
    const existingPage = await request(target, collectionPath(target.databaseId, collectionId, "/documents"), {
      queries: [Query.limit(100), Query.offset(existingOffset)],
    })
    const existingDocs = existingPage.documents || []
    existingDocs.forEach((document) => existingIds.add(document.$id))
    existingOffset += existingDocs.length
    if (!existingDocs.length || existingOffset >= (existingPage.total || existingOffset)) break
  }

  let copied = existingIds.size
  let created = 0
  let offset = 0
  while (true) {
    const page = await request(source, collectionPath(source.databaseId, collectionId, "/documents"), {
      queries: [Query.limit(100), Query.offset(offset)],
    })
    const documents = page.documents || []
    if (!documents.length) break

    for (const document of documents) {
      if (existingIds.has(document.$id)) continue
      const data = {}
      for (const key of attributeKeys) {
        const value = document[key]
        if (value === undefined) continue
        if (value === "") continue
        data[key] = value
      }
      try {
        await request(target, collectionPath(target.databaseId, collectionId, "/documents"), {
          method: "POST",
          body: {
            documentId: document.$id,
            data,
            permissions: DOCUMENT_PERMISSIONS,
          },
        })
        existingIds.add(document.$id)
        created += 1
        copied += 1
        if (created % 50 === 0) console.log(`  copied ${copied} documents`)
      } catch (error) {
        console.log(`  skip document ${document.$id}: ${error.message}`)
      }
    }

    offset += documents.length
    if (offset >= (page.total || offset)) break
  }

  console.log(`  copied ${copied} documents`)
  return { collectionId, copied, skipped: false }
}

async function seedHardware() {
  for (const unit of HARDWARE_SEEDS) {
    const path = collectionPath(target.databaseId, "scanner_allocations", `/documents/${encodeURIComponent(unit.serialNumber)}`)
    if (await getOrNull(target, path)) continue
    await request(target, collectionPath(target.databaseId, "scanner_allocations", "/documents"), {
      method: "POST",
      body: {
        documentId: unit.serialNumber,
        data: {
          serialNumber: unit.serialNumber,
          assignedRole: unit.assignedRole,
          deployedLocation: unit.deployedLocation,
          operatorId: "",
          isActive: true,
        },
        permissions: DOCUMENT_PERMISSIONS,
      },
    })
    console.log(`Seeded scanner ${unit.serialNumber}`)
  }
}

async function ensureBucket() {
  const existing = await getOrNull(target, `/storage/buckets/${encodeURIComponent(target.bucketId)}`)
  if (existing) {
    console.log(`Bucket present: ${existing.name} (${existing.$id})`)
    return existing
  }
  const created = await request(target, "/storage/buckets", {
    method: "POST",
    body: {
      bucketId: target.bucketId,
      name: target.bucketName,
      permissions: COLLECTION_PERMISSIONS,
      fileSecurity: false,
      enabled: true,
      maximumFileSize: 30000000,
      allowedFileExtensions: [],
      compression: "none",
      encryption: false,
      antivirus: false,
    },
  })
  console.log(`Created bucket: ${created.name} (${created.$id})`)
  return created
}

async function main() {
  if (!source.apiKey || !target.projectId || !target.apiKey) {
    throw new Error("Source key, target project, and target key must be set")
  }

  const sourceProject = await request(source, "/databases")
  const targetProject = await request(target, "/databases")
  console.log(`Source project ${source.projectId} databases=${sourceProject.total}`)
  console.log(`Target project ${target.projectId} databases=${targetProject.total}`)

  await ensureDatabase()
  await ensureBucket()

  const uniqueIds = [...new Set(REC_COLLECTION_IDS)]
  for (const collectionId of uniqueIds) {
    await cloneCollection(collectionId)
  }

  await seedHardware()
  console.log(`Done. REC-SYSTEM now belongs in project ${target.projectId}, database ${target.databaseId}, bucket ${target.bucketId}.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
