import crypto from "crypto"
import { randomInt, randomUUID } from "crypto"
import QRCode from "qrcode"
import { Query } from "node-appwrite"
import { after } from "next/server"
import {
  createRestDocument,
  createRestDocumentWithId,
  deleteRestDocument,
  getRestDocument,
  listRestDocuments,
  updateRestDocument,
} from "@/lib/appwrite/appwrite-rest-server"
import { config } from "@/lib/appwrite/config"
import {
  evaluateHidScanRules,
  eventMatchesOperatorRestrictions,
  formatTeraScanDeviceLabel,
  formatTeraScannerName,
  getRecScanAttendanceEligibility,
  isUnregisteredRecRegistration,
  unregisteredAttendeeAllowedAtEvent,
  getRecScanEventBulkDeleteValidationError,
  getRecScanEventRequiredAttendanceDays,
  getRecScanEventWindowError,
  getRecScanEventWindowStatus,
  getRecScannerOperatorValidationError,
  getRecScanConfirmationCopy,
  getTeraStationEventTypes,
  hidScanTypeToEventType,
  isTeraScannerOperator,
  expandRecBadgeNumberCandidates,
  expandRecBadgeTokenCandidates,
  recoverRecBadgeTokenFromUrl,
  formatRecBadgeNumber,
  formatRecEdition,
  buildRecBadgeNumber,
  nextRecBadgeSequence,
  normalizeRecBadgeNumber,
  normalizeRecScanEventIds,
  parseTeraSerialFromOperator,
  REC_TERA_HW0009_DEPLOYMENTS,
  REC_WEB_APP_URL,
  resolveTeraOperatorAccess,
  explainMissingTeraScanEvent,
  selectTeraScanEvent,
  shouldRevokeRecScannerCredentials,
  shouldSendRecScanConfirmationEmail,
  teraOperatorEmail,
  venueMatchesAllowedList,
} from "@/lib/rec-conference/scanning-rules.mjs"
import {
  applyProgrammeSessionSync,
  isParentProgrammeConfigured,
  listParentConferenceSessions,
  parentProgrammeSettings,
  programmeDocumentChanged,
  programmeDocumentFromParent,
  shouldRefreshParentSync,
  PARENT_SYNC_MAX_AGE_MS,
} from "@/lib/rec-conference/parent-programme.mjs"
import {
  formatRecParticipantCategory,
  formatRecParticipantCategoryTag,
  getRecBadgeConferenceTitle,
  getRecParticipantCategoryDirection,
  getRecParticipantCategoryValue,
  isRecParticipantCategoryValue,
  normalizeRecOptionalSessions,
} from "@/lib/rec-conference/registration-tracks.mjs"
import {
  attributeRecScannerOperatorScans,
  buildRecScanAlerts,
  buildRecScanAnalytics,
  buildRecScanLogRows,
  buildRecScannerLeaderboard,
  buildRecScanRegistrantRows,
  filterRecScanLogRows,
  filterRecScanRegistrantRows,
  getRecRegistrantName,
  getRecScannerRankInfo,
  paginateRecAnalyticsRows,
  rowsToRecAnalyticsCsv,
} from "@/lib/rec-conference/scanning-analytics.mjs"

export const SCAN_EVENT_TYPES = {
  CONFERENCE_ENTRY: "conference_entry",
  LUNCH: "lunch",
  SESSION_ENTRY: "session_entry",
  CUSTOM: "custom",
}

export const SCAN_RULES = {
  ONCE_PER_EVENT: "once_per_event",
  ONCE_PER_DAY: "once_per_day",
  MULTIPLE: "multiple",
}

export const SCAN_STATUSES = {
  ACCEPTED: "accepted",
  DUPLICATE: "duplicate",
  REJECTED: "rejected",
  MANUAL_OVERRIDE: "manual_override",
}

const QR_PREFIX = "rec:v1:"
const OTP_TTL_MS = 10 * 60 * 1000
const SCANNER_SESSION_TTL_MS = 18 * 60 * 60 * 1000
const parentSyncCache = new Map()
const SCANNER_LAST_SEEN_INTERVAL_MS = 60 * 1000
const BADGE_EMAIL_TIMEOUT_MS = 15 * 1000
const MAX_OTP_ATTEMPTS = 5
class RecScanningError extends Error {
  constructor(message, status = 400, code = "rec_scanning_error", details = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export { RecScanningError }

function getSecret() {
  const secret =
    process.env.REC_SCANNER_TOKEN_SECRET ||
    process.env.AUTH_COOKIE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.APPWRITE_API_KEY

  if (!secret) {
    throw new Error("Missing REC_SCANNER_TOKEN_SECRET, AUTH_COOKIE_SECRET, NEXTAUTH_SECRET, or APPWRITE_API_KEY")
  }

  return secret
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase()
}

function normalizeString(value) {
  return String(value || "").trim()
}

function normalizeBadgeNumber(value) {
  return normalizeRecBadgeNumber(value)
}

function formatBadgeNumber(value) {
  return formatRecBadgeNumber(value)
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(normalizeString).filter(Boolean)
  if (typeof value === "string" && value.trim()) return [value.trim()]
  return []
}

function normalizeLimitedString(value, maxLength) {
  return normalizeString(value).slice(0, maxLength)
}

function normalizeLimitedArray(value, maxLength, maxItems = 100) {
  return Array.from(new Set(normalizeArray(value).map((item) => item.slice(0, maxLength)))).slice(0, maxItems)
}

function normalizeDayNumber(value) {
  const direct = Number.parseInt(value, 10)
  if (direct > 0) return direct
  const match = normalizeString(value).match(/\d+/)
  return match ? Number.parseInt(match[0], 10) : null
}

function nowIso() {
  return new Date().toISOString()
}

export async function runAfterResponseOrNow(task) {
  try {
    after(task)
  } catch {
    // A custom host without Next's waitUntil support must still report a
    // persisted scan as successful, even when deferred work cannot be queued.
    await task()
  }
}

function validateScanEventWindow(data) {
  const error = getRecScanEventWindowError(data)
  if (error) throw new RecScanningError(error.message, 400, error.code)
}

function addMs(date, ms) {
  return new Date(date.getTime() + ms).toISOString()
}

function hashValue(value) {
  return crypto.createHmac("sha256", getSecret()).update(String(value)).digest("hex")
}

function safeJsonParse(value, fallback) {
  if (!value || typeof value !== "string") return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]))
}

function compactDocumentData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null && value !== "")
  )
}

function extractClientMeta(request) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "",
    userAgent: request.headers.get("user-agent") || "",
  }
}

function mapConference(doc) {
  if (!doc) return null
  return {
    ...doc,
    days: safeJsonParse(doc.days, []),
    couponRequired: doc.couponRequired === true,
  }
}

function publicConference(doc) {
  const conference = mapConference(doc)
  if (!conference) return null
  return {
    $id: conference.$id,
    year: conference.year,
    title: conference.title,
    shortName: conference.shortName,
    theme: conference.theme || "",
    startDate: conference.startDate,
    endDate: conference.endDate,
    location: conference.location,
    venue: conference.venue,
    logoUrl: conference.logoUrl || "",
    days: conference.days,
    isActive: conference.isActive,
  }
}

function publicConferenceForBadge(conference) {
  const publicDoc = publicConference(conference)
  if (!publicDoc) return null
  return {
    ...publicDoc,
    title: getRecBadgeConferenceTitle(conference),
  }
}

function getRegistrantName(registration) {
  return getRecRegistrantName(registration)
}

function publicRegistration(registration, year) {
  if (!registration) return null
  const resolvedYear = year || (
    Array.isArray(registration.conferenceYears)
      ? registration.conferenceYears.filter(Boolean).at(-1)
      : null
  )
  return {
    $id: registration.$id,
    name: getRegistrantName(registration),
    title: registration.title || "",
    firstName: registration.firstName || "",
    otherName: registration.otherName || "",
    lastName: registration.lastName || "",
    email: registration.email,
    organization: registration.organization,
    sponsorOrganization: registration.sponsorOrganization || "",
    sponsorSector: registration.sponsorSector || "",
    registrationType: registration.registrationType,
    country: registration.country,
    daysAttending: Array.isArray(registration.daysAttending) ? registration.daysAttending : [],
    additionalSessions: normalizeRecOptionalSessions(registration.additionalSessions),
    participantCategory: getRecParticipantCategoryValue(registration),
    participantCategoryLabel: formatRecParticipantCategory(registration, resolvedYear),
    participantCategoryTag: formatRecParticipantCategoryTag(registration, resolvedYear),
    participantCategoryDirection: getRecParticipantCategoryDirection(registration),
    conferenceYears: Array.isArray(registration.conferenceYears) ? registration.conferenceYears : [],
  }
}

function publicBadgeToken(doc) {
  if (!doc) return null
  const badgeNumber = normalizeBadgeNumber(doc.badgeNumber)
  return {
    $id: doc.$id,
    conferenceId: doc.conferenceId,
    registrationId: doc.registrationId,
    badgeNumber,
    badgeNumberLabel: formatBadgeNumber(badgeNumber),
    tokenVersion: doc.tokenVersion || 1,
    issuedAt: doc.issuedAt || "",
    issuedBy: doc.issuedBy || "",
    revokedAt: doc.revokedAt || "",
    revokedBy: doc.revokedBy || "",
    revokedReason: doc.revokedReason || "",
    lastUsedAt: doc.lastUsedAt || "",
    lastEmailSentAt: doc.lastEmailSentAt || "",
    lastEmailSentTo: doc.lastEmailSentTo || "",
    lastEmailStatus: doc.lastEmailStatus || "",
    lastBadgeUrl: doc.lastBadgeUrl || "",
    isActive: doc.isActive === true && !doc.revokedAt,
  }
}

function mapEvent(doc) {
  if (!doc) return null
  return {
    ...doc,
    allowedRegistrationTypes: Array.isArray(doc.allowedRegistrationTypes) ? doc.allowedRegistrationTypes : [],
    allowedDaysAttending: Array.isArray(doc.allowedDaysAttending) ? doc.allowedDaysAttending : [],
  }
}

function publicEvent(doc) {
  const event = mapEvent(doc)
  if (!event) return null
  const availability = getRecScanEventWindowStatus(event)
  return {
    $id: event.$id,
    conferenceId: event.conferenceId,
    programId: event.programId || "",
    sessionId: event.sessionId || "",
    timeBlockId: event.timeBlockId || "",
    name: event.name,
    type: event.type,
    day: event.day || null,
    date: event.date || "",
    startTime: event.startTime || "",
    endTime: event.endTime || "",
    venue: event.venue || "",
    scanRule: event.scanRule || SCAN_RULES.ONCE_PER_EVENT,
    allowedRegistrationTypes: event.allowedRegistrationTypes,
    allowedDaysAttending: event.allowedDaysAttending,
    isActive: event.isActive === true,
    isCurrentlyOpen: event.isActive === true && availability.ok,
    availabilityCode: availability.code,
    availabilityMessage: availability.message || "",
    sortOrder: event.sortOrder || 0,
    createdAt: event.createdAt || event.$createdAt,
    updatedAt: event.updatedAt || event.$updatedAt,
  }
}

function publicOperator(doc) {
  if (!doc) return null
  const operator = {
    $id: doc.$id,
    conferenceId: doc.conferenceId,
    email: doc.email,
    name: doc.name,
    organization: doc.organization || "",
    phone: doc.phone || "",
    status: doc.status || "active",
    allowedEventIds: Array.isArray(doc.allowedEventIds) ? doc.allowedEventIds : [],
    allowedEventTypes: Array.isArray(doc.allowedEventTypes) ? doc.allowedEventTypes : [],
    allowedVenues: Array.isArray(doc.allowedVenues) ? doc.allowedVenues : [],
    allowedDays: Array.isArray(doc.allowedDays) ? doc.allowedDays : [],
    accessStartsAt: doc.accessStartsAt || "",
    accessEndsAt: doc.accessEndsAt || "",
    lastLoginAt: doc.lastLoginAt || "",
    createdAt: doc.createdAt || doc.$createdAt,
    updatedAt: doc.updatedAt || doc.$updatedAt,
  }
  const deviceSerial = parseTeraSerialFromOperator(operator)
  return {
    ...operator,
    deviceKind: deviceSerial || isTeraScannerOperator(operator) ? "tera_hid" : "otp",
    deviceSerial,
  }
}

function adminRegistrationDetails(registration) {
  if (!registration) return null
  return {
    $id: registration.$id,
    name: getRegistrantName(registration),
    title: registration.title || "",
    firstName: registration.firstName || "",
    otherName: registration.otherName || "",
    lastName: registration.lastName || "",
    email: registration.email || "",
    otherEmail: registration.otherEmail || "",
    phone: registration.phone || "",
    otherPhone: registration.otherPhone || "",
    organization: registration.organization || "",
    sector: Array.isArray(registration.sector) ? registration.sector : [],
    sponsorOrganization: registration.sponsorOrganization || "",
    sponsorSector: registration.sponsorSector || "",
    registrationType: registration.registrationType || "",
    country: registration.country || "",
    stateRegion: registration.stateRegion || "",
    city: registration.city || "",
    daysAttending: Array.isArray(registration.daysAttending) ? registration.daysAttending : [],
    additionalSessions: normalizeRecOptionalSessions(registration.additionalSessions),
    conferenceYears: Array.isArray(registration.conferenceYears) ? registration.conferenceYears : [],
    visaLetterRequired: registration.visaLetterRequired === true,
    visaLetterSent: registration.visaLetterSent === true,
    additionalComments: registration.additionalComments || "",
    exhibitionDetails: registration.exhibitionDetails || "",
    registeredAt: registration.$createdAt || "",
    updatedAt: registration.$updatedAt || "",
  }
}

function normalizeOperatorPayload(data, existing = null) {
  const valueFor = (key) => Object.hasOwn(data || {}, key) ? data[key] : existing?.[key]
  return {
    conferenceId: normalizeLimitedString(existing?.conferenceId || data?.conferenceId, 64),
    email: normalizeEmail(valueFor("email")).slice(0, 255),
    name: normalizeLimitedString(valueFor("name"), 160),
    organization: normalizeLimitedString(valueFor("organization"), 160),
    phone: normalizeLimitedString(valueFor("phone"), 64),
    status: normalizeLimitedString(valueFor("status") || "active", 32).toLowerCase(),
    allowedEventIds: normalizeLimitedArray(valueFor("allowedEventIds"), 64),
    allowedEventTypes: normalizeLimitedArray(valueFor("allowedEventTypes"), 32),
    allowedVenues: normalizeLimitedArray(valueFor("allowedVenues"), 160),
    allowedDays: normalizeLimitedArray(valueFor("allowedDays"), 16),
    accessStartsAt: normalizeString(valueFor("accessStartsAt")),
    accessEndsAt: normalizeString(valueFor("accessEndsAt")),
  }
}

function validateOperatorPayload(operator) {
  if (!operator.conferenceId) {
    throw new RecScanningError("Conference is required.", 400, "missing_conference", { field: "conferenceId" })
  }
  const error = getRecScannerOperatorValidationError(operator)
  if (error) throw new RecScanningError(error.message, 400, error.code, { field: error.field })
  const invalidEventType = operator.allowedEventTypes.find((type) => !Object.values(SCAN_EVENT_TYPES).includes(type))
  if (invalidEventType) {
    throw new RecScanningError("Select valid event types for this scanner.", 400, "invalid_operator_event_type", {
      field: "allowedEventTypes",
    })
  }
  if (operator.allowedDays.some((day) => !/^\d+$/.test(day) || Number(day) < 1)) {
    throw new RecScanningError("Select valid conference days for this scanner.", 400, "invalid_operator_day", {
      field: "allowedDays",
    })
  }
}

async function getScannerOperatorById(operatorId, { publicAccess = false } = {}) {
  try {
    return publicOperator(await getRestDocument(config.recScannerOperatorsCollectionId, operatorId))
  } catch (error) {
    if (error.status === 404 && publicAccess) {
      throw new RecScanningError("Scanner access is no longer active.", 403, "scanner_inactive")
    }
    if (error.status === 404) {
      throw new RecScanningError("Scanner operator was not found.", 404, "operator_not_found")
    }
    throw error
  }
}

export function assertScannerOperatorAccess(operator, { conferenceId = "", email = "" } = {}) {
  if (!operator || operator.status !== "active") {
    throw new RecScanningError("This scanner account is not active.", 403, "scanner_inactive")
  }
  if (conferenceId && operator.conferenceId !== conferenceId) {
    throw new RecScanningError("This scanner is not assigned to this conference.", 403, "scanner_wrong_conference")
  }
  if (email && normalizeEmail(operator.email) !== normalizeEmail(email)) {
    throw new RecScanningError("This scanner access code is no longer valid. Request a new code.", 403, "scanner_identity_changed")
  }

  const now = Date.now()
  if (operator.accessStartsAt && Date.parse(operator.accessStartsAt) > now) {
    throw new RecScanningError("This scanner account is not active yet.", 403, "scanner_not_started")
  }
  if (operator.accessEndsAt && Date.parse(operator.accessEndsAt) < now) {
    throw new RecScanningError("This scanner account has expired.", 403, "scanner_expired")
  }
}

function assertCollectionConfigured(collectionId, label) {
  if (!collectionId) {
    throw new RecScanningError(`${label} collection is not configured.`, 500, "missing_collection")
  }
}

function assertAllowedEventForOperator(operator, event) {
  if (!operator) return
  assertScannerOperatorAccess(operator, { conferenceId: event.conferenceId })

  const explicitlyAssigned = Boolean(operator.allowedEventIds?.length && operator.allowedEventIds.includes(event.$id))
  if (operator.allowedEventIds?.length && !explicitlyAssigned) {
    throw new RecScanningError("This scanner is not assigned to this event.", 403, "scanner_event_denied")
  }
  if (!explicitlyAssigned && operator.allowedEventTypes?.length && !operator.allowedEventTypes.includes(event.type)) {
    throw new RecScanningError("This scanner is not assigned to this event type.", 403, "scanner_type_denied")
  }
  if (!venueMatchesAllowedList(event.venue, operator.allowedVenues)) {
    throw new RecScanningError("This scanner is not assigned to this venue.", 403, "scanner_venue_denied")
  }
  if (!explicitlyAssigned && operator.allowedDays?.length && event.day && !operator.allowedDays.includes(String(event.day))) {
    throw new RecScanningError("This scanner is not assigned to this conference day.", 403, "scanner_day_denied")
  }
}

function extractQrToken(qrPayload) {
  const payload = normalizeString(qrPayload)
  if (!payload) {
    throw new RecScanningError("QR payload is required.", 400, "missing_qr_payload")
  }
  if (payload.startsWith(QR_PREFIX)) return payload.slice(QR_PREFIX.length)

  try {
    const url = new URL(payload)
    const token = url.searchParams.get("token") || url.pathname.split("/").filter(Boolean).pop()
    if (token) return token
  } catch {
    // Not a URL; treat as raw token for manual fallback.
  }

  return payload
}

function isRegistrationEligibleForConference(registration, conference) {
  if (!registration || !conference) return false
  const years = Array.isArray(registration.conferenceYears) ? registration.conferenceYears.map(Number) : []
  return years.includes(Number(conference.year))
}

function getRegistrationEventEligibility(registration, event, conference) {
  const allowedTypes = Array.isArray(event.allowedRegistrationTypes) ? event.allowedRegistrationTypes : []
  if (allowedTypes.length && !allowedTypes.includes(registration.registrationType) && !unregisteredAttendeeAllowedAtEvent(registration, event)) {
    return {
      ok: false,
      reason: "registration_type_not_allowed",
      attendance: getRecScanAttendanceEligibility(registration, event, conference),
      message: "This registration type is not allowed for the selected scan event.",
    }
  }

  const attendance = getRecScanAttendanceEligibility(registration, event, conference)
  if (!attendance.ok) {
    return {
      ok: false,
      reason: attendance.reason,
      attendance,
      message: attendance.message || "This registration is not allowed for the selected scan event day.",
    }
  }

  return { ok: true, reason: "ok", attendance, message: "" }
}

function scanAttendanceFields(attendance = {}) {
  return {
    registrationDaysAttending: normalizeArray(attendance.registeredDays),
    eventAllowedDaysAttending: normalizeArray(attendance.requiredDays),
    matchedAttendanceDays: normalizeArray(attendance.matchedDays),
  }
}

function scanMetadata(extra = {}, attendance = {}) {
  return JSON.stringify({
    ...extra,
    attendance: {
      registeredDays: normalizeArray(attendance.registeredDays),
      requiredDays: normalizeArray(attendance.requiredDays),
      matchedDays: normalizeArray(attendance.matchedDays),
      reason: attendance.reason || "",
      message: attendance.message || "",
    },
  })
}

async function listAll(collectionId, queries = []) {
  const documents = []
  const limit = 100
  let total = 0

  do {
    const result = await listRestDocuments(collectionId, [
      ...queries,
      Query.limit(limit),
      Query.offset(documents.length),
    ])
    documents.push(...(result.documents || []))
    total = result.total || documents.length
  } while (documents.length < total)

  return documents
}

const CONFERENCE_SCAN_CACHE_TTL_MS = 30 * 1000
const conferenceScanCache = new Map()

function listCachedConferenceScans(conferenceId) {
  const cached = conferenceScanCache.get(conferenceId)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = listAll(config.recScansCollectionId, [Query.equal("conferenceId", conferenceId)])
  conferenceScanCache.set(conferenceId, { promise, expiresAt: Date.now() + CONFERENCE_SCAN_CACHE_TTL_MS })
  promise.catch(() => conferenceScanCache.delete(conferenceId))
  return promise
}

async function listRecentIndexedScans({ conferenceId, limit, deviceId = "", scannedBy = "" } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25))
  const queries = [Query.equal("conferenceId", conferenceId)]
  if (deviceId) queries.push(Query.equal("deviceId", deviceId))
  if (scannedBy) queries.push(Query.equal("scannedBy", scannedBy))
  queries.push(Query.orderDesc("scannedAt"), Query.limit(safeLimit))
  const result = await listRestDocuments(config.recScansCollectionId, queries)
  return result.documents || []
}

async function listRecentScansForOperator({ conferenceId, operatorId = "", scannerUserId = "", limit = 25 } = {}) {
  const keys = Array.from(new Set([scannerUserId, operatorId].map(normalizeString).filter(Boolean)))
  const pages = await Promise.all(keys.map((scannedBy) => listRecentIndexedScans({
    conferenceId,
    scannedBy,
    limit,
  })))
  const byId = new Map()
  pages.flat().forEach((scan) => byId.set(scan.$id, scan))
  return [...byId.values()]
    .sort((left, right) => Date.parse(right.scannedAt || 0) - Date.parse(left.scannedAt || 0))
    .slice(0, Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25)))
}

export async function listRecScanningConferences() {
  assertCollectionConfigured(config.recConferencesCollectionId, "REC conferences")
  const result = await listRestDocuments(config.recConferencesCollectionId, [
    Query.orderDesc("year"),
    Query.limit(100),
  ])
  return {
    documents: (result.documents || []).map(publicConference),
    total: result.total || 0,
  }
}

// Conference documents change rarely, but every scan reads one. A short
// per-instance cache saves a round trip on nearly every badge at the gate.
const CONFERENCE_CACHE_TTL_MS = 60 * 1000
const conferenceCache = new Map()

export async function getRecScanningConference(conferenceId) {
  assertCollectionConfigured(config.recConferencesCollectionId, "REC conferences")
  const cached = conferenceCache.get(conferenceId)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = getRestDocument(config.recConferencesCollectionId, conferenceId).then(mapConference)
  conferenceCache.set(conferenceId, { promise, expiresAt: Date.now() + CONFERENCE_CACHE_TTL_MS })
  promise.catch(() => conferenceCache.delete(conferenceId))
  return promise
}

export async function listRecScanEvents({ conferenceId, activeOnly = false, page = 1, limit = 100 } = {}) {
  assertCollectionConfigured(config.recScanEventsCollectionId, "REC scan events")
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1)
  const safeLimit = Math.min(100, Math.max(5, Number.parseInt(limit, 10) || 100))
  const queries = [
    Query.orderAsc("day"),
    Query.orderAsc("sortOrder"),
    Query.orderAsc("name"),
    Query.limit(safeLimit),
    Query.offset((safePage - 1) * safeLimit),
  ]
  if (conferenceId) queries.unshift(Query.equal("conferenceId", conferenceId))
  if (activeOnly) queries.unshift(Query.equal("isActive", true))
  const result = await listRestDocuments(config.recScanEventsCollectionId, queries)
  const total = result.total || 0
  return {
    documents: (result.documents || []).map(publicEvent),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  }
}

export async function createRecScanEvent(data, actorId) {
  assertCollectionConfigured(config.recScanEventsCollectionId, "REC scan events")
  const conferenceId = normalizeString(data.conferenceId)
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")
  if (!normalizeString(data.name)) throw new RecScanningError("Event name is required.", 400, "missing_name")

  const payload = {
    conferenceId,
    programId: normalizeString(data.programId),
    sessionId: normalizeString(data.sessionId),
    timeBlockId: normalizeString(data.timeBlockId),
    key: normalizeString(data.key) || `${Date.now()}-${normalizeString(data.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: normalizeString(data.name),
    type: Object.values(SCAN_EVENT_TYPES).includes(data.type) ? data.type : SCAN_EVENT_TYPES.CUSTOM,
    day: normalizeDayNumber(data.day),
    date: normalizeString(data.date),
    startTime: normalizeString(data.startTime),
    endTime: normalizeString(data.endTime),
    venue: normalizeString(data.venue),
    scanRule: Object.values(SCAN_RULES).includes(data.scanRule) ? data.scanRule : SCAN_RULES.ONCE_PER_EVENT,
    allowedRegistrationTypes: normalizeArray(data.allowedRegistrationTypes),
    allowedDaysAttending: normalizeArray(data.allowedDaysAttending),
    isActive: data.isActive !== false,
    sortOrder: Number.parseInt(data.sortOrder, 10) || 0,
    createdBy: actorId || "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  validateScanEventWindow(payload)

  return publicEvent(await createRestDocument(config.recScanEventsCollectionId, compactDocumentData(payload)))
}

export async function updateRecScanEvent(eventId, data, actorId) {
  assertCollectionConfigured(config.recScanEventsCollectionId, "REC scan events")
  const update = {
    updatedAt: nowIso(),
    updatedBy: actorId || "",
  }

  const fields = ["name", "programId", "sessionId", "timeBlockId", "date", "startTime", "endTime", "venue", "key"]
  fields.forEach((field) => {
    if (data[field] !== undefined) update[field] = normalizeString(data[field])
  })
  if (data.type !== undefined) update.type = Object.values(SCAN_EVENT_TYPES).includes(data.type) ? data.type : SCAN_EVENT_TYPES.CUSTOM
  if (data.scanRule !== undefined) update.scanRule = Object.values(SCAN_RULES).includes(data.scanRule) ? data.scanRule : SCAN_RULES.ONCE_PER_EVENT
  if (data.day !== undefined) update.day = normalizeDayNumber(data.day)
  if (data.sortOrder !== undefined) update.sortOrder = Number.parseInt(data.sortOrder, 10) || 0
  if (data.isActive !== undefined) update.isActive = data.isActive === true
  if (data.allowedRegistrationTypes !== undefined) update.allowedRegistrationTypes = normalizeArray(data.allowedRegistrationTypes)
  if (data.allowedDaysAttending !== undefined) update.allowedDaysAttending = normalizeArray(data.allowedDaysAttending)
  const existing = await getRestDocument(config.recScanEventsCollectionId, eventId)
  validateScanEventWindow({ ...existing, ...update })

  return publicEvent(await updateRestDocument(config.recScanEventsCollectionId, eventId, compactDocumentData(update)))
}

async function getRecScanEventScanCount(eventId) {
  const result = await listRestDocuments(config.recScansCollectionId, [
    Query.equal("eventId", eventId),
    Query.limit(1),
  ])
  return Number(result.total || result.documents?.length || 0)
}

async function deleteAllRecScanEventRecords(eventId) {
  let deleted = 0

  while (true) {
    const result = await listRestDocuments(config.recScansCollectionId, [
      Query.equal("eventId", eventId),
      Query.limit(100),
    ])
    const documents = result.documents || []
    if (!documents.length) return deleted

    await Promise.all(documents.map((scan) => deleteRestDocument(config.recScansCollectionId, scan.$id)))
    deleted += documents.length
  }
}

async function deleteRecScanEventWithPolicy(event, { deleteScanData = false, actorId = "" } = {}) {
  const initialScanCount = await getRecScanEventScanCount(event.$id)
  if (initialScanCount > 0 && !deleteScanData) {
    return {
      status: "blocked",
      eventId: event.$id,
      name: event.name || "Unnamed scan event",
      scanCount: initialScanCount,
    }
  }

  if (event.isActive === true) {
    await updateRestDocument(config.recScanEventsCollectionId, event.$id, {
      isActive: false,
      updatedBy: actorId || "",
      updatedAt: nowIso(),
    })
  }

  if (!deleteScanData) {
    const recheckedScanCount = await getRecScanEventScanCount(event.$id)
    if (recheckedScanCount > 0) {
      if (event.isActive === true) {
        await updateRestDocument(config.recScanEventsCollectionId, event.$id, {
          isActive: true,
          updatedBy: actorId || "",
          updatedAt: nowIso(),
        })
      }
      return {
        status: "blocked",
        eventId: event.$id,
        name: event.name || "Unnamed scan event",
        scanCount: recheckedScanCount,
      }
    }
  }

  let scanRecordsDeleted = 0
  if (deleteScanData) {
    scanRecordsDeleted += await deleteAllRecScanEventRecords(event.$id)
  }

  await deleteRestDocument(config.recScanEventsCollectionId, event.$id)

  // Drain any scan request that was already in flight when the event was deactivated.
  if (deleteScanData) {
    scanRecordsDeleted += await deleteAllRecScanEventRecords(event.$id)
  }

  return {
    status: "deleted",
    eventId: event.$id,
    name: event.name || "Unnamed scan event",
    scanRecordsDeleted,
  }
}

export async function bulkDeleteRecScanEvents(data, actorId) {
  assertCollectionConfigured(config.recScanEventsCollectionId, "REC scan events")
  assertCollectionConfigured(config.recScansCollectionId, "REC scans")

  const validationError = getRecScanEventBulkDeleteValidationError(data)
  if (validationError) {
    throw new RecScanningError(validationError.message, 400, validationError.code, {
      field: validationError.field,
    })
  }

  const conferenceId = normalizeString(data.conferenceId)
  const eventIds = normalizeRecScanEventIds(data.eventIds)
  const deleteScanData = data.deleteScanData === true
  const conferenceEvents = await listAll(config.recScanEventsCollectionId, [
    Query.equal("conferenceId", conferenceId),
  ])
  const eventsById = new Map(conferenceEvents.map((event) => [event.$id, mapEvent(event)]))
  const report = {
    requested: eventIds.length,
    deleteScanData,
    deleted: [],
    blocked: [],
    failed: [],
    scanRecordsDeleted: 0,
    requiresConfirmation: false,
  }

  for (const eventId of eventIds) {
    const event = eventsById.get(eventId)
    if (!event) {
      report.failed.push({
        eventId,
        name: "Unavailable scan event",
        code: "event_not_found",
        message: "The scan event was not found in the selected conference.",
      })
      continue
    }

    try {
      const result = await deleteRecScanEventWithPolicy(event, { deleteScanData, actorId })
      if (result.status === "blocked") {
        report.blocked.push(result)
      } else {
        report.deleted.push(result)
        report.scanRecordsDeleted += result.scanRecordsDeleted || 0
      }
    } catch (error) {
      report.failed.push({
        eventId,
        name: event.name || "Unnamed scan event",
        code: error.code || error.type || "event_delete_failed",
        message: error.message || "The scan event could not be deleted.",
      })
    }
  }

  report.requiresConfirmation = !deleteScanData && report.blocked.length > 0
  return report
}

export async function deleteRecScanEvent(eventId, actorId = "") {
  assertCollectionConfigured(config.recScanEventsCollectionId, "REC scan events")
  assertCollectionConfigured(config.recScansCollectionId, "REC scans")
  if (!eventId) throw new RecScanningError("Scan event is required.", 400, "missing_event")

  let event
  try {
    event = mapEvent(await getRestDocument(config.recScanEventsCollectionId, eventId))
  } catch (error) {
    if (error.status === 404) {
      throw new RecScanningError("Scan event was not found.", 404, "event_not_found")
    }
    throw error
  }

  const result = await deleteRecScanEventWithPolicy(event, { actorId })
  if (result.status === "blocked") {
    throw new RecScanningError(
      "This scan event has scan history and cannot be deleted. Deactivate it instead.",
      409,
      "event_has_scan_history",
      { scanCount: result.scanCount }
    )
  }

  return { success: true, event: result }
}

async function writeParentProgramme(program) {
  if (!config.recProgrammesCollectionId) return "skipped"
  const data = programmeDocumentFromParent(program)
  let existing = null
  try {
    existing = await getRestDocument(config.recProgrammesCollectionId, program.$id)
  } catch (error) {
    if (error.status !== 404) throw error
  }
  if (!existing) {
    await createRestDocumentWithId(config.recProgrammesCollectionId, program.$id, data)
    return "created"
  }
  if (!programmeDocumentChanged(existing, data)) return "unchanged"
  await updateRestDocument(config.recProgrammesCollectionId, program.$id, data)
  return "updated"
}

export async function syncParentProgrammeScanEvents(conferenceId, actorId = "") {
  const settings = parentProgrammeSettings()
  const empty = {
    configured: false,
    programs: 0,
    copiedPrograms: 0,
    updatedPrograms: 0,
    sessions: 0,
    copiedSessions: 0,
    createdEvents: 0,
    updatedEvents: 0,
    failures: [],
  }
  if (!isParentProgrammeConfigured(settings)) return empty
  if (!config.recSessionsCollectionId || !config.recScanEventsCollectionId) return empty

  const [{ programs, sessions }, existingEvents] = await Promise.all([
    listParentConferenceSessions(settings, conferenceId),
    listAll(config.recScanEventsCollectionId, [Query.equal("conferenceId", conferenceId)]),
  ])

  const programResult = { programs: programs.length, copiedPrograms: 0, updatedPrograms: 0, failures: [] }
  for (const program of programs) {
    try {
      const outcome = await writeParentProgramme(program)
      if (outcome === "created") programResult.copiedPrograms += 1
      if (outcome === "updated") programResult.updatedPrograms += 1
    } catch (error) {
      programResult.failures.push({
        title: String(program?.title || program?.$id || "Programme"),
        message: error?.message || "Programme sync failed",
      })
    }
  }

  const sessionResult = await applyProgrammeSessionSync({
    conferenceId,
    sessions,
    existingEvents,
    readSession: async (sessionId) => {
      try {
        return await getRestDocument(config.recSessionsCollectionId, sessionId)
      } catch (error) {
        if (error.status === 404) return null
        throw error
      }
    },
    writeSession: async (sessionId, data, existingSession) => {
      if (existingSession) {
        await updateRestDocument(config.recSessionsCollectionId, sessionId, data)
        return
      }
      await createRestDocumentWithId(config.recSessionsCollectionId, sessionId, data)
    },
    createEvent: (data) => createRecScanEvent(data, actorId),
    updateEvent: (eventId, data) => updateRecScanEvent(eventId, data, actorId),
  })

  return {
    configured: true,
    ...programResult,
    ...sessionResult,
    failures: [...programResult.failures, ...(sessionResult.failures || [])],
  }
}

export function getParentProgrammeSyncStatus(conferenceId) {
  const row = parentSyncCache.get(conferenceId)
  if (!row?.result) return { conferenceId, syncedAt: "", cached: false, configured: isParentProgrammeConfigured() }
  return { conferenceId, ...row.result, cached: true }
}

export function queueParentProgrammeSync(conferenceId) {
  if (!conferenceId) return
  syncParentProgrammeIfStale(conferenceId).catch((error) => {
    console.error("Parent programme sync failed", error)
  })
}

export async function syncParentProgrammeIfStale(conferenceId, actorId = "parent-sync", { force = false, maxAgeMs = PARENT_SYNC_MAX_AGE_MS } = {}) {
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")
  const row = parentSyncCache.get(conferenceId)
  if (!force && row?.pending) return row.pending
  if (!force && !shouldRefreshParentSync(row?.at, Date.now(), maxAgeMs)) {
    return { ...row.result, cached: true }
  }
  const pending = syncParentProgrammeScanEvents(conferenceId, actorId)
    .then((result) => {
      const stored = { ...result, syncedAt: new Date().toISOString() }
      parentSyncCache.set(conferenceId, { at: Date.now(), result: stored })
      return { ...stored, cached: false }
    })
    .catch((error) => {
      const current = parentSyncCache.get(conferenceId)
      if (current) parentSyncCache.set(conferenceId, { at: current.at, result: current.result })
      throw error
    })
  parentSyncCache.set(conferenceId, { at: row?.at || 0, result: row?.result, pending })
  return pending
}

export async function generateDefaultRecScanEvents(conferenceId, actorId, { includeSessions = true } = {}) {
  const conference = await getRecScanningConference(conferenceId)
  if (!conference) throw new RecScanningError("Conference was not found.", 404, "conference_not_found")

  const parentSync = includeSessions
    ? await syncParentProgrammeScanEvents(conferenceId, actorId)
    : { configured: false, sessions: 0, copiedSessions: 0, createdEvents: 0, updatedEvents: 0, failures: [] }

  const existing = await listAll(config.recScanEventsCollectionId, [Query.equal("conferenceId", conferenceId)])
  const existingKeys = new Set(existing.map((event) => event.key))
  const created = []
  const days = Array.isArray(conference.days) ? conference.days : []

  for (const [index, day] of days.entries()) {
    const dayNumber = index + 1
    const dayKey = String(day.label || day.date || dayNumber).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const common = {
      conferenceId,
      day: dayNumber,
      date: day.date || "",
      allowedDaysAttending: day.label ? [day.label] : [],
    }

    const entranceKey = `entry-day-${dayNumber}-${dayKey}`
    if (!existingKeys.has(entranceKey)) {
      created.push(await createRecScanEvent({
        ...common,
        key: entranceKey,
        name: `Main Entrance - Day ${dayNumber}`,
        type: SCAN_EVENT_TYPES.CONFERENCE_ENTRY,
        scanRule: SCAN_RULES.ONCE_PER_DAY,
        sortOrder: dayNumber * 10,
      }, actorId))
    }

    const lunchKey = `lunch-day-${dayNumber}-${dayKey}`
    if (!existingKeys.has(lunchKey)) {
      created.push(await createRecScanEvent({
        ...common,
        key: lunchKey,
        name: `Lunch - Day ${dayNumber}`,
        type: SCAN_EVENT_TYPES.LUNCH,
        scanRule: SCAN_RULES.ONCE_PER_EVENT,
        sortOrder: dayNumber * 10 + 1,
      }, actorId))
    }
  }

  if (includeSessions && config.recProgrammesCollectionId && config.recSessionsCollectionId) {
    const programs = await listAll(config.recProgrammesCollectionId, [Query.equal("conferenceId", conferenceId)])
    for (const program of programs) {
      const sessions = await listAll(config.recSessionsCollectionId, [Query.equal("programId", program.$id)])
      for (const session of sessions) {
        const key = `session-${session.$id}`
        if (existingKeys.has(key)) continue
        created.push(await createRecScanEvent({
          conferenceId,
          programId: program.$id,
          sessionId: session.$id,
          key,
          name: session.title || "Session Entry",
          type: SCAN_EVENT_TYPES.SESSION_ENTRY,
          day: session.day || null,
          startTime: session.startTime || "",
          endTime: session.toTime || "",
          venue: session.venueHall || "",
          scanRule: SCAN_RULES.ONCE_PER_EVENT,
          sortOrder: Number(session.day || 0) * 1000 + 100,
        }, actorId))
      }
    }
  }

  return { created, parentSync }
}

export async function listRecScannerOperators({ conferenceId, page = 1, limit = 10 } = {}) {
  assertCollectionConfigured(config.recScannerOperatorsCollectionId, "REC scanner operators")
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1)
  const safeLimit = Math.min(100, Math.max(5, Number.parseInt(limit, 10) || 10))
  const queries = [
    Query.orderAsc("name"),
    Query.limit(safeLimit),
    Query.offset((safePage - 1) * safeLimit),
  ]
  if (conferenceId) queries.unshift(Query.equal("conferenceId", conferenceId))
  const result = await listRestDocuments(config.recScannerOperatorsCollectionId, queries)
  const total = result.total || 0
  return {
    documents: (result.documents || []).map(publicOperator),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  }
}

async function assertUniqueScannerOperatorEmail(operator, excludedOperatorId = "") {
  const existing = await listRestDocuments(config.recScannerOperatorsCollectionId, [
    Query.equal("conferenceId", operator.conferenceId),
    Query.equal("email", operator.email),
    Query.limit(2),
  ])
  if ((existing.documents || []).some((document) => document.$id !== excludedOperatorId)) {
    throw new RecScanningError(
      "A scanner operator with this email already exists for the selected conference.",
      409,
      "operator_email_exists",
      { field: "email" }
    )
  }
}

async function revokeScannerOperatorCredentials(operator) {
  assertCollectionConfigured(config.recScannerSessionsCollectionId, "REC scanner sessions")
  assertCollectionConfigured(config.recScannerOtpsCollectionId, "REC scanner OTPs")
  const [sessions, emailOtps] = await Promise.all([
    listAll(config.recScannerSessionsCollectionId, [Query.equal("operatorId", operator.$id)]),
    listAll(config.recScannerOtpsCollectionId, [Query.equal("email", operator.email)]),
  ])
  const timestamp = nowIso()
  const activeSessions = sessions.filter((session) => !session.revokedAt)
  const pendingOtps = emailOtps.filter((otp) => otp.operatorId === operator.$id && !otp.consumedAt)
  await Promise.all([
    ...activeSessions.map((session) => updateRestDocument(config.recScannerSessionsCollectionId, session.$id, {
      revokedAt: timestamp,
    })),
    ...pendingOtps.map((otp) => updateRestDocument(config.recScannerOtpsCollectionId, otp.$id, {
      consumedAt: timestamp,
    })),
  ])
  return { revokedSessions: activeSessions.length, invalidatedOtps: pendingOtps.length }
}

export async function createRecScannerOperator(data, actorId) {
  assertCollectionConfigured(config.recScannerOperatorsCollectionId, "REC scanner operators")
  const operator = normalizeOperatorPayload(data)
  validateOperatorPayload(operator)
  await getRecScanningConference(operator.conferenceId)
  await assertUniqueScannerOperatorEmail(operator)
  const timestamp = nowIso()
  const payload = {
    ...operator,
    createdBy: actorId || "",
    updatedBy: actorId || "",
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  return publicOperator(await createRestDocument(config.recScannerOperatorsCollectionId, compactDocumentData(payload)))
}

async function listTeraAllocations() {
  if (!config.recScannerAllocationsCollectionId) return []
  return listAll(config.recScannerAllocationsCollectionId)
}

async function findOperatorByTeraEmail(conferenceId, serialNumber) {
  const email = teraOperatorEmail(serialNumber)
  if (!email) return null
  const result = await listRestDocuments(config.recScannerOperatorsCollectionId, [
    Query.equal("conferenceId", conferenceId),
    Query.equal("email", email),
    Query.limit(1),
  ])
  return publicOperator(result.documents?.[0] || null)
}

export async function getTeraOperatorForAllocation(allocation, conferenceId) {
  if (allocation?.operatorId) {
    try {
      const operator = await getScannerOperatorById(allocation.operatorId)
      if (operator && (!conferenceId || operator.conferenceId === conferenceId)) return operator
    } catch {
      // Fall through to email lookup.
    }
  }
  if (allocation?.serialNumber && conferenceId) {
    return findOperatorByTeraEmail(conferenceId, allocation.serialNumber)
  }
  return null
}

export async function touchScannerOperatorLastLogin(operatorId) {
  if (!operatorId || !config.recScannerOperatorsCollectionId) return
  try {
    await updateRestDocument(config.recScannerOperatorsCollectionId, operatorId, { lastLoginAt: nowIso() })
  } catch {
    // Unlock / scan should still succeed if login tracking fails.
  }
}

export async function syncTeraScannerOperators(conferenceId, actorId = "", access = {}) {
  assertCollectionConfigured(config.recScannerOperatorsCollectionId, "REC scanner operators")
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")
  const conference = await getRecScanningConference(conferenceId)

  const existingAllocations = await listTeraAllocations()
  const allocationsBySerial = new Map(
    existingAllocations.map((allocation) => [normalizeString(allocation.serialNumber), allocation])
  )

  const created = []
  const updated = []

  for (const unit of REC_TERA_HW0009_DEPLOYMENTS) {
    const existingAllocation = allocationsBySerial.get(unit.serialNumber)
    const email = teraOperatorEmail(unit.serialNumber)
    const eventTypes = getTeraStationEventTypes(unit.assignedRole, unit.deployedLocation)
    const existing = await findOperatorByTeraEmail(conferenceId, unit.serialNumber)
    const timestamp = nowIso()
    const name = `Tera ${unit.serialNumber} · ${unit.deployedLocation}`
    const accessWindow = resolveTeraOperatorAccess(existing, conference, access)
    const operatorFields = {
      conferenceId,
      email,
      name,
      organization: "Tera HW0009",
      phone: unit.serialNumber,
      status: existingAllocation?.isActive === false ? "suspended" : (existing?.status || "active"),
      allowedEventTypes: eventTypes,
      allowedEventIds: existing?.allowedEventIds || [],
      allowedVenues: [unit.deployedLocation],
      allowedDays: accessWindow.allowedDays,
      accessStartsAt: accessWindow.accessStartsAt,
      accessEndsAt: accessWindow.accessEndsAt,
    }
    validateOperatorPayload(operatorFields)
    const base = {
      ...operatorFields,
      updatedBy: actorId || "",
      updatedAt: timestamp,
    }

    let operator = existing
    if (!existing) {
      operator = publicOperator(await createRestDocument(config.recScannerOperatorsCollectionId, compactDocumentData({
        ...base,
        createdBy: actorId || "",
        createdAt: timestamp,
      })))
      created.push(operator)
    } else {
      operator = publicOperator(await updateRestDocument(config.recScannerOperatorsCollectionId, existing.$id, {
        ...compactDocumentData({
          ...base,
          accessStartsAt: undefined,
          accessEndsAt: undefined,
        }),
        accessStartsAt: accessWindow.accessStartsAt || null,
        accessEndsAt: accessWindow.accessEndsAt || null,
      }))
      updated.push(operator)
    }

    const allocationData = {
      serialNumber: unit.serialNumber,
      assignedRole: unit.assignedRole,
      deployedLocation: unit.deployedLocation,
      operatorId: operator.$id,
      isActive: true,
    }
    if (existingAllocation?.$id && config.recScannerAllocationsCollectionId) {
      await updateRestDocument(config.recScannerAllocationsCollectionId, existingAllocation.$id, allocationData)
    } else if (config.recScannerAllocationsCollectionId) {
      await createRestDocumentWithId(config.recScannerAllocationsCollectionId, unit.serialNumber, allocationData)
    }
  }

  const listed = await listRecScannerOperators({ conferenceId, page: 1, limit: 100 })
  const appliedAccessWindow = Object.hasOwn(access || {}, "accessStartsAt") || Object.hasOwn(access || {}, "accessEndsAt")
  return {
    created: created.length,
    updated: updated.length,
    appliedAccessWindow,
    documents: listed.documents,
    total: listed.total,
    page: listed.page,
    limit: listed.limit,
    totalPages: listed.totalPages,
  }
}

export async function updateRecScannerOperator(operatorId, data, actorId) {
  assertCollectionConfigured(config.recScannerOperatorsCollectionId, "REC scanner operators")
  if (!operatorId) throw new RecScanningError("Scanner operator is required.", 400, "missing_operator")
  const current = await getScannerOperatorById(operatorId)
  const operator = normalizeOperatorPayload(data, current)
  validateOperatorPayload(operator)
  await assertUniqueScannerOperatorEmail(operator, operatorId)

  let credentials = { revokedSessions: 0, invalidatedOtps: 0 }
  if (shouldRevokeRecScannerCredentials(current, operator)) {
    credentials = await revokeScannerOperatorCredentials(current)
  }
  const updated = publicOperator(await updateRestDocument(config.recScannerOperatorsCollectionId, operatorId, {
    ...operator,
    organization: operator.organization || null,
    phone: operator.phone || null,
    accessStartsAt: operator.accessStartsAt || null,
    accessEndsAt: operator.accessEndsAt || null,
    updatedBy: actorId || "",
    updatedAt: nowIso(),
  }))

  return { operator: updated, credentials }
}

export async function deleteRecScannerOperator(operatorId) {
  assertCollectionConfigured(config.recScannerOperatorsCollectionId, "REC scanner operators")
  if (!operatorId) throw new RecScanningError("Scanner operator is required.", 400, "missing_operator")
  const operator = await getScannerOperatorById(operatorId)
  const credentials = await revokeScannerOperatorCredentials(operator)
  await deleteRestDocument(config.recScannerOperatorsCollectionId, operatorId)

  return { success: true, ...credentials }
}

export async function listEligibleScannerConferences(emailValue) {
  const email = normalizeEmail(emailValue)
  if (!email) return []
  const result = await listRestDocuments(config.recScannerOperatorsCollectionId, [
    Query.equal("email", email),
    Query.equal("status", "active"),
    Query.limit(100),
  ])
  const conferenceIds = Array.from(new Set((result.documents || []).map((operator) => operator.conferenceId).filter(Boolean)))
  const conferences = await Promise.all(
    conferenceIds.map((id) => getRecScanningConference(id).then(publicConference).catch(() => null))
  )
  return conferences.filter(Boolean)
}

async function sendScannerOtpEmail({ email, name, conference, otpCode }) {
  const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "")
  if (!apiBaseUrl) throw new RecScanningError("Email API is not configured.", 500, "email_api_missing")

  const subject = `${formatRecEdition(conference?.year) || conference?.shortName || conference?.title || "REC"} scanner access code`
  const recipientName = name || "there"
  const conferenceTitle = conference?.title || "the conference"
  const text = `REC scanner access code

Hello ${recipientName},

Use this one-time code to access the scanner interface for ${conferenceTitle}: ${otpCode}

This code expires in 10 minutes. If you did not request this, please ignore this email.`
  const html = `
    <div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <div style="background:#2E9ECC;padding:22px 24px;color:#ffffff;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#EFA74F;">REC Scanner</p>
            <h2 style="margin:0;font-size:22px;line-height:1.25;">Access code</h2>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 14px;">Hello ${escapeHtml(recipientName)},</p>
            <p style="margin:0 0 18px;line-height:1.6;">Use this one-time code to access the scanner interface for <strong>${escapeHtml(conferenceTitle)}</strong>.</p>
            <div style="margin:18px 0;padding:18px;border-radius:12px;background:#ecfeff;text-align:center;color:#2E9ECC;font-size:30px;letter-spacing:7px;font-weight:800;">
              ${escapeHtml(otpCode)}
            </div>
            <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
          </div>
        </div>
      </div>
    </div>
  `

  const response = await fetch(`${apiBaseUrl}/api/general/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, subject, text, html }),
  })

  if (!response.ok) {
    throw new RecScanningError("Failed to send scanner access code.", 502, "email_failed")
  }
}

export async function requestScannerOtp({ email: emailValue, conferenceId }, request) {
  assertCollectionConfigured(config.recScannerOperatorsCollectionId, "REC scanner operators")
  assertCollectionConfigured(config.recScannerOtpsCollectionId, "REC scanner OTPs")
  const email = normalizeEmail(emailValue)
  if (!email || !email.includes("@")) {
    throw new RecScanningError("Enter a valid scanner email address.", 400, "invalid_email")
  }
  if (!conferenceId) {
    throw new RecScanningError("Select a conference before requesting an access code.", 400, "missing_conference")
  }

  const operatorResult = await listRestDocuments(config.recScannerOperatorsCollectionId, [
    Query.equal("conferenceId", conferenceId),
    Query.equal("email", email),
    Query.limit(1),
  ])
  const operator = publicOperator(operatorResult.documents?.[0])
  try {
    assertScannerOperatorAccess(operator, { conferenceId, email })
  } catch (error) {
    if (error.code === "scanner_inactive") {
      throw new RecScanningError("This email is not active for scanner access on the selected conference.", 403, "scanner_not_allowed")
    }
    throw error
  }

  const conference = publicConference(await getRecScanningConference(conferenceId))
  const otpCode = String(randomInt(100000, 1000000))
  const otpId = randomUUID()
  const meta = extractClientMeta(request)
  await createRestDocument(config.recScannerOtpsCollectionId, compactDocumentData({
    conferenceId,
    operatorId: operator.$id,
    email,
    otpId,
    otpHash: hashValue(otpCode),
    expiresAt: addMs(new Date(), OTP_TTL_MS),
    attemptCount: 0,
    consumedAt: "",
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    createdAt: nowIso(),
  }))

  let devOtpCode = ""
  try {
    await sendScannerOtpEmail({ email, name: operator.name, conference, otpCode })
  } catch (error) {
    // Local/standalone test harnesses often have no email API configured
    // (NEXT_PUBLIC_API_BASE_URL unset - see README). Rather than block
    // testing the sign-in flow entirely, surface the code directly instead
    // of only emailing it. Never do this in production: a real deployment
    // must actually deliver the code by email, not hand it back in the API
    // response or print it to a shared log.
    if (process.env.NODE_ENV === "production") throw error
    console.warn(`[rec-scanner-otp] Email delivery unavailable - access code for ${email}: ${otpCode}`)
    devOtpCode = otpCode
  }
  return { success: true, otpId, conference, email, ...(devOtpCode ? { devOtpCode } : {}) }
}

export async function verifyScannerOtp({ email: emailValue, conferenceId, otpId, code, deviceId, deviceLabel }, request) {
  assertCollectionConfigured(config.recScannerOtpsCollectionId, "REC scanner OTPs")
  assertCollectionConfigured(config.recScannerSessionsCollectionId, "REC scanner sessions")
  const email = normalizeEmail(emailValue)
  const otpCode = normalizeString(code)
  if (!email || !conferenceId || !otpId || !/^\d{6}$/.test(otpCode)) {
    throw new RecScanningError("Invalid scanner verification request.", 400, "invalid_otp_request")
  }

  const otpResult = await listRestDocuments(config.recScannerOtpsCollectionId, [
    Query.equal("conferenceId", conferenceId),
    Query.equal("email", email),
    Query.equal("otpId", otpId),
    Query.limit(1),
  ])
  const otpRecord = otpResult.documents?.[0]
  if (!otpRecord || otpRecord.consumedAt) {
    throw new RecScanningError("Invalid or expired scanner access code.", 400, "invalid_otp")
  }
  if (Date.parse(otpRecord.expiresAt) < Date.now()) {
    throw new RecScanningError("This scanner access code has expired.", 400, "expired_otp")
  }
  if (Number(otpRecord.attemptCount || 0) >= MAX_OTP_ATTEMPTS) {
    throw new RecScanningError("Too many verification attempts. Request a new code.", 429, "otp_attempts_exceeded")
  }

  if (hashValue(otpCode) !== otpRecord.otpHash) {
    await updateRestDocument(config.recScannerOtpsCollectionId, otpRecord.$id, {
      attemptCount: Number(otpRecord.attemptCount || 0) + 1,
    })
    throw new RecScanningError("The scanner access code is incorrect.", 400, "invalid_otp")
  }

  const operator = await getScannerOperatorById(otpRecord.operatorId, { publicAccess: true })
  assertScannerOperatorAccess(operator, { conferenceId, email })

  const rawToken = crypto.randomBytes(32).toString("base64url")
  const meta = extractClientMeta(request)
  const expiresAt = addMs(new Date(), SCANNER_SESSION_TTL_MS)
  const session = await createRestDocument(config.recScannerSessionsCollectionId, compactDocumentData({
    operatorId: operator.$id,
    conferenceId,
    tokenHash: hashValue(rawToken),
    deviceId: normalizeString(deviceId) || randomUUID(),
    deviceLabel: normalizeString(deviceLabel),
    expiresAt,
    revokedAt: "",
    lastSeenAt: nowIso(),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    createdAt: nowIso(),
  }))

  await Promise.all([
    updateRestDocument(config.recScannerOtpsCollectionId, otpRecord.$id, { consumedAt: nowIso() }),
    updateRestDocument(config.recScannerOperatorsCollectionId, operator.$id, { lastLoginAt: nowIso() }),
  ])

  return {
    success: true,
    token: rawToken,
    expiresAt,
    sessionId: session.$id,
    operator,
    conference: publicConference(await getRecScanningConference(conferenceId)),
  }
}

async function scheduleScannerLastSeenUpdate(session) {
  const lastSeenAtMs = Date.parse(session.lastSeenAt || "")
  if (Number.isFinite(lastSeenAtMs) && Date.now() - lastSeenAtMs < SCANNER_LAST_SEEN_INTERVAL_MS) return

  await runAfterResponseOrNow(() => updateRestDocument(config.recScannerSessionsCollectionId, session.$id, { lastSeenAt: nowIso() })
    .catch((error) => console.error("REC scanner last-seen update failed", error)))
}

export async function getScannerContextFromBearer(request) {
  const authHeader = request.headers.get("authorization") || ""
  const [, rawToken] = authHeader.match(/^Bearer\s+(.+)$/i) || []
  if (!rawToken) return null

  const sessionResult = await listRestDocuments(config.recScannerSessionsCollectionId, [
    Query.equal("tokenHash", hashValue(rawToken)),
    Query.limit(1),
  ])
  const scannerSession = sessionResult.documents?.[0]
  if (!scannerSession || scannerSession.revokedAt || Date.parse(scannerSession.expiresAt) < Date.now()) {
    throw new RecScanningError("Scanner session has expired. Please sign in again.", 401, "scanner_session_expired")
  }

  const operator = await getScannerOperatorById(scannerSession.operatorId, { publicAccess: true })
  assertScannerOperatorAccess(operator, { conferenceId: scannerSession.conferenceId })

  await scheduleScannerLastSeenUpdate(scannerSession)
  return {
    type: "scanner",
    operator,
    session: scannerSession,
    conferenceId: scannerSession.conferenceId,
    scannerUserId: `scanner:${operator.$id}`,
    scannerName: operator.name,
  }
}

async function getActiveTeraAllocationForSerial(serial) {
  if (!config.recScannerAllocationsCollectionId || !serial) return null
  const result = await listRestDocuments(config.recScannerAllocationsCollectionId, [
    Query.equal("serialNumber", serial),
    Query.equal("isActive", true),
    Query.limit(1),
  ])
  return result.documents?.[0] || null
}

// Issued once a Tera device's serial has been validated against an active
// allocation (the GET handshake). The station must present this token on
// every subsequent request - the bare serial number is no longer enough by
// itself, since it isn't a secret (it's printed on the hardware).
export async function createTeraStationSession({ allocation, conferenceId, operator } = {}, request) {
  assertCollectionConfigured(config.recScannerSessionsCollectionId, "REC scanner sessions")
  const serial = normalizeString(allocation?.serialNumber)
  const rawToken = crypto.randomBytes(32).toString("base64url")
  const expiresAt = addMs(new Date(), SCANNER_SESSION_TTL_MS)
  const meta = request ? extractClientMeta(request) : { ipAddress: "", userAgent: "" }

  const session = await createRestDocument(config.recScannerSessionsCollectionId, compactDocumentData({
    operatorId: operator?.$id || `tera:${allocation?.$id || serial}`,
    conferenceId,
    tokenHash: hashValue(rawToken),
    deviceId: serial,
    deviceLabel: `Tera ${serial} · ${normalizeString(allocation?.deployedLocation)}`,
    expiresAt,
    revokedAt: "",
    lastSeenAt: nowIso(),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    createdAt: nowIso(),
  }))

  return { token: rawToken, expiresAt, sessionId: session.$id }
}

// Verifies a Tera station's bearer token. A session only counts as a Tera
// station session when its stored device id still matches a currently
// active allocation - this is how it's told apart from an operator's
// phone/OTP session without needing a new, separately-schema'd field.
export async function getTeraStationContextFromToken(request) {
  const authHeader = request.headers.get("authorization") || ""
  const [, rawToken] = authHeader.match(/^Bearer\s+(.+)$/i) || []
  if (!rawToken) return null

  const sessionResult = await listRestDocuments(config.recScannerSessionsCollectionId, [
    Query.equal("tokenHash", hashValue(rawToken)),
    Query.limit(1),
  ])
  const session = sessionResult.documents?.[0]
  if (!session || session.revokedAt || Date.parse(session.expiresAt) < Date.now()) {
    return null
  }

  const serialNumber = normalizeString(session.deviceId)
  const allocation = await getActiveTeraAllocationForSerial(serialNumber)
  if (!allocation) {
    return null
  }

  await scheduleScannerLastSeenUpdate(session)
  return {
    type: "tera-station",
    session,
    serialNumber,
    conferenceId: session.conferenceId,
    allocation,
  }
}

// A signed-in scanner's own performance for their conference: their accepted/
// rejected counts, where they rank among other scanners, a numbered table of
// their own recent scans, and the full scanner leaderboard (the same table
// shown in the admin Analytics "Scanner Performance" panel - every active
// operator sees the same data there, not just their own row).
export async function getScannerOwnStats(context, { scanLimit = 25 } = {}) {
  assertCollectionConfigured(config.recScansCollectionId, "REC scans")
  const conferenceId = context?.conferenceId
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")

  // Personal history and the latest conference rows come from scanner indexes.
  // Rank still uses the full conference set, shared for 30 seconds so every
  // open phone is not downloading it on each refresh.
  const safeScanLimit = Math.min(100, Math.max(1, Number.parseInt(scanLimit, 10) || 25))
  const [scans, conference, myScans, conferenceScans] = await Promise.all([
    listCachedConferenceScans(conferenceId),
    getRecScanningConference(conferenceId),
    listRecentScansForOperator({
      conferenceId,
      operatorId: context.operator?.$id,
      scannerUserId: context.scannerUserId,
      limit: safeScanLimit,
    }),
    listRecentIndexedScans({ conferenceId, limit: safeScanLimit }),
  ])

  const attributedScans = attributeRecScannerOperatorScans(scans, {
    operatorId: context.operator?.$id,
    scannerKey: context.scannerUserId,
    scannerName: context.scannerName,
  })
  const leaderboard = buildRecScannerLeaderboard(attributedScans)
  const { mine, rank, totalScanners } = getRecScannerRankInfo(leaderboard, context.scannerUserId)
  const attributedMine = attributeRecScannerOperatorScans(myScans, {
    operatorId: context.operator?.$id,
    scannerKey: context.scannerUserId,
    scannerName: context.scannerName,
  })
  const visibleScans = [...attributedMine, ...conferenceScans]
  const registrationIds = Array.from(new Set(visibleScans.map((scan) => scan.registrationId).filter(Boolean)))
  const eventIds = Array.from(new Set(visibleScans.map((scan) => scan.eventId).filter(Boolean)))
  const [registrations, events] = await Promise.all([
    registrationIds.length
      ? listRestDocuments(config.recRegistrationsCollectionId, [Query.equal("$id", registrationIds), Query.limit(registrationIds.length)])
      : Promise.resolve({ documents: [] }),
    eventIds.length
      ? listRestDocuments(config.recScanEventsCollectionId, [Query.equal("$id", eventIds), Query.limit(eventIds.length)])
      : Promise.resolve({ documents: [] }),
  ])

  return {
    operator: context.operator,
    conference: publicConference(conference),
    mine: mine || {
      key: context.scannerUserId,
      name: context.scannerName,
      total: 0,
      accepted: 0,
      rejected: 0,
      duplicates: 0,
      uniqueRegistrants: 0,
      acceptanceRate: 0,
      lastScanAt: "",
    },
    rank,
    totalScanners,
    leaderboard,
    recentScans: buildRecScanLogRows({
      scans: attributedMine,
      registrations: registrations.documents || [],
      events: events.documents || [],
    }),
     recentConferenceScans: buildRecScanLogRows({
      scans: conferenceScans,
      registrations: registrations.documents || [],
      events: events.documents || [],
    }).map((scan) => ({
      scanId: scan.scanId,
      scannedAt: scan.scannedAt,
      registrantName: scan.registrantName,
      eventName: scan.eventName,
      scannerName: scan.scannerName,
      deviceLabel: scan.deviceLabel,
      status: scan.status,
    })),
  }
}

export async function revokeScannerSession(request) {
  const context = await getScannerContextFromBearer(request)
  if (!context) return { success: true }
  await updateRestDocument(config.recScannerSessionsCollectionId, context.session.$id, { revokedAt: nowIso() })
  return { success: true }
}

export function buildRecQrPayload(rawToken) {
  return `${QR_PREFIX}${rawToken}`
}

function getRecPublicSiteBaseUrl() {
  return String(config.recPublicSiteUrl || "http://localhost:3000").replace(/\/+$/, "")
}

export function buildRecBadgeUrl(rawToken) {
  return `${getRecPublicSiteBaseUrl()}/badge/${encodeURIComponent(rawToken)}`
}

function createBadgeSecret() {
  return crypto.randomBytes(16).toString("hex")
}

function recoverReusableBadgeSecret(tokenDoc) {
  const recovered = recoverRecBadgeTokenFromUrl(tokenDoc?.lastBadgeUrl)
  if (!recovered || !tokenDoc?.tokenHash) return ""
  return hashValue(recovered) === tokenDoc.tokenHash ? recovered : ""
}

function getBadgeEmailApiUrl() {
  const apiBaseUrl = String(config.apiBaseUrl || "").trim().replace(/\/+$/, "")
  if (!apiBaseUrl) {
    throw new RecScanningError("Badge email is unavailable: NEXT_PUBLIC_API_BASE_URL is not configured.", 503, "email_api_missing")
  }
  try {
    const url = new URL(`${apiBaseUrl}/api/general/send-email`)
    if (url.protocol === "http:" || url.protocol === "https:") return url
  } catch {
    // Report malformed configuration with the same actionable error below.
  }
  throw new RecScanningError("Badge email is unavailable: NEXT_PUBLIC_API_BASE_URL must be an HTTP(S) URL.", 503, "email_api_invalid")
}

async function sendBadgeEmail({ badge, badgeUrl }) {
  const emailApiUrl = getBadgeEmailApiUrl()

  const registration = badge.registration || {}
  const conference = badge.conference || {}
  const subject = `${formatRecEdition(conference.year) || conference.shortName || conference.title || "REC"} conference badge`
  const recipientName = registration.name || "there"
  const conferenceTitle = badge.badgeTitle || conference.title || formatRecEdition(conference.year)
  const badgeNumber = badge.badgeNumberLabel || badge.badgeNumber || ""
  const text = `Your conference badge is ready

Hello ${recipientName},

Your digital badge for ${conferenceTitle} is ready.

Open this secure link on your phone and show it at conference scan points if you do not have your physical badge:
${badgeUrl}
${badgeNumber ? `\nManual badge number: ${badgeNumber}\nUse this number if camera scanning is not available.` : ""}

If the link does not belong to you, please contact the conference team.`
  const html = `
    <div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:620px;margin:0 auto;padding:28px 16px;">
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <div style="background:#2E9ECC;padding:24px;color:#ffffff;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#EFA74F;">REC & Expo</p>
            <h2 style="margin:0;font-size:23px;line-height:1.25;">Your conference badge is ready</h2>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 14px;">Hello ${escapeHtml(recipientName)},</p>
            <p style="margin:0 0 18px;line-height:1.6;">Your digital badge for <strong>${escapeHtml(conferenceTitle)}</strong> is ready.</p>
            ${badgeNumber ? `
              <div style="margin:0 0 18px;padding:14px 16px;border-radius:12px;background:#ecfeff;color:#2E9ECC;">
                <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Manual badge number</div>
                <div style="font-size:22px;font-weight:900;letter-spacing:.08em;">${escapeHtml(badgeNumber)}</div>
              </div>
            ` : ""}
            <p style="margin:0 0 20px;line-height:1.6;">Open this secure link on your phone and show it at conference scan points if you do not have your physical badge.</p>
            <p style="margin:0 0 22px;">
              <a href="${escapeHtml(badgeUrl)}" style="display:inline-block;background:#2E9ECC;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:9px;font-weight:800;">
                View My REC Badge
              </a>
            </p>
            <p style="margin:0 0 18px;word-break:break-all;overflow-wrap:anywhere;color:#475569;font-size:13px;line-height:1.55;"><a href="${escapeHtml(badgeUrl)}" style="color:#176F91;text-decoration:underline;">${escapeHtml(badgeUrl)}</a></p>
            <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">If the link does not belong to you, please contact the conference team.</p>
          </div>
        </div>
      </div>
    </div>
  `

  let response
  try {
    response = await fetch(emailApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: registration.email, subject, text, html }),
      signal: AbortSignal.timeout(BADGE_EMAIL_TIMEOUT_MS),
    })
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new RecScanningError("Badge email service timed out after 15 seconds.", 504, "badge_email_timeout")
    }
    throw new RecScanningError("Badge email service could not be reached.", 502, "badge_email_unavailable")
  }

  if (!response.ok) {
    throw new RecScanningError("Failed to send badge email.", 502, "badge_email_failed")
  }
}

function getRecWebAppUrl() {
  const configured = String(process.env.REC_WEB_APP_URL || config.recPublicSiteUrl || "").replace(/\/+$/, "")
  if (configured && !/localhost|127\.0\.0\.1/i.test(configured)) return `${configured}/`
  return REC_WEB_APP_URL
}

async function sendRecScanConfirmationEmail({ event, conference, registration }) {
  const recipient = {
    name: getRegistrantName(registration),
    email: registration?.email || "",
  }
  if (!shouldSendRecScanConfirmationEmail({
    status: SCAN_STATUSES.ACCEPTED,
    eventType: event?.type,
    email: recipient.email,
    registrationType: registration?.registrationType,
  })) {
    return false
  }

  const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "")
  if (!apiBaseUrl) {
    console.warn("Scan confirmation email skipped: email API is not configured.")
    return false
  }

  const copy = getRecScanConfirmationCopy({
    event,
    conference: publicConference(conference) || conference,
    registration: recipient,
    webAppUrl: getRecWebAppUrl(),
  })
  const text = `${copy.heading}

${copy.intro}

${copy.detail}

${copy.ctaLabel}:
${copy.siteUrl}`
  const html = `
    <div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:620px;margin:0 auto;padding:28px 16px;">
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <div style="background:#0B5E78;padding:24px;color:#ffffff;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#F5C078;">REC &amp; Expo</p>
            <h2 style="margin:0;font-size:23px;line-height:1.25;">${escapeHtml(copy.heading)}</h2>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(copy.intro)}</p>
            <p style="margin:0 0 22px;line-height:1.6;color:#475569;">${escapeHtml(copy.detail)}</p>
            <p style="margin:0 0 18px;">
              <a href="${escapeHtml(copy.siteUrl)}" style="display:inline-block;background:#2E9ECC;color:#ffffff;text-decoration:none;padding:13px 18px;border-radius:9px;font-weight:800;">
                ${escapeHtml(copy.ctaLabel)}
              </a>
            </p>
            <p style="margin:0;word-break:break-all;color:#64748b;font-size:13px;line-height:1.55;">${escapeHtml(copy.siteUrl)}</p>
          </div>
        </div>
      </div>
    </div>
  `

  const response = await fetch(`${apiBaseUrl}/api/general/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: recipient.email,
      subject: copy.subject,
      text,
      html,
    }),
  })

  if (!response.ok) {
    throw new RecScanningError("Failed to send scan confirmation email.", 502, "scan_email_failed")
  }
  return true
}

async function generateUniqueBadgeNumber(conference) {
  const year = conference?.year || new Date().getFullYear()
  const existing = conference?.$id
    ? await listAll(config.recBadgeTokensCollectionId, [Query.equal("conferenceId", conference.$id)])
    : []
  const usedNumbers = existing.map((doc) => doc.badgeNumber)

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const sequence = nextRecBadgeSequence(usedNumbers, year)
    if (!sequence) {
      throw new RecScanningError("Could not generate a unique badge number. Please try again.", 500, "badge_number_failed")
    }
    const candidate = buildRecBadgeNumber(year, sequence)
    const found = await listRestDocuments(config.recBadgeTokensCollectionId, [
      Query.equal("badgeNumber", candidate),
      Query.limit(1),
    ]).catch(() => ({ documents: [] }))
    if (!found.documents?.length) return candidate
    usedNumbers.push(candidate)
  }
  throw new RecScanningError("Could not generate a unique badge number. Please try again.", 500, "badge_number_failed")
}

async function ensureBadgeNumber(tokenDoc, conference) {
  const existing = normalizeBadgeNumber(tokenDoc?.badgeNumber)
  if (existing) return { tokenDoc, badgeNumber: existing }

  const badgeNumber = await generateUniqueBadgeNumber(conference)
  const updated = await updateRestDocument(config.recBadgeTokensCollectionId, tokenDoc.$id, { badgeNumber })
  return { tokenDoc: updated, badgeNumber }
}

async function ensureBadgeNumberIfActive(tokenDoc, conference) {
  if (!tokenDoc || tokenDoc.isActive !== true || tokenDoc.revokedAt) return tokenDoc
  if (normalizeBadgeNumber(tokenDoc.badgeNumber)) return tokenDoc
  try {
    return (await ensureBadgeNumber(tokenDoc, conference)).tokenDoc
  } catch {
    return tokenDoc
  }
}

async function registrationHasRevokedBadge(conferenceId, registrationId) {
  const history = await listRestDocuments(config.recBadgeTokensCollectionId, [
    Query.equal("conferenceId", conferenceId),
    Query.equal("registrationId", registrationId),
    Query.limit(25),
  ])
  return (history.documents || []).some((doc) => doc.revokedAt && doc.isActive !== true)
}

export async function issueBadgeToken({ conferenceId, registrationId, sendEmail = false, scope = "any" }, actorId) {
  assertCollectionConfigured(config.recBadgeTokensCollectionId, "REC badge tokens")
  if (!conferenceId || !registrationId) {
    throw new RecScanningError("Conference and registration are required.", 400, "missing_badge_context")
  }
  const badgeScope = ["any", "resend", "revoked", "print"].includes(scope) ? scope : "any"
  if (sendEmail) getBadgeEmailApiUrl()

  const [conference, registration] = await Promise.all([
    getRecScanningConference(conferenceId),
    getRestDocument(config.recRegistrationsCollectionId, registrationId),
  ])
  if (!conference) throw new RecScanningError("Conference was not found.", 404, "conference_not_found")
  if (!registration) throw new RecScanningError("Registration was not found.", 404, "registration_not_found")
  if (!isRegistrationEligibleForConference(registration, conference)) {
    throw new RecScanningError("This registration is not linked to the selected conference.", 400, "registration_wrong_conference")
  }
  if (isUnregisteredRecRegistration(registration)) sendEmail = false

  const existing = await listRestDocuments(config.recBadgeTokensCollectionId, [
    Query.equal("conferenceId", conferenceId),
    Query.equal("registrationId", registrationId),
    Query.equal("isActive", true),
    Query.limit(1),
  ])

  const activeBadge = existing.documents?.[0] || null
  if ((badgeScope === "print" || badgeScope === "revoked") && activeBadge) {
    return { skipped: true, reason: "active" }
  }
  if (badgeScope === "revoked" || ((badgeScope === "resend" || badgeScope === "print") && !activeBadge)) {
    const revoked = await registrationHasRevokedBadge(conferenceId, registrationId)
    if (badgeScope === "revoked" && !revoked) return { skipped: true, reason: "not_revoked" }
    if ((badgeScope === "resend" || badgeScope === "print") && revoked) return { skipped: true, reason: "revoked" }
  }
  if (sendEmail && !normalizeEmail(registration.email)) {
    throw new RecScanningError("This registration has no email address for badge delivery.", 400, "badge_email_missing")
  }

  let rawToken = createBadgeSecret()
  let tokenDoc
  let rotatingActiveBadge = false

  if (activeBadge) {
    tokenDoc = existing.documents[0]
    const reusableToken = recoverReusableBadgeSecret(tokenDoc)
    if (!reusableToken) {
      if (sendEmail) {
        throw new RecScanningError(
          "This active badge cannot be safely reissued by email because its original QR link is unavailable. Revoke it, then generate a replacement.",
          409,
          "badge_token_unrecoverable"
        )
      }
      rotatingActiveBadge = true
    } else {
      rawToken = reusableToken
    }
  } else {
    const badgeNumber = await generateUniqueBadgeNumber(conference)
    tokenDoc = await createRestDocument(config.recBadgeTokensCollectionId, compactDocumentData({
      conferenceId,
      registrationId,
      badgeNumber,
      tokenHash: hashValue(rawToken),
      lastBadgeUrl: buildRecBadgeUrl(rawToken),
      tokenVersion: 1,
      issuedAt: nowIso(),
      issuedBy: actorId || "",
      revokedAt: "",
      revokedBy: "",
      revokedReason: "",
      lastUsedAt: "",
      isActive: true,
    }))
  }

  const reissuingActiveBadge = Boolean(activeBadge)
  if (reissuingActiveBadge) {
    const badgeNumber = normalizeBadgeNumber(tokenDoc.badgeNumber) || await generateUniqueBadgeNumber(conference)
    const badgeUpdates = {
      ...(normalizeBadgeNumber(tokenDoc.badgeNumber) ? {} : { badgeNumber }),
      ...(rotatingActiveBadge ? {
        tokenHash: hashValue(rawToken),
        tokenVersion: Number(tokenDoc.tokenVersion || 1) + 1,
      } : {}),
      ...(!sendEmail ? { lastBadgeUrl: buildRecBadgeUrl(rawToken) } : {}),
      ...(!sendEmail ? {
        issuedAt: nowIso(),
        issuedBy: actorId || "",
        revokedAt: "",
        revokedBy: "",
        revokedReason: "",
        isActive: true,
      } : {}),
    }
    if (Object.keys(badgeUpdates).length) {
      tokenDoc = await updateRestDocument(config.recBadgeTokensCollectionId, tokenDoc.$id, badgeUpdates)
    }
  }

  const qrPayload = buildRecQrPayload(rawToken)
  const badgeUrl = buildRecBadgeUrl(rawToken)
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    margin: 2,
    width: 512,
    errorCorrectionLevel: "M",
    color: { dark: "#102a43", light: "#ffffff" },
  })

  const publicToken = publicBadgeToken(tokenDoc)
  const badge = {
    tokenId: tokenDoc.$id,
    badgeNumber: publicToken?.badgeNumber || "",
    badgeNumberLabel: publicToken?.badgeNumberLabel || "",
    qrPayload,
    qrDataUrl,
    badgeUrl,
    conference: publicConferenceForBadge(conference),
    registration: publicRegistration(registration, conference.year),
    badgeTitle: getRecBadgeConferenceTitle(conference),
    issuedAt: tokenDoc.issuedAt,
    tokenVersion: tokenDoc.tokenVersion || 1,
    lastEmailSentAt: tokenDoc.lastEmailSentAt || "",
    lastEmailStatus: tokenDoc.lastEmailStatus || "",
  }

  if (sendEmail) {
    try {
      await sendBadgeEmail({ badge, badgeUrl })
      const sentAt = nowIso()
      await updateRestDocument(config.recBadgeTokensCollectionId, tokenDoc.$id, compactDocumentData({
        ...(reissuingActiveBadge ? {
          issuedAt: sentAt,
          issuedBy: actorId || "",
          revokedAt: "",
          revokedBy: "",
          revokedReason: "",
          isActive: true,
        } : {}),
        lastEmailSentAt: sentAt,
        lastEmailSentTo: registration.email || "",
        lastEmailStatus: "sent",
        lastBadgeUrl: badgeUrl,
      })).catch(() => {})
      badge.lastEmailSentAt = sentAt
      badge.lastEmailSentTo = registration.email || ""
      badge.lastEmailStatus = "sent"
      if (reissuingActiveBadge) badge.issuedAt = sentAt
    } catch (error) {
      await updateRestDocument(config.recBadgeTokensCollectionId, tokenDoc.$id, compactDocumentData({
        lastEmailStatus: "failed",
        lastBadgeUrl: badgeUrl,
      })).catch(() => {})
      badge.lastEmailStatus = "failed"
      badge.emailError = error.message || "Failed to send badge email."
    }
  }

  return badge
}

function registrationMatchesBadgeSearch(registration, searchTerm) {
  const normalized = normalizeString(searchTerm).toLowerCase()
  if (!normalized) return true
  return [
    getRegistrantName(registration),
    registration?.email,
    registration?.otherEmail,
    registration?.phone,
    registration?.organization,
    registration?.country,
    registration?.registrationType,
  ].some((value) => String(value || "").toLowerCase().includes(normalized))
}

function mapRegistrationBadgeRow(registration, tokenDoc) {
  return {
    registration: publicRegistration(registration),
    badge: publicBadgeToken(tokenDoc),
  }
}

async function getBadgeTokensForConference(conferenceId, conference) {
  assertCollectionConfigured(config.recBadgeTokensCollectionId, "REC badge tokens")
  const tokens = await listAll(config.recBadgeTokensCollectionId, [
    Query.equal("conferenceId", conferenceId),
  ])
  const tokensWithNumbers = await Promise.all(tokens.map((token) => ensureBadgeNumberIfActive(token, conference)))
  tokensWithNumbers.sort((a, b) => Date.parse(b.issuedAt || b.$createdAt || 0) - Date.parse(a.issuedAt || a.$createdAt || 0))

  const latestByRegistration = new Map()
  const activeByRegistration = new Map()
  for (const token of tokensWithNumbers) {
    if (!latestByRegistration.has(token.registrationId)) latestByRegistration.set(token.registrationId, token)
    if (token.isActive === true && !token.revokedAt && !activeByRegistration.has(token.registrationId)) {
      activeByRegistration.set(token.registrationId, token)
    }
  }

  return { tokens: tokensWithNumbers, latestByRegistration, activeByRegistration }
}

export async function listRecBadgeRegistrations({
  conferenceId,
  page = 1,
  limit = 25,
  status = "all",
  search = "",
  idsOnly = false,
} = {}) {
  assertCollectionConfigured(config.recRegistrationsCollectionId, "REC registrations")
  assertCollectionConfigured(config.recBadgeTokensCollectionId, "REC badge tokens")
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")

  const conference = await getRecScanningConference(conferenceId)
  if (!conference) throw new RecScanningError("Conference was not found.", 404, "conference_not_found")

  const safePage = Math.max(1, Number.parseInt(page, 10) || 1)
  const safeLimit = Math.min(100, Math.max(5, Number.parseInt(limit, 10) || 25))
  const normalizedStatus = ["all", "without_badge", "with_badge", "revoked", "unregistered"].includes(status) ? status : "all"

  const registrations = await listAll(config.recRegistrationsCollectionId, [
    Query.contains("conferenceYears", Number(conference.year)),
    Query.orderDesc("$createdAt"),
  ])
  const { latestByRegistration, activeByRegistration } = await getBadgeTokensForConference(conferenceId, conference)

  const rows = registrations
    .filter((registration) => isRegistrationEligibleForConference(registration, conference))
    .filter((registration) => (
      normalizedStatus === "unregistered"
        ? isUnregisteredRecRegistration(registration)
        : !isUnregisteredRecRegistration(registration)
    ))
    .filter((registration) => registrationMatchesBadgeSearch(registration, search))
    .map((registration) => mapRegistrationBadgeRow(
      registration,
      activeByRegistration.get(registration.$id) || latestByRegistration.get(registration.$id) || null
    ))
    .filter((row) => {
      if (normalizedStatus === "unregistered") return true
      if (normalizedStatus === "with_badge") return row.badge?.isActive === true
      if (normalizedStatus === "without_badge") return !row.badge?.isActive
      if (normalizedStatus === "revoked") return Boolean(row.badge?.revokedAt) && row.badge?.isActive !== true
      return true
    })

  const counts = registrations.reduce((acc, registration) => {
    if (!isRegistrationEligibleForConference(registration, conference)) return acc
    if (isUnregisteredRecRegistration(registration)) {
      acc.unregistered += 1
      return acc
    }
    const activeToken = activeByRegistration.get(registration.$id)
    const latestToken = latestByRegistration.get(registration.$id)
    acc.total += 1
    if (activeToken) acc.withBadge += 1
    else acc.withoutBadge += 1
    if (latestToken?.revokedAt) acc.revoked += 1
    return acc
  }, { total: 0, withBadge: 0, withoutBadge: 0, revoked: 0, unregistered: 0 })

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / safeLimit))
  const start = (safePage - 1) * safeLimit
  const ids = rows.map((row) => row.registration?.$id).filter(Boolean)

  if (idsOnly) {
    return { ids, total, counts }
  }

  return {
    documents: rows.slice(start, start + safeLimit),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    counts,
    conference: publicConference(conference),
  }
}

export async function issueRecBadgeTokens({ conferenceId, registrationIds = [], sendEmail = true, scope = "any" } = {}, actorId) {
  const uniqueRegistrationIds = Array.from(new Set(normalizeArray(registrationIds))).slice(0, 100)
  const badgeScope = ["any", "resend", "revoked", "print"].includes(scope) ? scope : "any"
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")
  if (!uniqueRegistrationIds.length) throw new RecScanningError("Select at least one registration.", 400, "missing_registrations")
  if (sendEmail) getBadgeEmailApiUrl()

  const results = []
  for (const registrationId of uniqueRegistrationIds) {
    try {
      const badge = await issueBadgeToken({ conferenceId, registrationId, sendEmail, scope: badgeScope }, actorId)
      if (badge?.skipped) {
        results.push({ registrationId, ok: true, skipped: true, reason: badge.reason || "skipped" })
        continue
      }
      results.push({ registrationId, ok: true, badge })
    } catch (error) {
      results.push({
        registrationId,
        ok: false,
        error: error.message || "Badge generation failed.",
        code: error.code || "badge_issue_failed",
      })
    }
  }

  return {
    success: results.every((result) => result.ok),
    issued: results.filter((result) => result.ok && !result.skipped).length,
    skipped: results.filter((result) => result.skipped).length,
    failed: results.filter((result) => !result.ok).length,
    emailFailed: results.filter((result) => result.ok && !result.skipped && result.badge?.lastEmailStatus === "failed").length,
    results,
  }
}

const UNREGISTERED_RELEASE_LIMIT = 50

function attendanceDaysForUnregistered(conference, events) {
  const days = []
  for (const day of Array.isArray(conference?.days) ? conference.days : []) {
    if (day?.label) days.push(day.label)
    if (day?.name) days.push(day.name)
  }
  for (const event of events) {
    days.push(...getRecScanEventRequiredAttendanceDays(mapEvent(event), conference))
  }
  return Array.from(new Set(days.map((day) => String(day || "").trim()).filter(Boolean))).slice(0, 20)
}

export async function releaseUnregisteredQrCodes({ conferenceId, count = 1 } = {}, actorId) {
  assertCollectionConfigured(config.recRegistrationsCollectionId, "REC registrations")
  assertCollectionConfigured(config.recBadgeTokensCollectionId, "REC badge tokens")
  const requested = Number.parseInt(count, 10)
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")
  if (!Number.isFinite(requested) || requested < 1 || requested > UNREGISTERED_RELEASE_LIMIT) {
    throw new RecScanningError(`Release between 1 and ${UNREGISTERED_RELEASE_LIMIT} codes at a time.`, 400, "invalid_unregistered_count")
  }

  const conference = await getRecScanningConference(conferenceId)
  if (!conference) throw new RecScanningError("Conference was not found.", 404, "conference_not_found")

  const events = await listAll(config.recScanEventsCollectionId, [Query.equal("conferenceId", conferenceId)])
  const daysAttending = attendanceDaysForUnregistered(conference, events)
  const released = []
  let failure = ""

  for (let index = 0; index < requested; index += 1) {
    let registration = null
    let issued = false
    try {
      registration = await createRestDocument(config.recRegistrationsCollectionId, {
        email: `unregistered.${randomUUID()}@example.invalid`,
        firstName: "Delegate",
        lastName: "Code",
        phone: "Not provided",
        organization: "Not registered",
        city: "Not provided",
        stateRegion: "Not provided",
        country: "Not provided",
        registrationType: "Unregistered",
        conferenceYears: [Number(conference.year)],
        ...(daysAttending.length ? { daysAttending } : {}),
        additionalComments: "QR code released for a person who is not registered.",
      })
      const badge = await issueBadgeToken({
        conferenceId,
        registrationId: registration.$id,
        sendEmail: false,
        scope: "any",
      }, actorId)
      issued = true
      const label = String(badge.badgeNumberLabel || badge.badgeNumber || "Code").slice(0, 49)
      await updateRestDocument(config.recRegistrationsCollectionId, registration.$id, { lastName: label }).catch(() => {})
      released.push({
        registrationId: registration.$id,
        badgeNumber: badge.badgeNumber || "",
        badgeNumberLabel: label,
      })
    } catch (error) {
      failure = error.message || "Could not release an unregistered QR code."
      if (registration?.$id && !issued) {
        await deleteRestDocument(config.recRegistrationsCollectionId, registration.$id).catch(() => {})
      }
      break
    }
  }

  if (!released.length) {
    throw new RecScanningError(failure || "Could not release unregistered QR codes.", 500, "unregistered_release_failed")
  }

  return {
    released,
    failed: failure ? requested - released.length : 0,
    error: failure,
  }
}

export async function revokeRecBadgeToken({ conferenceId, registrationId, tokenId, reason = "" } = {}, actorId) {
  assertCollectionConfigured(config.recBadgeTokensCollectionId, "REC badge tokens")
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")
  if (!registrationId && !tokenId) {
    throw new RecScanningError("Registration or badge token is required.", 400, "missing_badge_target")
  }

  let tokenDoc = null
  if (tokenId) {
    tokenDoc = await getRestDocument(config.recBadgeTokensCollectionId, tokenId)
  } else {
    const existing = await listRestDocuments(config.recBadgeTokensCollectionId, [
      Query.equal("conferenceId", conferenceId),
      Query.equal("registrationId", registrationId),
      Query.equal("isActive", true),
      Query.limit(1),
    ])
    tokenDoc = existing.documents?.[0] || null
  }

  if (!tokenDoc || tokenDoc.conferenceId !== conferenceId) {
    throw new RecScanningError("Active badge token was not found.", 404, "badge_not_found")
  }

  const updated = await updateRestDocument(config.recBadgeTokensCollectionId, tokenDoc.$id, compactDocumentData({
    isActive: false,
    revokedAt: nowIso(),
    revokedBy: actorId || "",
    revokedReason: normalizeString(reason) || "Revoked by administrator",
  }))

  return publicBadgeToken(updated)
}

export async function resolvePublicRecBadge(rawTokenValue) {
  assertCollectionConfigured(config.recBadgeTokensCollectionId, "REC badge tokens")
  const matched = await resolveBadgeTokenMatch(rawTokenValue)
  const rawToken = matched.rawToken
  let badgeToken = matched.doc
  if (!badgeToken || badgeToken.revokedAt || badgeToken.isActive !== true) {
    throw new RecScanningError("This badge link is invalid or has been revoked.", 404, "invalid_badge")
  }

  const [conference, registration] = await Promise.all([
    getRecScanningConference(badgeToken.conferenceId),
    getRestDocument(config.recRegistrationsCollectionId, badgeToken.registrationId),
  ])

  if (!conference || !registration || !isRegistrationEligibleForConference(registration, conference)) {
    throw new RecScanningError("This badge is no longer linked to a valid registration.", 404, "badge_registration_missing")
  }

  const ensured = await ensureBadgeNumber(badgeToken, conference)
  badgeToken = ensured.tokenDoc

  const qrPayload = buildRecQrPayload(rawToken)
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    margin: 2,
    width: 512,
    errorCorrectionLevel: "M",
    color: { dark: "#102a43", light: "#ffffff" },
  })

  return {
    badge: publicBadgeToken(badgeToken),
    qrPayload,
    qrDataUrl,
    badgeUrl: buildRecBadgeUrl(rawToken),
    conference: publicConferenceForBadge(conference),
    registration: publicRegistration(registration, conference.year),
    badgeTitle: getRecBadgeConferenceTitle(conference),
  }
}

const PRINT_CARD_LIMIT = 80

export async function loadRecBadgePrintCards({ conferenceId, registrationIds }) {
  const ids = Array.from(new Set(
    (Array.isArray(registrationIds) ? registrationIds : String(registrationIds || "").split(","))
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  ))
  if (!conferenceId) {
    throw new RecScanningError("Choose a conference first.", 400, "conference_required")
  }
  if (!ids.length) {
    throw new RecScanningError("Select at least one registrant.", 400, "print_ids_required")
  }
  if (ids.length > PRINT_CARD_LIMIT) {
    throw new RecScanningError(`Open at most ${PRINT_CARD_LIMIT} cards at a time.`, 400, "print_limit")
  }

  const byRegistration = new Map()
  for (let index = 0; index < ids.length; index += 25) {
    const slice = ids.slice(index, index + 25)
    const listed = await listRestDocuments(config.recBadgeTokensCollectionId, [
      Query.equal("conferenceId", conferenceId),
      Query.equal("registrationId", slice),
      Query.equal("isActive", true),
      Query.limit(slice.length),
    ])
    for (const doc of listed.documents || []) {
      if (doc.isActive === true && !byRegistration.has(doc.registrationId)) {
        byRegistration.set(doc.registrationId, doc)
      }
    }
  }

  const slots = []
  for (let index = 0; index < ids.length; index += 6) {
    const slice = ids.slice(index, index + 6)
    const batch = await Promise.all(slice.map(async (id) => {
      const secret = recoverReusableBadgeSecret(byRegistration.get(id))
      if (!secret) return null
      try {
        return await resolvePublicRecBadge(secret)
      } catch {
        return null
      }
    }))
    slots.push(...batch)
  }
  const cards = slots.filter(Boolean)
  return { cards, skipped: slots.length - cards.length }
}

async function resolveBadgeToken(qrPayload) {
  return (await resolveBadgeTokenMatch(qrPayload)).doc
}

async function resolveBadgeTokenMatch(qrPayload) {
  const extracted = extractQrToken(qrPayload)
  const candidates = expandRecBadgeTokenCandidates(extracted)
  if (!candidates.length) return { doc: null, rawToken: extracted }

  // Every Appwrite round trip costs a scan most of a second, so look up all
  // candidate hashes in one query and keep the candidate priority order here.
  const hashes = candidates.map((candidate) => hashValue(candidate))
  const hashed = await listRestDocuments(config.recBadgeTokensCollectionId, [
    Query.equal("tokenHash", hashes),
    Query.equal("isActive", true),
    Query.limit(hashes.length),
  ])
  const byHash = new Map((hashed.documents || []).map((doc) => [doc.tokenHash, doc]))
  const hashIndex = hashes.findIndex((hash) => byHash.has(hash))
  if (hashIndex !== -1) return { doc: byHash.get(hashes[hashIndex]), rawToken: candidates[hashIndex] }

  const years = (await listRecScanningConferences().catch(() => ({ documents: [] }))).documents
    .map((conference) => conference.year)
    .filter(Boolean)

  const numberCandidates = candidates.flatMap((candidate) => (
    expandRecBadgeNumberCandidates(candidate, years).map((badgeNumber) => ({ candidate, badgeNumber }))
  ))
  if (!numberCandidates.length) return { doc: null, rawToken: extracted }

  const badgeNumbers = Array.from(new Set(numberCandidates.map((item) => item.badgeNumber)))
  const numberResult = await listRestDocuments(config.recBadgeTokensCollectionId, [
    Query.equal("badgeNumber", badgeNumbers),
    Query.equal("isActive", true),
    Query.limit(badgeNumbers.length),
  ]).catch(() => ({ documents: [] }))
  const byNumber = new Map((numberResult.documents || []).map((doc) => [doc.badgeNumber, doc]))
  const numberMatch = numberCandidates.find((item) => byNumber.has(item.badgeNumber))
  if (numberMatch) return { doc: byNumber.get(numberMatch.badgeNumber), rawToken: numberMatch.candidate }

  return { doc: null, rawToken: extracted }
}

async function findPreviousAcceptedScan(event, registrationId) {
  const queries = [
    Query.equal("eventId", event.$id),
    Query.equal("registrationId", registrationId),
    Query.equal("status", SCAN_STATUSES.ACCEPTED),
    Query.orderDesc("scannedAt"),
    Query.limit(1),
  ]
  if (event.scanRule === SCAN_RULES.ONCE_PER_DAY && event.day) {
    queries.unshift(Query.equal("day", event.day))
  }
  const result = await listRestDocuments(config.recScansCollectionId, queries)
  return result.documents?.[0] || null
}

export async function resolveConferenceIdForTeraScan(qrPayload) {
  const raw = normalizeString(qrPayload)
  if (raw) {
    try {
      const badgeToken = await resolveBadgeToken(raw)
      if (badgeToken?.conferenceId) return badgeToken.conferenceId
    } catch {
      // QR may be a registration id or an unknown badge; fall through.
    }

    try {
      const registration = await getRestDocument(config.recRegistrationsCollectionId, raw)
      const years = Array.isArray(registration?.conferenceYears) ? registration.conferenceYears.map(Number) : []
      if (years.length) {
        const conferences = await listRecScanningConferences()
        const match = conferences.documents.find((conference) => years.includes(Number(conference.year)))
        if (match?.$id) return match.$id
      }
    } catch {
      // Not a registration document id.
    }
  }

  const conferences = await listRecScanningConferences()
  const active = conferences.documents.find((conference) => conference.isActive) || conferences.documents[0]
  if (!active?.$id) {
    throw new RecScanningError("No conference is available for scanning.", 404, "conference_not_found")
  }
  return active.$id
}

export async function listTeraStationEvents(allocation, { conferenceId = "", now = new Date() } = {}) {
  const resolvedConferenceId = conferenceId || (await resolveConferenceIdForTeraScan(""))
  const documents = await listAll(config.recScanEventsCollectionId, [
    Query.equal("conferenceId", resolvedConferenceId),
    Query.equal("isActive", true),
    Query.orderAsc("sortOrder"),
  ])
  const operator = await getTeraOperatorForAllocation(allocation, resolvedConferenceId)
  const allowedTypes = new Set(getTeraStationEventTypes(allocation?.assignedRole, allocation?.deployedLocation))
  return documents
    .map(publicEvent)
    .filter((event) => (
      operator
        ? eventMatchesOperatorRestrictions(event, operator)
        : allowedTypes.has(event.type)
    ))
    .map((event) => ({
      ...event,
      isCurrentlyOpen: getRecScanEventWindowStatus(event, now).ok,
    }))
}

export async function recordTeraStationScan({
  qrPayload,
  allocation,
  serialNumber,
  now = new Date(),
  isBreakoutSessionActive = false,
} = {}) {
  assertCollectionConfigured(config.recScanEventsCollectionId, "REC scan events")
  if (!normalizeString(qrPayload)) {
    throw new RecScanningError("The badge QR is required.", 400, "missing_qr_payload")
  }

  // A valid Tera badge identifies its conference. Reuse this token below so
  // recording the scan does not repeat the same Appwrite lookup.
  const badgeToken = await resolveBadgeToken(qrPayload).catch(() => null)
  const conferenceId = badgeToken?.conferenceId || await resolveConferenceIdForTeraScan(qrPayload)
  const [operator, eventDocuments] = await Promise.all([
    getTeraOperatorForAllocation(allocation, conferenceId),
    listAll(config.recScanEventsCollectionId, [
      Query.equal("conferenceId", conferenceId),
      Query.equal("isActive", true),
      Query.orderAsc("sortOrder"),
    ]),
  ])
  if (operator) {
    assertScannerOperatorAccess(operator, { conferenceId })
  }

  const events = eventDocuments.map(publicEvent)

  const hidDecision = evaluateHidScanRules({
    assignedRole: allocation?.assignedRole,
    deployedLocation: allocation?.deployedLocation,
    now,
    isBreakoutSessionActive,
  })
  const preferredEventType = hidDecision.ok ? hidScanTypeToEventType(hidDecision.scanType) : ""
  const event = selectTeraScanEvent(events, {
    assignedRole: allocation?.assignedRole,
    deployedLocation: allocation?.deployedLocation,
    now,
    preferredEventType,
    operator,
  })

  if (!event) {
    const notice = explainMissingTeraScanEvent(events, {
      assignedRole: allocation?.assignedRole,
      deployedLocation: allocation?.deployedLocation,
      now,
      operator,
    })
    throw new RecScanningError(notice.message, 400, "no_matching_event", {
      nextEvent: notice.nextEvent,
    })
  }

  return recordRecScan({
    eventId: event.$id,
    qrPayload,
    deviceId: normalizeString(serialNumber),
    deviceLabel: formatTeraScanDeviceLabel({
      serialNumber,
      deployedLocation: allocation?.deployedLocation,
    }),
    clientNonce: `tera:${normalizeString(serialNumber)}:${Date.now()}`,
  }, {
    scannerUserId: operator?.$id || normalizeString(serialNumber),
    scannerName: formatTeraScannerName({
      serialNumber,
      deployedLocation: allocation?.deployedLocation,
      operatorName: operator?.name,
    }),
    conferenceId: event.conferenceId,
    operator,
  }, { event, badgeToken })
}

export async function recordRecScan({ eventId, qrPayload, clientNonce, deviceId, deviceLabel, manualOverrideReason }, scannerContext, preloaded = {}) {
  assertCollectionConfigured(config.recScansCollectionId, "REC scans")
  assertCollectionConfigured(config.recBadgeTokensCollectionId, "REC badge tokens")

  const event = publicEvent(preloaded.event || await getRestDocument(config.recScanEventsCollectionId, eventId))
  if (!event || event.isActive !== true) {
    throw new RecScanningError("The selected scan event is not active.", 400, "event_inactive")
  }

  assertAllowedEventForOperator(scannerContext?.operator, event)

  const availability = getRecScanEventWindowStatus(event)
  if (!availability.ok) {
    throw new RecScanningError(availability.message, 400, availability.code, {
      startsAt: availability.startsAt || "",
      endedAt: availability.endedAt || "",
    })
  }

  const conferencePromise = getRecScanningConference(event.conferenceId)
  conferencePromise.catch(() => {})
  const badgeToken = Object.hasOwn(preloaded, "badgeToken")
    ? preloaded.badgeToken
    : await resolveBadgeToken(qrPayload)
  // Start the registration read alongside the conference read; it is only
  // used after the token checks below pass.
  const registrationPromise = badgeToken && !badgeToken.revokedAt && badgeToken.conferenceId === event.conferenceId
    ? getRestDocument(config.recRegistrationsCollectionId, badgeToken.registrationId)
    : null
  registrationPromise?.catch(() => {})
  const conference = await conferencePromise
  const requiredDays = getRecScanEventRequiredAttendanceDays(event, conference)
  if (!badgeToken || badgeToken.revokedAt) {
    const attendance = {
      registeredDays: [],
      requiredDays,
      matchedDays: [],
      reason: "invalid_token",
      message: "",
    }
    await createRestDocument(config.recScansCollectionId, compactDocumentData({
      conferenceId: event.conferenceId,
      eventId: event.$id,
      registrationId: "",
      registrationEmail: "",
      scanTokenId: badgeToken?.$id || "",
      scanType: event.type,
      sessionId: event.sessionId || "",
      timeBlockId: event.timeBlockId || "",
      day: event.day || null,
      venue: event.venue || "",
      status: SCAN_STATUSES.REJECTED,
      resultReason: "invalid_token",
      scannedBy: scannerContext?.scannerUserId || "",
      scannerName: scannerContext?.scannerName || "",
      scannedAt: nowIso(),
      deviceId: normalizeString(deviceId),
      deviceLabel: normalizeString(deviceLabel),
      clientNonce: normalizeString(clientNonce),
      ...scanAttendanceFields(attendance),
      metadata: scanMetadata({ manualOverrideReason: manualOverrideReason || "" }, attendance),
    }))
    throw new RecScanningError("The badge QR is invalid or inactive.", 400, "invalid_token", { attendance })
  }

  if (badgeToken.conferenceId !== event.conferenceId) {
    throw new RecScanningError("This badge belongs to a different conference.", 400, "wrong_conference")
  }

  const registration = await registrationPromise

  if (!isRegistrationEligibleForConference(registration, conference)) {
    throw new RecScanningError("This registration is not linked to this conference.", 400, "registration_wrong_conference")
  }

  const eligibility = getRegistrationEventEligibility(registration, event, conference)
  if (!eligibility.ok) {
    await createRestDocument(config.recScansCollectionId, compactDocumentData({
      conferenceId: event.conferenceId,
      eventId: event.$id,
      registrationId: registration.$id,
      registrationEmail: registration.email || "",
      scanTokenId: badgeToken.$id,
      scanType: event.type,
      sessionId: event.sessionId || "",
      timeBlockId: event.timeBlockId || "",
      day: event.day || null,
      venue: event.venue || "",
      status: SCAN_STATUSES.REJECTED,
      resultReason: eligibility.reason,
      scannedBy: scannerContext?.scannerUserId || "",
      scannerName: scannerContext?.scannerName || "",
      scannedAt: nowIso(),
      deviceId: normalizeString(deviceId),
      deviceLabel: normalizeString(deviceLabel),
      clientNonce: normalizeString(clientNonce),
      ...scanAttendanceFields(eligibility.attendance),
      metadata: scanMetadata({}, eligibility.attendance),
    }))
    throw new RecScanningError(
      eligibility.message || "This registrant is not eligible for the selected scan event.",
      400,
      eligibility.reason,
      { attendance: eligibility.attendance }
    )
  }

  if (event.scanRule !== SCAN_RULES.MULTIPLE) {
    const duplicate = await findPreviousAcceptedScan(event, registration.$id)
    if (duplicate) {
      // Best-effort audit row so other scan stations can be alerted that this
      // badge was just reused. Never let this block the caller's response.
      const duplicateAudit = await createRestDocument(config.recScansCollectionId, compactDocumentData({
        conferenceId: event.conferenceId,
        eventId: event.$id,
        registrationId: registration.$id,
        registrationEmail: registration.email || "",
        scanTokenId: badgeToken.$id,
        scanType: event.type,
        sessionId: event.sessionId || "",
        timeBlockId: event.timeBlockId || "",
        day: event.day || null,
        venue: event.venue || "",
        status: SCAN_STATUSES.DUPLICATE,
        resultReason: "duplicate_event",
        scannedBy: scannerContext?.scannerUserId || "",
        scannerName: scannerContext?.scannerName || "",
        scannedAt: nowIso(),
        deviceId: normalizeString(deviceId),
        deviceLabel: normalizeString(deviceLabel),
        clientNonce: normalizeString(clientNonce),
        ...scanAttendanceFields(eligibility.attendance),
        metadata: scanMetadata({ previousScanId: duplicate.$id || "" }, eligibility.attendance),
      })).catch((error) => {
        console.error("Failed to record duplicate scan alert", error)
        return null
      })

      return {
        status: SCAN_STATUSES.DUPLICATE,
        reason: "duplicate_event",
        event,
        registration: publicRegistration(registration, conference.year),
        attendance: eligibility.attendance,
        previousScan: duplicate,
        scan: duplicateAudit,
      }
    }
  }

  const scan = await createRestDocument(config.recScansCollectionId, compactDocumentData({
    conferenceId: event.conferenceId,
    eventId: event.$id,
    registrationId: registration.$id,
    registrationEmail: registration.email || "",
    scanTokenId: badgeToken.$id,
    scanType: event.type,
    sessionId: event.sessionId || "",
    timeBlockId: event.timeBlockId || "",
    day: event.day || null,
    venue: event.venue || "",
    status: SCAN_STATUSES.ACCEPTED,
    resultReason: "ok",
    scannedBy: scannerContext?.scannerUserId || "",
    scannerName: scannerContext?.scannerName || "",
    scannedAt: nowIso(),
    deviceId: normalizeString(deviceId),
    deviceLabel: normalizeString(deviceLabel),
    clientNonce: normalizeString(clientNonce),
    ...scanAttendanceFields(eligibility.attendance),
    metadata: scanMetadata({}, eligibility.attendance),
  }))

  // The persisted scan is the result the operator needs immediately. These
  // best-effort side effects should not hold up the next person at the gate.
  await runAfterResponseOrNow(async () => {
    await Promise.all([
      updateRestDocument(config.recBadgeTokensCollectionId, badgeToken.$id, { lastUsedAt: scan.scannedAt })
        .catch((error) => console.error("REC badge last-used update failed", error)),
      sendRecScanConfirmationEmail({ event, conference, registration })
        .catch((error) => console.error("REC scan confirmation email failed", error)),
    ])
  })

  return {
    status: SCAN_STATUSES.ACCEPTED,
    reason: "ok",
    event,
    registration: publicRegistration(registration, conference.year),
    attendance: eligibility.attendance,
    scan,
  }
}

const SCAN_ALERT_DEFAULT_WINDOW_MS = 5 * 60 * 1000
const SCAN_ALERT_MAX_LIMIT = 50

export async function listRecentRecScanAlerts({ conferenceId, sinceIso = "", limit = 20 } = {}) {
  assertCollectionConfigured(config.recScansCollectionId, "REC scans")
  assertCollectionConfigured(config.recScanEventsCollectionId, "REC scan events")
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")

  const safeLimit = Math.min(SCAN_ALERT_MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 20))
  const sinceMs = sinceIso ? Date.parse(sinceIso) : NaN
  const since = Number.isNaN(sinceMs) ? addMs(new Date(), -SCAN_ALERT_DEFAULT_WINDOW_MS) : sinceIso

  const scanResult = await listRestDocuments(config.recScansCollectionId, [
    Query.equal("conferenceId", conferenceId),
    Query.equal("status", SCAN_STATUSES.DUPLICATE),
    Query.greaterThan("scannedAt", since),
    Query.orderDesc("scannedAt"),
    Query.limit(safeLimit),
  ])
  const scans = scanResult.documents || []
  const eventIds = Array.from(new Set(scans.map((scan) => scan.eventId).filter(Boolean)))
  const events = eventIds.length
    ? (await listRestDocuments(config.recScanEventsCollectionId, [
      Query.equal("$id", eventIds),
      Query.limit(eventIds.length),
    ])).documents || []
    : []

  return {
    alerts: buildRecScanAlerts(scans, events),
    since,
    now: nowIso(),
  }
}

function validateRecScanAnalyticsRange(from, to) {
  const fromMs = from ? Date.parse(from) : null
  const toMs = to ? Date.parse(to) : null
  if (from && Number.isNaN(fromMs)) {
    throw new RecScanningError("Enter a valid report start date.", 400, "invalid_analytics_from")
  }
  if (to && Number.isNaN(toMs)) {
    throw new RecScanningError("Enter a valid report end date.", 400, "invalid_analytics_to")
  }
  if (fromMs !== null && toMs !== null && toMs < fromMs) {
    throw new RecScanningError("Report end date must be after the start date.", 400, "invalid_analytics_range")
  }
}

async function loadRecScanAnalyticsDataset({ conferenceId, eventId = "", from = "", to = "" } = {}) {
  assertCollectionConfigured(config.recScansCollectionId, "REC scans")
  assertCollectionConfigured(config.recRegistrationsCollectionId, "REC registrations")
  assertCollectionConfigured(config.recScanEventsCollectionId, "REC scan events")
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")
  validateRecScanAnalyticsRange(from, to)

  const conference = await getRecScanningConference(conferenceId)
  if (!conference) throw new RecScanningError("Conference was not found.", 404, "conference_not_found")

  const scanQueries = [
    Query.equal("conferenceId", conferenceId),
    Query.orderDesc("scannedAt"),
  ]
  if (from) scanQueries.splice(1, 0, Query.greaterThanEqual("scannedAt", from))
  if (to) scanQueries.splice(1, 0, Query.lessThanEqual("scannedAt", to))

  const [allScans, registrations, events] = await Promise.all([
    listAll(config.recScansCollectionId, scanQueries),
    listAll(config.recRegistrationsCollectionId, [
      Query.contains("conferenceYears", Number(conference.year)),
      Query.orderDesc("$createdAt"),
    ]),
    listAll(config.recScanEventsCollectionId, [
      Query.equal("conferenceId", conferenceId),
    ]),
  ])

  if (eventId && !events.some((event) => event.$id === eventId)) {
    throw new RecScanningError("The selected scan event was not found for this conference.", 404, "scan_event_not_found")
  }

  return {
    conference,
    events: events.map(mapEvent),
    registrations: registrations.filter((registration) => {
      if (!isRegistrationEligibleForConference(registration, conference)) return false
      if (!isUnregisteredRecRegistration(registration)) return true
      return allScans.some((scan) => scan.registrationId === registration.$id)
    }),
    scans: eventId ? allScans.filter((scan) => scan.eventId === eventId) : allScans,
  }
}

export async function getRecScanAnalytics({ conferenceId, eventId, from, to } = {}) {
  const dataset = await loadRecScanAnalyticsDataset({ conferenceId, eventId, from, to })
  return {
    ...buildRecScanAnalytics(dataset),
    conference: publicConference(dataset.conference),
    filters: { conferenceId, eventId: eventId || "", from: from || "", to: to || "" },
  }
}

// A scan-station-facing, PII-free version of the admin analytics summary:
// aggregate counts only (how many are registered / signed in / not yet
// scanned, per-event totals) — never a registrant list or scan log. Scoped
// by scanner auth (Tera serial or bearer session), not admin "manage" access.
// The tally loads every scan and registration for the conference. Each open
// station polls it, so share one recent result instead of reloading per poll.
const SCANNER_TALLY_CACHE_TTL_MS = 30 * 1000
const scannerTallyCache = new Map()

export async function getRecScanTallyForScanner(conferenceId) {
  const cached = scannerTallyCache.get(conferenceId)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = buildRecScanTallyForScanner(conferenceId)
  scannerTallyCache.set(conferenceId, { promise, expiresAt: Date.now() + SCANNER_TALLY_CACHE_TTL_MS })
  promise.catch(() => scannerTallyCache.delete(conferenceId))
  return promise
}

async function buildRecScanTallyForScanner(conferenceId) {
  const dataset = await loadRecScanAnalyticsDataset({ conferenceId })
  const analytics = buildRecScanAnalytics(dataset)
  return {
    conference: publicConference(dataset.conference),
    summary: analytics.summary,
    byEvent: analytics.byEvent.map((event) => ({
      eventId: event.eventId,
      name: event.name,
      type: event.type,
      venue: event.venue,
      isActive: event.isActive,
      accepted: event.accepted,
      eligibleRegistrants: event.eligibleRegistrants,
      attendanceRate: event.attendanceRate,
    })),
    now: nowIso(),
  }
}

// Station history is limited to scans from this authenticated Tera. It returns
// the same registrant fields the scan response already shows, so a refresh
// does not wipe the name, category, and organization off the hall list.
export async function listRecentTeraStationScans({ conferenceId, serialNumber, limit = 50 } = {}) {
  assertCollectionConfigured(config.recScansCollectionId, "REC scans")
  if (!conferenceId || !serialNumber) {
    throw new RecScanningError("A Tera station session is required.", 401, "missing_station_session")
  }

  const safeLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 50))
  const scans = await listRecentIndexedScans({
    conferenceId,
    deviceId: normalizeString(serialNumber),
    limit: safeLimit,
  })

  const eventIds = Array.from(new Set(scans.map((scan) => scan.eventId).filter(Boolean)))
  const registrationIds = Array.from(new Set(scans.map((scan) => scan.registrationId).filter(Boolean)))
  const [eventResult, registrationResult, conference] = await Promise.all([
    eventIds.length
      ? listRestDocuments(config.recScanEventsCollectionId, [
        Query.equal("$id", eventIds),
        Query.limit(eventIds.length),
      ]).catch(() => ({ documents: [] }))
      : Promise.resolve({ documents: [] }),
    registrationIds.length
      ? listRestDocuments(config.recRegistrationsCollectionId, [
        Query.equal("$id", registrationIds),
        Query.limit(registrationIds.length),
      ]).catch(() => ({ documents: [] }))
      : Promise.resolve({ documents: [] }),
    getRecScanningConference(conferenceId).catch(() => null),
  ])
  const eventsById = new Map((eventResult.documents || []).map((event) => [event.$id, event]))
  const registrationsById = new Map((registrationResult.documents || []).map((registration) => [registration.$id, registration]))

  return {
    scans: scans.map((scan) => {
      const event = eventsById.get(scan.eventId)
      const registration = publicRegistration(registrationsById.get(scan.registrationId), conference?.year)
      return {
        id: scan.$id,
        scannedAt: scan.scannedAt || scan.$createdAt || "",
        status: scan.status || "",
        reason: scan.resultReason || "",
        eventName: event?.name || scan.scanType || "",
        venue: event?.venue || scan.venue || "",
        name: registration?.name || "",
        email: registration?.email || scan.registrationEmail || "",
        organization: registration?.organization || "",
        categoryTag: registration?.participantCategoryTag || "",
        categoryDirection: registration?.participantCategoryDirection || "",
      }
    }),
    now: nowIso(),
  }
}

export async function listRecScanAnalyticsRegistrants({
  conferenceId,
  eventId = "",
  from = "",
  to = "",
  search = "",
  attendance = "all",
  registrationType = "",
  participantCategory = "",
  page = 1,
  limit = 25,
} = {}) {
  const dataset = await loadRecScanAnalyticsDataset({ conferenceId, eventId, from, to })
  const validAttendance = ["all", "scanned", "not_scanned"].includes(attendance) ? attendance : "all"
  const validCategory = isRecParticipantCategoryValue(participantCategory) ? participantCategory : ""
  const rows = filterRecScanRegistrantRows(
    buildRecScanRegistrantRows(dataset),
    { search, attendance: validAttendance, registrationType, participantCategory: validCategory }
  ).sort((left, right) => (
    Date.parse(right.lastScanAt || 0) - Date.parse(left.lastScanAt || 0)
    || left.name.localeCompare(right.name)
  ))
  return {
    ...paginateRecAnalyticsRows(rows, page, limit),
    filters: {
      search: normalizeString(search),
      attendance: validAttendance,
      registrationType: normalizeString(registrationType),
      participantCategory: validCategory,
    },
  }
}

export async function listRecScanAnalyticsLog({
  conferenceId,
  eventId = "",
  from = "",
  to = "",
  search = "",
  status = "",
  scanner = "",
  page = 1,
  limit = 25,
} = {}) {
  const dataset = await loadRecScanAnalyticsDataset({ conferenceId, eventId, from, to })
  const validStatus = ["", "accepted", "rejected", "duplicate", "manual_override"].includes(status) ? status : ""
  const rows = filterRecScanLogRows(
    buildRecScanLogRows(dataset),
    { search, status: validStatus, scanner }
  )
  return {
    ...paginateRecAnalyticsRows(rows, page, limit),
    filters: {
      search: normalizeString(search),
      status: validStatus,
      scanner: normalizeString(scanner),
    },
  }
}

export async function getRecScanRegistrantAnalytics({ conferenceId, registrationId } = {}) {
  if (!conferenceId) throw new RecScanningError("Conference is required.", 400, "missing_conference")
  if (!registrationId) throw new RecScanningError("Registrant is required.", 400, "missing_registration")

  const [conference, registration, allScans, events] = await Promise.all([
    getRecScanningConference(conferenceId),
    getRestDocument(config.recRegistrationsCollectionId, registrationId).catch((error) => {
      if (error.status === 404) {
        throw new RecScanningError("Registrant was not found.", 404, "registration_not_found")
      }
      throw error
    }),
    listAll(config.recScansCollectionId, [
      Query.equal("conferenceId", conferenceId),
      Query.orderDesc("scannedAt"),
    ]),
    listAll(config.recScanEventsCollectionId, [
      Query.equal("conferenceId", conferenceId),
    ]),
  ])
  if (!conference || !isRegistrationEligibleForConference(registration, conference)) {
    throw new RecScanningError("Registrant is not linked to this conference.", 404, "registration_wrong_conference")
  }

  const registrantScans = allScans.filter((scan) => scan.registrationId === registrationId)
  const mappedEvents = events.map(mapEvent)
  const rosterRow = buildRecScanRegistrantRows({
    registrations: [registration],
    scans: registrantScans,
    events: mappedEvents,
  })[0]
  const scanHistory = buildRecScanLogRows({
    registrations: [registration],
    scans: registrantScans,
    events: mappedEvents,
  })

  return {
    registration: adminRegistrationDetails(registration),
    attendance: rosterRow,
    summary: buildRecScanAnalytics({
      scans: registrantScans,
      registrations: [registration],
      events: mappedEvents,
      conference,
    }).summary,
    scanHistory,
  }
}

const attendanceExportColumns = [
  { key: "name", label: "Registrant Name" },
  { key: "email", label: "Email" },
  { key: "organization", label: "Organization" },
  { key: "sponsorOrganization", label: "Sponsor Organization" },
  { key: "registrationType", label: "Registration Type" },
  { key: "participantCategoryLabel", label: "Participant Category" },
  { key: "country", label: "Country" },
  { key: "daysAttending", label: "Registered Days" },
  { key: "attendanceStatus", label: "Attendance Status" },
  { key: "eventCount", label: "Events Attended" },
  { key: "eventNames", label: "Scan Events" },
  { key: "acceptedScans", label: "Accepted Scans" },
  { key: "rejectedScans", label: "Rejected Scans" },
  { key: "firstScanAt", label: "First Scan" },
  { key: "lastScanAt", label: "Last Scan" },
  { key: "lastScanEventName", label: "Last Scan Event" },
  { key: "lastScanVenue", label: "Last Scan Venue" },
]

const scanLogExportColumns = [
  { key: "scannedAt", label: "Scanned At" },
  { key: "status", label: "Status" },
  { key: "reason", label: "Result Reason" },
  { key: "registrantName", label: "Registrant Name" },
  { key: "registrantEmail", label: "Registrant Email" },
  { key: "organization", label: "Organization" },
  { key: "registrationType", label: "Registration Type" },
  { key: "eventName", label: "Scan Event" },
  { key: "eventType", label: "Event Type" },
  { key: "eventDay", label: "Conference Day" },
  { key: "venue", label: "Venue" },
  { key: "scannerName", label: "Scanner" },
  { key: "deviceLabel", label: "Device" },
  { key: "registeredDays", label: "Registered Days" },
  { key: "matchedDays", label: "Matched Days" },
]

export async function exportRecScanAnalytics({
  kind = "attendance",
  conferenceId,
  eventId = "",
  from = "",
  to = "",
  search = "",
  attendance = "all",
  registrationType = "",
  participantCategory = "",
  status = "",
  scanner = "",
} = {}) {
  const dataset = await loadRecScanAnalyticsDataset({ conferenceId, eventId, from, to })
  const conferenceName = normalizeString(dataset.conference.shortName || dataset.conference.title || dataset.conference.year || "REC")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")

  if (kind === "scan_log") {
    const rows = filterRecScanLogRows(buildRecScanLogRows(dataset), { search, status, scanner })
    return {
      filename: (conferenceName || "REC") + "_Scan_Log.csv",
      csv: rowsToRecAnalyticsCsv(scanLogExportColumns, rows),
    }
  }

  const validCategory = isRecParticipantCategoryValue(participantCategory) ? participantCategory : ""
  const rows = filterRecScanRegistrantRows(
    buildRecScanRegistrantRows(dataset),
    { search, attendance, registrationType, participantCategory: validCategory }
  ).map((row) => ({
    ...row,
    participantCategoryLabel: formatRecParticipantCategory(row, dataset.conference?.year),
    eventNames: row.eventsAttended.map((event) => event.name),
  }))
  return {
    filename: (conferenceName || "REC") + "_Attendance_Report.csv",
    csv: rowsToRecAnalyticsCsv(attendanceExportColumns, rows),
  }
}
