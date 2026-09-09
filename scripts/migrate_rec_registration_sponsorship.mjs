import fs from "node:fs/promises"
import path from "node:path"
import dotenv from "dotenv"
import { Query } from "node-appwrite"

dotenv.config({ path: ".env.local" })

const FORMAT = "1.9.0"
const APPLY_SCHEMA = process.argv.includes("--apply-schema")
const APPLY_BACKFILL = process.argv.includes("--apply-backfill")
const WRITE_REPORT = process.argv.includes("--write-report") || APPLY_BACKFILL

const endpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
const couponsCollectionId = process.env.NEXT_PUBLIC_REC_COUPONS_COLLECTION_ID
const registrationsCollectionId = process.env.NEXT_PUBLIC_REC_REGISTRATIONS_COLLECTION_ID

const sponsorshipAttributes = [
  ["string", "sponsorOrganization", { size: 250, required: false }],
  ["string", "sponsorSector", { size: 50, required: false }],
  ["string", "sponsorCouponId", { size: 36, required: false }],
]

const sponsorshipIndexes = [
  ["sponsor_organization", ["sponsorOrganization"]],
  ["sponsor_coupon_id", ["sponsorCouponId"]],
]

function requireConfig() {
  if (
    !endpoint ||
    !projectId ||
    !apiKey ||
    !databaseId ||
    !couponsCollectionId ||
    !registrationsCollectionId
  ) {
    throw new Error(
      "Appwrite endpoint, project, database, API key, coupons collection, and registrations collection must be configured."
    )
  }
}

function collectionPath(collectionId, suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}${suffix}`
}

function documentsPath(collectionId, suffix = "") {
  return `${collectionPath(collectionId)}/documents${suffix}`
}

async function request(pathname, { method = "GET", body, queries = [] } = {}) {
  const url = new URL(`${endpoint}${pathname}`)
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

async function ensureAttribute(type, key, options) {
  const attributePath = collectionPath(
    registrationsCollectionId,
    `/attributes/${encodeURIComponent(key)}`
  )
  const existing = await getOrNull(attributePath)
  if (existing) {
    console.log(`Attribute present: ${key}`)
    return
  }

  if (!APPLY_SCHEMA) {
    console.log(`Would create ${type} attribute: ${key}`)
    return
  }

  await request(collectionPath(registrationsCollectionId, `/attributes/${type}`), {
    method: "POST",
    body: { key, ...options },
  })
  console.log(`Created ${type} attribute: ${key}`)
}

async function waitForAttributes(keys) {
  if (!APPLY_SCHEMA) return

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const attributes = await Promise.all(
      keys.map((key) =>
        getOrNull(
          collectionPath(registrationsCollectionId, `/attributes/${encodeURIComponent(key)}`)
        )
      )
    )
    const failed = attributes.find((attribute) => attribute?.status === "failed")
    if (failed) throw new Error(`Attribute creation failed: ${failed.key}`)
    if (attributes.every((attribute) => attribute?.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error("Timed out waiting for REC registration sponsorship attributes.")
}

async function waitForIndex(key) {
  if (!APPLY_SCHEMA) return

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const index = await getOrNull(
      collectionPath(registrationsCollectionId, `/indexes/${encodeURIComponent(key)}`)
    )
    if (index?.status === "available") return
    if (index?.status === "failed") throw new Error(`Index creation failed: ${key}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Timed out waiting for REC registration index: ${key}`)
}

async function ensureIndex(key, attributes) {
  const indexPath = collectionPath(
    registrationsCollectionId,
    `/indexes/${encodeURIComponent(key)}`
  )
  if (await getOrNull(indexPath)) {
    console.log(`Index present: ${key}`)
    return
  }

  if (!APPLY_SCHEMA) {
    console.log(`Would create index: ${key} (${attributes.join(", ")})`)
    return
  }

  await request(collectionPath(registrationsCollectionId, "/indexes"), {
    method: "POST",
    body: { key, type: "key", attributes, orders: [] },
  })
  await waitForIndex(key)
  console.log(`Created index: ${key}`)
}

async function ensureSchema() {
  for (const [type, key, options] of sponsorshipAttributes) {
    await ensureAttribute(type, key, options)
  }
  await waitForAttributes(sponsorshipAttributes.map(([, key]) => key))

  for (const [key, attributes] of sponsorshipIndexes) {
    await ensureIndex(key, attributes)
  }
}

async function listAllDocuments(collectionId) {
  const documents = []
  let total = 0

  do {
    const page = await request(documentsPath(collectionId), {
      queries: [Query.limit(100), Query.offset(documents.length)],
    })
    documents.push(...(page.documents || []))
    total = Number(page.total || documents.length)
  } while (documents.length < total)

  return documents
}

function normalizeCouponCode(value) {
  return String(value || "").trim().toUpperCase()
}

function sponsorSnapshot(coupon) {
  return {
    sponsorOrganization: String(coupon.organization || "").trim(),
    sponsorSector: String(coupon.sector || "").trim(),
    sponsorCouponId: coupon.$id,
  }
}

function snapshotDiffers(registration, snapshot) {
  return Object.entries(snapshot).some(
    ([key, value]) => String(registration[key] || "") !== String(value || "")
  )
}

async function writeReport(report) {
  if (!WRITE_REPORT) return null

  const reportDirectory = path.resolve("migration-reports")
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
  const reportPath = path.join(reportDirectory, `rec_registration_sponsorship_${timestamp}.json`)
  await fs.mkdir(reportDirectory, { recursive: true })
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return reportPath
}

async function backfillSponsorship() {
  const [coupons, registrations] = await Promise.all([
    listAllDocuments(couponsCollectionId),
    listAllDocuments(registrationsCollectionId),
  ])
  const couponsByCode = new Map(
    coupons
      .map((coupon) => [normalizeCouponCode(coupon.coupon), coupon])
      .filter(([couponCode]) => couponCode)
  )

  const candidates = []
  const unmatched = []
  let withoutCoupon = 0
  let alreadyCurrent = 0

  for (const registration of registrations) {
    const couponCode = normalizeCouponCode(registration.coupon)
    if (!couponCode) {
      withoutCoupon += 1
      continue
    }

    const coupon = couponsByCode.get(couponCode)
    if (!coupon) {
      unmatched.push({
        registrationId: registration.$id,
        couponCode,
        conferenceYears: Array.isArray(registration.conferenceYears)
          ? registration.conferenceYears
          : [],
      })
      continue
    }

    const snapshot = sponsorSnapshot(coupon)
    if (!snapshot.sponsorOrganization) {
      unmatched.push({
        registrationId: registration.$id,
        couponCode,
        couponId: coupon.$id,
        conferenceYears: Array.isArray(registration.conferenceYears)
          ? registration.conferenceYears
          : [],
        reason: "Coupon has no sponsoring organization",
      })
      continue
    }

    if (!snapshotDiffers(registration, snapshot)) {
      alreadyCurrent += 1
      continue
    }

    candidates.push({ registration, snapshot })
  }

  let updated = 0
  if (APPLY_BACKFILL) {
    let cursor = 0
    const workers = Array.from({ length: 5 }, async () => {
      while (cursor < candidates.length) {
        const current = candidates[cursor]
        cursor += 1
        await request(
          documentsPath(
            registrationsCollectionId,
            `/${encodeURIComponent(current.registration.$id)}`
          ),
          {
            method: "PATCH",
            body: { data: current.snapshot },
          }
        )
        updated += 1
        if (updated % 50 === 0) {
          console.log(`Backfilled ${updated}/${candidates.length} registrations`)
        }
      }
    })
    await Promise.all(workers)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY_BACKFILL ? "applied" : "dry-run",
    databaseId,
    collectionIds: {
      coupons: couponsCollectionId,
      registrations: registrationsCollectionId,
    },
    counts: {
      coupons: coupons.length,
      registrations: registrations.length,
      withoutCoupon,
      alreadyCurrent,
      eligibleForBackfill: candidates.length,
      updated,
      unmatched: unmatched.length,
    },
    unmatched,
  }
  const reportPath = await writeReport(report)

  console.log(JSON.stringify(report.counts, null, 2))
  if (reportPath) console.log(`Migration report: ${reportPath}`)
  if (!APPLY_BACKFILL) {
    console.log("Backfill dry run complete. Use --apply-backfill after the schema is available.")
  }
}

async function main() {
  requireConfig()
  console.log(`REC registration sponsorship migration (${FORMAT})`)
  console.log(`Schema mode: ${APPLY_SCHEMA ? "apply" : "dry-run"}`)
  console.log(`Backfill mode: ${APPLY_BACKFILL ? "apply" : "dry-run"}`)

  await ensureSchema()
  await backfillSponsorship()
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
