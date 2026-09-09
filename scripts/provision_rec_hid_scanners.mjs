import dotenv from "dotenv"

import { REC_TERA_HW0009_DEPLOYMENTS } from "../lib/rec-conference/scanning-rules.mjs"

dotenv.config({ path: ".env" })
dotenv.config({ path: ".env.local" })

const FORMAT = "1.9.0"
const configuredEndpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const endpoint = configuredEndpoint.endsWith("/v1") ? configuredEndpoint : `${configuredEndpoint}/v1`
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID

const collections = {
  allocations: process.env.NEXT_PUBLIC_REC_SCANNER_ALLOCATIONS_COLLECTION_ID || "scanner_allocations",
  eventScans: process.env.NEXT_PUBLIC_REC_EVENT_SCANS_COLLECTION_ID || "event_scans",
  crossFlags: process.env.NEXT_PUBLIC_REC_SESSION_CROSS_FLAGS_COLLECTION_ID || "session_cross_flags",
}

const HARDWARE_SEEDS = REC_TERA_HW0009_DEPLOYMENTS

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

function collectionPath(collectionId, suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}${suffix}`
}

async function ensureCollection(collectionId, name) {
  const existing = await getOrNull(collectionPath(collectionId))
  if (existing) {
    console.log(`Collection present: ${existing.name} (${collectionId})`)
    return existing
  }

  const created = await request(`/databases/${encodeURIComponent(databaseId)}/collections`, {
    method: "POST",
    body: {
      collectionId,
      name,
      permissions: ['read("any")', 'create("any")', 'update("any")', 'delete("any")'],
      documentSecurity: false,
      enabled: true,
    },
  })
  console.log(`Created collection: ${name} (${collectionId})`)
  return created
}

async function ensureAttribute(collectionId, type, key, body) {
  const path = collectionPath(collectionId, `/attributes/${encodeURIComponent(key)}`)
  if (await getOrNull(path)) {
    console.log(`Attribute present: ${collectionId}.${key}`)
    return
  }
  await request(collectionPath(collectionId, `/attributes/${type}`), {
    method: "POST",
    body: { key, ...body },
  })
  console.log(`Created ${type} attribute: ${collectionId}.${key}`)
}

async function waitForAttributes(collectionId, keys) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const attributes = await Promise.all(
      keys.map((key) => getOrNull(collectionPath(collectionId, `/attributes/${encodeURIComponent(key)}`)))
    )
    const failed = attributes.find((attribute) => attribute?.status === "failed")
    if (failed) throw new Error(`Attribute creation failed: ${collectionId}.${failed.key}`)
    if (attributes.every((attribute) => attribute?.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for attributes on ${collectionId}`)
}

async function waitForIndex(collectionId, key) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const index = await getOrNull(collectionPath(collectionId, `/indexes/${encodeURIComponent(key)}`))
    if (index?.status === "available") return
    if (index?.status === "failed") throw new Error(`Index creation failed: ${collectionId}.${key}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Timed out waiting for index ${collectionId}.${key}`)
}

async function ensureIndex(collectionId, key, attributes, type = "key") {
  const path = collectionPath(collectionId, `/indexes/${encodeURIComponent(key)}`)
  if (await getOrNull(path)) {
    console.log(`Index present: ${collectionId}.${key}`)
    return
  }
  await request(collectionPath(collectionId, "/indexes"), {
    method: "POST",
    body: { key, type, attributes, orders: [] },
  })
  await waitForIndex(collectionId, key)
  console.log(`Created index: ${collectionId}.${key}`)
}

async function ensureHardwareSeeds() {
  for (const unit of HARDWARE_SEEDS) {
    const path = `${collectionPath(collections.allocations)}/documents/${encodeURIComponent(unit.serialNumber)}`
    if (await getOrNull(path)) {
      console.log(`Allocation present: ${unit.serialNumber}`)
      continue
    }
    await request(`${collectionPath(collections.allocations)}/documents`, {
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
    console.log(`Seeded scanner ${unit.serialNumber} → ${unit.deployedLocation}`)
  }
}

async function main() {
  requireConfig()
  console.log(`Provisioning HID scanner schema in database ${databaseId}`)

  const database = await getOrNull(`/databases/${encodeURIComponent(databaseId)}`)
  if (!database) {
    throw new Error(`Database ${databaseId} was not found in this Appwrite project.`)
  }
  console.log(`Database present: ${database.name} (${database.$id})`)

  await ensureCollection(collections.allocations, "Scanner Allocations")
  await ensureAttribute(collections.allocations, "string", "serialNumber", { size: 32, required: true })
  await ensureAttribute(collections.allocations, "string", "assignedRole", { size: 128, required: true })
  await ensureAttribute(collections.allocations, "string", "deployedLocation", { size: 256, required: true })
  await ensureAttribute(collections.allocations, "string", "operatorId", { size: 64, required: false })
  await ensureAttribute(collections.allocations, "boolean", "isActive", { required: true })
  await waitForAttributes(collections.allocations, [
    "serialNumber",
    "assignedRole",
    "deployedLocation",
    "operatorId",
    "isActive",
  ])
  await ensureIndex(collections.allocations, "serialNumber_unique", ["serialNumber"], "unique")
  await ensureIndex(collections.allocations, "isActive_key", ["isActive"])

  await ensureCollection(collections.eventScans, "Event Scans")
  await ensureAttribute(collections.eventScans, "string", "participantId", { size: 128, required: true })
  await ensureAttribute(collections.eventScans, "string", "scannerSerial", { size: 32, required: true })
  await ensureAttribute(collections.eventScans, "string", "scanType", { size: 64, required: true })
  await ensureAttribute(collections.eventScans, "string", "deployedLocation", { size: 256, required: true })
  await ensureAttribute(collections.eventScans, "datetime", "scannedAt", { required: true })
  await ensureAttribute(collections.eventScans, "boolean", "isHopperScan", { required: true })
  await waitForAttributes(collections.eventScans, [
    "participantId",
    "scannerSerial",
    "scanType",
    "deployedLocation",
    "scannedAt",
    "isHopperScan",
  ])
  await ensureIndex(collections.eventScans, "participantId_scannedAt", ["participantId", "scannedAt"])
  await ensureIndex(collections.eventScans, "scannerSerial_key", ["scannerSerial"])

  await ensureCollection(collections.crossFlags, "Session Cross Flags")
  await ensureAttribute(collections.crossFlags, "string", "participantId", { size: 128, required: true })
  await ensureAttribute(collections.crossFlags, "string", "abandonedHall", { size: 256, required: true })
  await ensureAttribute(collections.crossFlags, "string", "joinedHall", { size: 256, required: true })
  await ensureAttribute(collections.crossFlags, "datetime", "flaggedAt", { required: true })
  await ensureAttribute(collections.crossFlags, "string", "description", { size: 512, required: false })
  await waitForAttributes(collections.crossFlags, [
    "participantId",
    "abandonedHall",
    "joinedHall",
    "flaggedAt",
    "description",
  ])
  await ensureIndex(collections.crossFlags, "participantId_flaggedAt", ["participantId", "flaggedAt"])

  await ensureHardwareSeeds()
  console.log("HID scanner Appwrite provisioning complete.")
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
