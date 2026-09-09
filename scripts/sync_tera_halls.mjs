import dotenv from "dotenv"
import { Query } from "node-appwrite"
import {
  getTeraStationEventTypes,
  REC_TERA_HW0009_DEPLOYMENTS,
  teraOperatorEmail,
} from "../lib/rec-conference/scanning-rules.mjs"

dotenv.config({ path: ".env" })

const FORMAT = "1.9.0"
const endpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
const operatorsId = process.env.NEXT_PUBLIC_REC_SCANNER_OPERATORS_COLLECTION_ID || "rec_scanner_operators"
const allocationsId = process.env.NEXT_PUBLIC_REC_SCANNER_ALLOCATIONS_COLLECTION_ID || "scanner_allocations"
const conferencesId = process.env.NEXT_PUBLIC_REC_CONFERENCES_COLLECTION_ID

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
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || `${method} ${path} ${response.status}`)
  return payload
}

const conferences = await request(`/databases/${databaseId}/collections/${conferencesId}/documents`, {
  queries: [Query.limit(100)],
})
const conference = (conferences.documents || []).find((item) => item.isActive) || (conferences.documents || [])[0]
if (!conference) throw new Error("No conference found")

console.log("Syncing Tera halls for", conference.title, conference.$id)

for (const unit of REC_TERA_HW0009_DEPLOYMENTS) {
  const email = teraOperatorEmail(unit.serialNumber)
  const eventTypes = getTeraStationEventTypes(unit.assignedRole, unit.deployedLocation)
  const existing = await request(`/databases/${databaseId}/collections/${operatorsId}/documents`, {
    queries: [Query.equal("conferenceId", conference.$id), Query.equal("email", email), Query.limit(1)],
  })
  let operator = existing.documents?.[0]
  const payload = {
    conferenceId: conference.$id,
    email,
    name: `Tera ${unit.serialNumber} · ${unit.deployedLocation}`,
    organization: "Tera HW0009",
    phone: unit.serialNumber,
    status: "active",
    allowedEventTypes: eventTypes,
    allowedEventIds: operator?.allowedEventIds || [],
    allowedVenues: [unit.deployedLocation],
    allowedDays: operator?.allowedDays || [],
    ...(operator?.accessStartsAt ? { accessStartsAt: operator.accessStartsAt } : {}),
    ...(operator?.accessEndsAt ? { accessEndsAt: operator.accessEndsAt } : {}),
  }

  if (!operator) {
    operator = await request(`/databases/${databaseId}/collections/${operatorsId}/documents`, {
      method: "POST",
      body: { documentId: `tera_${unit.serialNumber}`, data: payload },
    })
    console.log("created operator", unit.serialNumber, unit.deployedLocation)
  } else {
    operator = await request(`/databases/${databaseId}/collections/${operatorsId}/documents/${operator.$id}`, {
      method: "PATCH",
      body: { data: payload },
    })
    console.log("updated operator", unit.serialNumber, unit.deployedLocation)
  }

  const allocationData = {
    serialNumber: unit.serialNumber,
    assignedRole: unit.assignedRole,
    deployedLocation: unit.deployedLocation,
    operatorId: operator.$id,
    isActive: true,
  }
  try {
    await request(`/databases/${databaseId}/collections/${allocationsId}/documents/${unit.serialNumber}`, {
      method: "PATCH",
      body: { data: allocationData },
    })
  } catch {
    await request(`/databases/${databaseId}/collections/${allocationsId}/documents`, {
      method: "POST",
      body: { documentId: unit.serialNumber, data: allocationData },
    })
  }
}

console.log("Done")
