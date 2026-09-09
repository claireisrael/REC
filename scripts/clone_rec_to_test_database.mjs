import dotenv from "dotenv"
import { Query } from "node-appwrite"
import { REC_TERA_HW0009_DEPLOYMENTS } from "../lib/rec-conference/scanning-rules.mjs"

dotenv.config({ path: ".env" })

const FORMAT = "1.9.0"
const configuredEndpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const endpoint = configuredEndpoint.endsWith("/v1") ? configuredEndpoint : `${configuredEndpoint}/v1`
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const sourceDatabaseId = "66bcc8760033a24883f6"
const targetDatabaseId = "rec_system"
const targetDatabaseName = "REC-SYSTEM Test"

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

const HID_COLLECTION_IDS = ["scanner_allocations", "event_scans", "session_cross_flags"]

const HARDWARE_SEEDS = REC_TERA_HW0009_DEPLOYMENTS

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
    const error = new Error(payload?.message || `${method} ${path} failed with ${response.status}`)
    error.status = response.status
    error.type = payload?.type
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
  const endpointType = attributeEndpoint(attribute)
  if (endpointType === "string") body.size = attribute.size || 255
  if (endpointType === "enum") body.elements = attribute.elements || []
  if (endpointType === "integer" || endpointType === "float") {
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

async function waitForAttributes(databaseId, collectionId, keys) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const attributes = await Promise.all(
      keys.map((key) => getOrNull(collectionPath(databaseId, collectionId, `/attributes/${encodeURIComponent(key)}`)))
    )
    const failed = attributes.find((attribute) => attribute?.status === "failed")
    if (failed) throw new Error(`Attribute failed: ${collectionId}.${failed.key} ${failed.error || ""}`)
    if (attributes.every((attribute) => attribute?.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for attributes on ${collectionId}`)
}

async function waitForIndex(databaseId, collectionId, key) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const index = await getOrNull(collectionPath(databaseId, collectionId, `/indexes/${encodeURIComponent(key)}`))
    if (index?.status === "available") return
    if (index?.status === "failed") throw new Error(`Index failed: ${collectionId}.${key}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for index ${collectionId}.${key}`)
}

async function ensureDatabase() {
  const existing = await getOrNull(`/databases/${encodeURIComponent(targetDatabaseId)}`)
  if (existing) {
    console.log(`Database present: ${existing.name} (${existing.$id})`)
    return existing
  }
  const created = await request("/databases", {
    method: "POST",
    body: {
      databaseId: targetDatabaseId,
      name: targetDatabaseName,
      enabled: true,
    },
  })
  console.log(`Created database: ${created.name} (${created.$id})`)
  return created
}

async function cloneCollection(collectionId) {
  const source = await getOrNull(collectionPath(sourceDatabaseId, collectionId))
  if (!source) {
    console.log(`Skip missing source collection: ${collectionId}`)
    return { collectionId, copied: 0, skipped: true }
  }

  let target = await getOrNull(collectionPath(targetDatabaseId, collectionId))
  if (!target) {
    target = await request(`/databases/${encodeURIComponent(targetDatabaseId)}/collections`, {
      method: "POST",
      body: {
        collectionId,
        name: source.name,
        permissions: source.$permissions || [],
        documentSecurity: Boolean(source.documentSecurity),
        enabled: source.enabled !== false,
      },
    })
    console.log(`Created collection: ${source.name} (${collectionId})`)
  } else {
    console.log(`Collection present: ${target.name} (${collectionId})`)
  }

  const cloneable = (source.attributes || []).filter((attribute) => attributeEndpoint(attribute))
  for (const attribute of cloneable) {
    const existing = await getOrNull(
      collectionPath(targetDatabaseId, collectionId, `/attributes/${encodeURIComponent(attribute.key)}`)
    )
    if (existing) continue
    const type = attributeEndpoint(attribute)
    await request(collectionPath(targetDatabaseId, collectionId, `/attributes/${type}`), {
      method: "POST",
      body: attributeBody(attribute),
    })
    console.log(`  attribute ${collectionId}.${attribute.key}`)
  }
  if (cloneable.length) {
    await waitForAttributes(targetDatabaseId, collectionId, cloneable.map((attribute) => attribute.key))
  }

  for (const index of source.indexes || []) {
    const existing = await getOrNull(
      collectionPath(targetDatabaseId, collectionId, `/indexes/${encodeURIComponent(index.key)}`)
    )
    if (existing) continue
    try {
      await request(collectionPath(targetDatabaseId, collectionId, "/indexes"), {
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
      await waitForIndex(targetDatabaseId, collectionId, index.key)
      console.log(`  index ${collectionId}.${index.key}`)
    } catch (error) {
      console.log(`  skip index ${collectionId}.${index.key}: ${error.message}`)
    }
  }

  const attributeKeys = cloneable.map((attribute) => attribute.key)
  const existingIds = new Set()
  let existingOffset = 0
  while (true) {
    const existingPage = await request(collectionPath(targetDatabaseId, collectionId, "/documents"), {
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
    const page = await request(collectionPath(sourceDatabaseId, collectionId, "/documents"), {
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
        await request(collectionPath(targetDatabaseId, collectionId, "/documents"), {
          method: "POST",
          body: {
            documentId: document.$id,
            data,
          },
        })
        existingIds.add(document.$id)
        created += 1
        copied += 1
        if (created % 25 === 0) console.log(`  copied ${copied} documents`)
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
    const path = collectionPath(targetDatabaseId, "scanner_allocations", `/documents/${encodeURIComponent(unit.serialNumber)}`)
    if (await getOrNull(path)) continue
    await request(collectionPath(targetDatabaseId, "scanner_allocations", "/documents"), {
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
      },
    })
    console.log(`Seeded scanner ${unit.serialNumber}`)
  }
}

async function deleteHidFromHr() {
  for (const collectionId of HID_COLLECTION_IDS) {
    const existing = await getOrNull(collectionPath(sourceDatabaseId, collectionId))
    if (!existing) {
      console.log(`HR already clean: ${collectionId}`)
      continue
    }
    await request(collectionPath(sourceDatabaseId, collectionId), { method: "DELETE" })
    console.log(`Deleted from HR: ${collectionId}`)
  }
}

async function main() {
  if (!configuredEndpoint || !projectId || !apiKey) {
    throw new Error("Appwrite endpoint, project, and API key must be set")
  }

  console.log(`Cloning REC collections HR (${sourceDatabaseId}) -> ${targetDatabaseId}`)
  await ensureDatabase()

  const uniqueIds = [...new Set(REC_COLLECTION_IDS)]
  for (const collectionId of uniqueIds) {
    await cloneCollection(collectionId)
  }

  await seedHardware()
  await deleteHidFromHr()
  console.log("Done. Point NEXT_PUBLIC_APPWRITE_DATABASE_ID at rec_system.")
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
