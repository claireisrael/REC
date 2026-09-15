import { Query } from "node-appwrite"
import {
  createRestDocument,
  listRestDocuments,
} from "@/lib/appwrite/appwrite-rest-server"
import { config } from "@/lib/appwrite/config"
import {
  HID_SCAN_CODES,
  REC_TERA_HW0009_SERIALS,
  SESSION_HOPPER_WINDOW_MS,
  evaluateHidScanRules,
  isExhibitionHallLocation,
  isExhibitionRowAssignment,
  isSessionHallLocation,
  isSessionHopperScan,
  normalizeHidSerial,
  parseHidQrParticipantId,
} from "@/lib/rec-conference/scanning-rules.mjs"
import {
  assertScannerOperatorAccess,
  createTeraStationSession,
  getTeraOperatorForAllocation,
  listTeraStationEvents,
  recordTeraStationScan,
  resolveConferenceIdForTeraScan,
  touchScannerOperatorLastLogin,
} from "@/lib/rec-conference/scanning-server"

export { REC_TERA_HW0009_SERIALS }

export class HidScanError extends Error {
  constructor(code, status = 422) {
    super(code)
    this.name = "HidScanError"
    this.code = code
    this.status = status
  }
}

function assertCollection(collectionId, label) {
  if (!collectionId) {
    throw new Error(`${label} collection is not configured`)
  }
}

function publicAllocation(document) {
  if (!document) return null
  return {
    $id: document.$id,
    serialNumber: document.serialNumber || "",
    assignedRole: document.assignedRole || "",
    deployedLocation: document.deployedLocation || "",
    operatorId: document.operatorId || "",
    isActive: document.isActive !== false,
  }
}

export function listTeraHardwareInventory() {
  return REC_TERA_HW0009_SERIALS.map((serialNumber) => ({ serialNumber }))
}

export async function getActiveScannerAllocation(serialNumber) {
  const serial = normalizeHidSerial(serialNumber)
  if (!serial) return null

  assertCollection(config.recScannerAllocationsCollectionId, "scanner_allocations")
  const result = await listRestDocuments(config.recScannerAllocationsCollectionId, [
    Query.equal("serialNumber", serial),
    Query.equal("isActive", true),
    Query.limit(1),
  ])

  return publicAllocation(result.documents?.[0] || null)
}

export async function getTeraStationHandshake(serialNumber, request) {
  const allocation = await getActiveScannerAllocation(serialNumber)
  if (!allocation) return null

  const operator = await getTeraOperatorForAllocation(allocation)
  if (operator) {
    assertScannerOperatorAccess(operator, { conferenceId: operator.conferenceId })
    await touchScannerOperatorLastLogin(operator.$id)
  }

  const conferenceId = await resolveConferenceIdForTeraScan("").catch(() => "")
  const events = conferenceId
    ? await listTeraStationEvents(allocation, { conferenceId }).catch(() => [])
    : []

  // Every subsequent request from this station (scan submissions, alerts,
  // tally) must present this token - the serial alone no longer grants
  // access past this handshake step.
  const session = await createTeraStationSession({ allocation, conferenceId, operator }, request)

  return {
    allocation,
    operator,
    events,
    openEvents: events.filter((event) => event.isCurrentlyOpen),
    session,
  }
}

export async function findActiveBreakoutSession(deployedLocation, now = new Date()) {
  if (!config.recSessionsCollectionId || !isSessionHallLocation(deployedLocation)) {
    return null
  }

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)
  if (Number.isNaN(nowMs)) return null

  const result = await listRestDocuments(config.recSessionsCollectionId, [Query.limit(100)])
  const location = String(deployedLocation || "").trim().toLowerCase()

  return (result.documents || []).find((session) => {
    const status = String(session.status || "").toUpperCase()
    if (!["ONGOING", "PUBLISHED"].includes(status)) return false

    const venue = String(session.venueHall || session.venue || "").trim().toLowerCase()
    if (!venue || (!venue.includes(location) && !location.includes(venue))) return false

    const startMs = Date.parse(session.startTime)
    const endMs = Date.parse(session.toTime || session.endTime)
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false
    return nowMs >= startMs && nowMs <= endMs
  }) || null
}

export async function findRecentParticipantScan(participantId, scannedAt) {
  const scannedAtMs = Date.parse(scannedAt)
  const windowStart = new Date(scannedAtMs - SESSION_HOPPER_WINDOW_MS).toISOString()
  const collectionId = config.recScansCollectionId || config.recEventScansCollectionId
  assertCollection(collectionId, "scans")

  const queries = config.recScansCollectionId
    ? [
        Query.equal("registrationId", participantId),
        Query.equal("status", "accepted"),
        Query.greaterThanEqual("scannedAt", windowStart),
        Query.orderDesc("scannedAt"),
        Query.limit(25),
      ]
    : [
        Query.equal("participantId", participantId),
        Query.greaterThanEqual("scannedAt", windowStart),
        Query.orderDesc("scannedAt"),
        Query.limit(25),
      ]

  const result = await listRestDocuments(collectionId, queries)
  const currentMs = scannedAtMs
  return (result.documents || []).find((scan) => {
    const scanMs = Date.parse(scan.scannedAt)
    return Number.isFinite(scanMs) && scanMs < currentMs && scanMs >= scannedAtMs - SESSION_HOPPER_WINDOW_MS
  }) || null
}

export async function recordSessionCrossFlag({
  participantId,
  abandonedHall,
  joinedHall,
  flaggedAt,
}) {
  assertCollection(config.recSessionCrossFlagsCollectionId, "session_cross_flags")
  return createRestDocument(config.recSessionCrossFlagsCollectionId, {
    participantId,
    abandonedHall,
    joinedHall,
    flaggedAt,
    description: `Participant moved from ${abandonedHall} to ${joinedHall} within 90 minutes.`,
  })
}

export async function recordHidEventScan(payload) {
  assertCollection(config.recEventScansCollectionId, "event_scans")
  return createRestDocument(config.recEventScansCollectionId, payload)
}

export async function processHidScannerCapture({ serialNumber, qrData }, now = new Date()) {
  const serial = normalizeHidSerial(serialNumber)
  if (!serial) {
    throw new HidScanError(HID_SCAN_CODES.DEVICE_UNREGISTERED, 403)
  }

  const allocation = await getActiveScannerAllocation(serial)
  if (!allocation) {
    throw new HidScanError(HID_SCAN_CODES.DEVICE_UNREGISTERED, 403)
  }

  if (isExhibitionRowAssignment(allocation.assignedRole) && !isExhibitionHallLocation(allocation.deployedLocation)) {
    throw new HidScanError(HID_SCAN_CODES.EXHIBITOR_DEVICE_RESTRICTED, 422)
  }

  const qrPayload = String(qrData || parseHidQrParticipantId(qrData) || "").trim()
  if (!qrPayload) {
    throw new HidScanError(HID_SCAN_CODES.MISSING_QR_DATA, 422)
  }

  const scannedAtDate = now instanceof Date ? now : new Date(now)
  const activeSession = await findActiveBreakoutSession(allocation.deployedLocation, scannedAtDate)
  const hidDecision = evaluateHidScanRules({
    assignedRole: allocation.assignedRole,
    deployedLocation: allocation.deployedLocation,
    now: scannedAtDate,
    isBreakoutSessionActive: Boolean(activeSession),
  })

  const recorded = await recordTeraStationScan({
    qrPayload,
    allocation,
    serialNumber: serial,
    now: scannedAtDate,
    isBreakoutSessionActive: Boolean(activeSession),
  })

  const registrationId = recorded.registration?.$id || parseHidQrParticipantId(qrPayload)
  const scannedAt = recorded.scan?.scannedAt || scannedAtDate.toISOString()
  const scanType = recorded.event?.type || hidDecision.scanType || ""
  let hopperDetected = false
  let hopperFlag = null

  if (recorded.status === "accepted" && isSessionHallLocation(allocation.deployedLocation) && registrationId) {
    const previousScan = await findRecentParticipantScan(registrationId, scannedAt)
    hopperDetected = isSessionHopperScan(
      previousScan ? { deployedLocation: previousScan.deployedLocation || previousScan.venue } : null,
      allocation.deployedLocation
    )
    if (hopperDetected) {
      hopperFlag = await recordSessionCrossFlag({
        participantId: registrationId,
        abandonedHall: previousScan.deployedLocation || previousScan.venue,
        joinedHall: allocation.deployedLocation,
        flaggedAt: scannedAt,
      })
    }
  }

  if (config.recEventScansCollectionId && recorded.status === "accepted") {
    await recordHidEventScan({
      participantId: registrationId,
      scannerSerial: serial,
      scanType,
      deployedLocation: allocation.deployedLocation,
      scannedAt,
      isHopperScan: hopperDetected,
    }).catch(() => null)
  }

  return {
    ok: recorded.status !== "rejected",
    status: recorded.status,
    reason: recorded.reason || "",
    scanType,
    hopperDetected,
    scannedAt,
    participantId: registrationId,
    scannerSerial: serial,
    deployedLocation: allocation.deployedLocation,
    assignedRole: allocation.assignedRole,
    registration: recorded.registration || null,
    event: recorded.event || null,
    attendance: recorded.attendance || null,
    scan: recorded.scan || null,
    previousScan: recorded.previousScan || null,
    hopperFlag: hopperFlag
      ? {
          $id: hopperFlag.$id,
          abandonedHall: hopperFlag.abandonedHall,
          joinedHall: hopperFlag.joinedHall,
          flaggedAt: hopperFlag.flaggedAt,
        }
      : null,
  }
}
