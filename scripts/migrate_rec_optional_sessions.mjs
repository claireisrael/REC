import dotenv from "dotenv"
import { Query } from "node-appwrite"

dotenv.config({ path: ".env.local" })
dotenv.config({ path: ".env" })

const FORMAT = "1.9.0"
const APPLY_SCHEMA = process.argv.includes("--apply-schema")

const endpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
const registrationsCollectionId = process.env.NEXT_PUBLIC_REC_REGISTRATIONS_COLLECTION_ID

function collectionPath(suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(registrationsCollectionId)}${suffix}`
}

async function request(pathname, { method = "GET", body } = {}) {
  const url = new URL(`${endpoint}${pathname}`)
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
    const error = new Error(payload?.message || `${method} ${pathname} failed with ${response.status}`)
    error.status = response.status
    throw error
  }
  return payload
}

async function getOrNull(pathname) {
  try {
    return await request(pathname)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function ensureAttribute() {
  const key = "additionalSessions"
  const existing = await getOrNull(collectionPath(`/attributes/${encodeURIComponent(key)}`))
  if (existing) {
    console.log(`Attribute present: ${key}`)
    return existing
  }

  if (!APPLY_SCHEMA) {
    console.log(`Would create string[] attribute: ${key}`)
    return null
  }

  await request(collectionPath("/attributes/string"), {
    method: "POST",
    body: {
      key,
      size: 64,
      required: false,
      array: true,
    },
  })
  console.log(`Created string[] attribute: ${key}`)
  return true
}

async function waitForAttribute() {
  if (!APPLY_SCHEMA) return
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const attribute = await getOrNull(collectionPath("/attributes/additionalSessions"))
    const status = String(attribute?.status || "").toLowerCase()
    if (status === "available") {
      console.log("Attribute additionalSessions is available")
      return
    }
    if (status === "failed") {
      throw new Error("Appwrite failed to create additionalSessions")
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error("Timed out waiting for additionalSessions")
}

if (!endpoint || !projectId || !apiKey || !databaseId || !registrationsCollectionId) {
  throw new Error("Appwrite registration collection configuration is missing.")
}

console.log(APPLY_SCHEMA ? "Applying additionalSessions schema" : "Dry run additionalSessions schema")
await ensureAttribute()
await waitForAttribute()
console.log("Done")
void Query
