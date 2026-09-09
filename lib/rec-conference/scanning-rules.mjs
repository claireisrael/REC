export function parseDateMs(value) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? null : timestamp
}

export function getRecScanEventWindowStatus(event, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)
  if (Number.isNaN(nowMs)) return { ok: true, code: "event_time_unknown" }

  const startMs = parseDateMs(event?.startTime)
  const endMs = parseDateMs(event?.endTime)

  if (startMs && nowMs < startMs) {
    return {
      ok: false,
      code: "event_not_started",
      message: "This scan event has not started yet.",
      startsAt: event.startTime,
    }
  }

  if (endMs && nowMs > endMs) {
    return {
      ok: false,
      code: "event_ended",
      message: "This scan event has already ended.",
      endedAt: event.endTime,
    }
  }

  return { ok: true, code: "event_open" }
}

export function getRecScanEventWindowError(data) {
  const startMs = parseDateMs(data?.startTime)
  const endMs = parseDateMs(data?.endTime)
  if (startMs && endMs && endMs <= startMs) {
    return {
      code: "invalid_event_time_window",
      message: "Scan event end time must be after the start time.",
    }
  }
  return null
}

export const REC_SCANNER_OPERATOR_STATUSES = Object.freeze(["active", "suspended", "revoked"])
export const REC_SCAN_EVENT_BULK_DELETE_LIMIT = 100
export const REC_SCAN_EVENT_DELETE_CONFIRMATION = "DELETE_SCAN_EVENT_DATA"

export function normalizeRecScanEventIds(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)))
}

export function getRecScanEventBulkDeleteValidationError(data) {
  const conferenceId = String(data?.conferenceId || "").trim()
  const eventIds = normalizeRecScanEventIds(data?.eventIds)

  if (!conferenceId) {
    return { code: "missing_conference", field: "conferenceId", message: "Conference is required." }
  }
  if (!eventIds.length) {
    return { code: "missing_events", field: "eventIds", message: "Select at least one scan event." }
  }
  if (eventIds.length > REC_SCAN_EVENT_BULK_DELETE_LIMIT) {
    return {
      code: "too_many_events",
      field: "eventIds",
      message: `Delete no more than ${REC_SCAN_EVENT_BULK_DELETE_LIMIT} scan events at a time.`,
    }
  }
  if (data?.deleteScanData === true && data?.confirmation !== REC_SCAN_EVENT_DELETE_CONFIRMATION) {
    return {
      code: "scan_data_confirmation_required",
      field: "confirmation",
      message: "Confirm permanent deletion of the scan records before continuing.",
    }
  }
  return null
}

export function getRecScannerOperatorValidationError(operator) {
  const name = String(operator?.name || "").trim()
  const email = String(operator?.email || "").trim().toLowerCase()
  const status = String(operator?.status || "active").trim().toLowerCase()
  const accessStartsAt = operator?.accessStartsAt || ""
  const accessEndsAt = operator?.accessEndsAt || ""

  if (!name) {
    return { code: "missing_name", field: "name", message: "Scanner name is required." }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { code: "invalid_email", field: "email", message: "Enter a valid scanner email address." }
  }
  if (!REC_SCANNER_OPERATOR_STATUSES.includes(status)) {
    return { code: "invalid_status", field: "status", message: "Select a valid scanner status." }
  }

  const startsAtMs = parseDateMs(accessStartsAt)
  const endsAtMs = parseDateMs(accessEndsAt)
  if (accessStartsAt && startsAtMs === null) {
    return { code: "invalid_access_start", field: "accessStartsAt", message: "Enter a valid access start date and time." }
  }
  if (accessEndsAt && endsAtMs === null) {
    return { code: "invalid_access_end", field: "accessEndsAt", message: "Enter a valid access end date and time." }
  }
  if (startsAtMs !== null && endsAtMs !== null && endsAtMs <= startsAtMs) {
    return { code: "invalid_access_window", field: "accessEndsAt", message: "Access end time must be after the start time." }
  }
  return null
}

export function shouldRevokeRecScannerCredentials(current, next) {
  if (!current || !next) return false
  const currentEmail = String(current.email || "").trim().toLowerCase()
  const nextEmail = String(next.email || "").trim().toLowerCase()
  return next.status !== "active"
    || currentEmail !== nextEmail
    || !datesRepresentSameInstant(current.accessStartsAt, next.accessStartsAt)
    || !datesRepresentSameInstant(current.accessEndsAt, next.accessEndsAt)
}

function datesRepresentSameInstant(left, right) {
  if (!left && !right) return true
  const leftMs = parseDateMs(left)
  const rightMs = parseDateMs(right)
  if (leftMs !== null && rightMs !== null) return leftMs === rightMs
  return String(left || "") === String(right || "")
}

function normalizeString(value) {
  return String(value || "").trim()
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(normalizeString)
    .filter(Boolean)))
}

function parseDayNumber(value) {
  const direct = Number.parseInt(value, 10)
  if (direct > 0) return direct
  const match = normalizeString(value).match(/\d+/)
  return match ? Number.parseInt(match[0], 10) : null
}

export function normalizeRecAttendanceDay(value) {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, "")
}

export function getRecScanEventRequiredAttendanceDays(event, conference) {
  const configuredDays = uniqueStrings(event?.allowedDaysAttending)
  if (configuredDays.length) return configuredDays

  const conferenceDays = Array.isArray(conference?.days) ? conference.days : []
  const inferredDays = []
  const dayNumber = parseDayNumber(event?.day)

  if (dayNumber > 0) {
    const day = conferenceDays[dayNumber - 1]
    inferredDays.push(day?.label || day?.name || `Day ${dayNumber}`)
  }

  if (event?.date) {
    conferenceDays
      .filter((day) => normalizeString(day?.date) === normalizeString(event.date))
      .forEach((day) => inferredDays.push(day.label || day.name))
  }

  return uniqueStrings(inferredDays)
}

export function getRecScanAttendanceEligibility(registration, event, conference) {
  const registeredDays = uniqueStrings(registration?.daysAttending)
  const requiredDays = getRecScanEventRequiredAttendanceDays(event, conference)

  if (!requiredDays.length) {
    return {
      ok: true,
      reason: "no_day_restriction",
      registeredDays,
      requiredDays,
      matchedDays: [],
      message: "",
    }
  }

  const registeredByToken = new Map(registeredDays.map((day) => [normalizeRecAttendanceDay(day), day]))
  const matchedDays = requiredDays.filter((day) => registeredByToken.has(normalizeRecAttendanceDay(day)))

  if (matchedDays.length) {
    return {
      ok: true,
      reason: "registration_day_allowed",
      registeredDays,
      requiredDays,
      matchedDays,
      message: "",
    }
  }

  const registeredText = registeredDays.length ? registeredDays.join(", ") : "no selected days"
  const requiredText = requiredDays.join(", ")
  return {
    ok: false,
    reason: "registration_day_not_allowed",
    registeredDays,
    requiredDays,
    matchedDays: [],
    message: `This attendee is registered for ${registeredText}, but this scan point requires ${requiredText}.`,
  }
}

export const REC_2026_SCANNER_HALLS = Object.freeze([
  "Achwa Hall",
  "Katonga Hall",
  "Addis Hall",
  "Rwizi",
  "Nile Hall",
  "Kyoga Hall",
  "Victoria Hall (Main Auditorium)",
  "Kazinga",
])

export const REC_TERA_HW0009_SERIALS = Object.freeze([
  "01273102",
  "01050742",
  "01272982",
  "01273052",
  "01273072",
  "01050792",
  "01272972",
  "01273062",
  "01273112",
  "01273082",
])

export const REC_TERA_HW0009_DEPLOYMENTS = Object.freeze([
  { serialNumber: "01273102", assignedRole: "Hall Steward", deployedLocation: "Achwa Hall" },
  { serialNumber: "01050742", assignedRole: "Hall Steward", deployedLocation: "Katonga Hall" },
  { serialNumber: "01272982", assignedRole: "Hall Steward", deployedLocation: "Addis Hall" },
  { serialNumber: "01273052", assignedRole: "Hall Steward", deployedLocation: "Rwizi" },
  { serialNumber: "01273072", assignedRole: "Hall Steward", deployedLocation: "Nile Hall" },
  { serialNumber: "01050792", assignedRole: "Hall Steward", deployedLocation: "Kyoga Hall" },
  { serialNumber: "01272972", assignedRole: "Hall Steward", deployedLocation: "Victoria Hall (Main Auditorium)" },
  { serialNumber: "01273062", assignedRole: "Hall Steward", deployedLocation: "Kazinga" },
  { serialNumber: "01273112", assignedRole: "Main Gate", deployedLocation: "Main Entrance" },
  { serialNumber: "01273082", assignedRole: "Main Gate", deployedLocation: "Main Entrance" },
])

export const TERA_OPERATOR_EMAIL_DOMAIN = "tera.rec.local"

export const HID_KEYSTROKE_WINDOW_MS = 45
export const SESSION_HOPPER_WINDOW_MS = 90 * 60 * 1000
export const REC_EVENT_TIME_ZONE = "Africa/Kampala"

export const HID_SCAN_CODES = Object.freeze({
  EXHIBITOR_DEVICE_RESTRICTED: "EXHIBITOR_DEVICE_RESTRICTED",
  OUT_OF_WINDOW: "OUT_OF_WINDOW",
  DEVICE_UNREGISTERED: "DEVICE_UNREGISTERED",
  MISSING_QR_DATA: "MISSING_QR_DATA",
  MISSING_SERIAL: "MISSING_SERIAL",
})

export const HID_SCAN_TYPES = Object.freeze({
  ENTRANCE_ACCESS: "ENTRANCE_ACCESS",
  LUNCH_CHECKIN: "LUNCH_CHECKIN",
  SESSION_ATTENDANCE: "SESSION_ATTENDANCE",
  LATE_ARRIVAL_ACCESS: "LATE_ARRIVAL_ACCESS",
})

export const HID_EVENT_TYPES = Object.freeze({
  CONFERENCE_ENTRY: "conference_entry",
  LUNCH: "lunch",
  SESSION_ENTRY: "session_entry",
  CUSTOM: "custom",
})

export function normalizeHidSerial(value) {
  return String(value || "").trim()
}

export function isTeraHardwareSerial(value) {
  return REC_TERA_HW0009_SERIALS.includes(normalizeHidSerial(value))
}

export function isExhibitionRowAssignment(assignedRole = "") {
  return /^exhibition\s*row\s*[12]$/i.test(normalizeString(assignedRole))
}

export function isExhibitionHallLocation(location = "") {
  return /exhibition/i.test(normalizeString(location))
}

export function isMainEntranceLocation(location = "", assignedRole = "") {
  return /main\s*entrance|main\s*gate/i.test(`${assignedRole} ${location}`)
}

export function isSessionHallLocation(location = "") {
  const value = normalizeString(location).toLowerCase()
  if (!value || isMainEntranceLocation(value)) return false
  if (/food court|restaurant|dining|exhibition/.test(value)) return false
  return REC_2026_SCANNER_HALLS.some((hall) => hall.toLowerCase() === value)
    || /hall|auditorium|rwizi|kazinga/.test(value)
}

export function getEventLocalMinutes(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REC_EVENT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value || "", 10)
  const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value || "", 10)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

export function parseHidQrParticipantId(qrData) {
  const raw = String(qrData || "").trim()
  if (!raw) return ""

  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw)
      const fromObject = parsed?.participantId || parsed?.registrationId || parsed?.id || parsed?.userId
      if (fromObject) return String(fromObject).trim()
    } catch {
      // Fall through to URL / raw token parsing.
    }
  }

  try {
    const url = new URL(raw)
    const fromQuery =
      url.searchParams.get("participantId") ||
      url.searchParams.get("registrationId") ||
      url.searchParams.get("token") ||
      url.searchParams.get("id")
    if (fromQuery) return fromQuery.trim()
    const pathId = url.pathname.split("/").filter(Boolean).pop()
    if (pathId) return pathId.trim()
  } catch {
    // Not a URL.
  }

  return raw
}

export function evaluateHidScanRules({
  assignedRole = "",
  deployedLocation = "",
  now = new Date(),
  isBreakoutSessionActive = false,
} = {}) {
  if (isExhibitionRowAssignment(assignedRole) && !isExhibitionHallLocation(deployedLocation)) {
    return {
      ok: false,
      code: HID_SCAN_CODES.EXHIBITOR_DEVICE_RESTRICTED,
      message: HID_SCAN_CODES.EXHIBITOR_DEVICE_RESTRICTED,
    }
  }

  const minutes = getEventLocalMinutes(now)
  if (minutes == null) {
    return {
      ok: false,
      code: HID_SCAN_CODES.OUT_OF_WINDOW,
      message: HID_SCAN_CODES.OUT_OF_WINDOW,
    }
  }

  const inEntrance = minutes >= 7 * 60 + 30 && minutes <= 12 * 60
  const inLunch = minutes >= 13 * 60 && minutes < 14 * 60
  const inLateArrival = minutes >= 14 * 60 && minutes <= 16 * 60

  if (inEntrance) {
    return { ok: true, scanType: HID_SCAN_TYPES.ENTRANCE_ACCESS, code: HID_SCAN_TYPES.ENTRANCE_ACCESS }
  }

  if (inLunch) {
    if (isSessionHallLocation(deployedLocation) && isBreakoutSessionActive) {
      return {
        ok: true,
        scanType: HID_SCAN_TYPES.SESSION_ATTENDANCE,
        code: HID_SCAN_TYPES.SESSION_ATTENDANCE,
      }
    }
    return { ok: true, scanType: HID_SCAN_TYPES.LUNCH_CHECKIN, code: HID_SCAN_TYPES.LUNCH_CHECKIN }
  }

  if (inLateArrival) {
    return {
      ok: true,
      scanType: HID_SCAN_TYPES.LATE_ARRIVAL_ACCESS,
      code: HID_SCAN_TYPES.LATE_ARRIVAL_ACCESS,
    }
  }

  return {
    ok: false,
    code: HID_SCAN_CODES.OUT_OF_WINDOW,
    message: HID_SCAN_CODES.OUT_OF_WINDOW,
  }
}

export function isSessionHopperScan(previousScan, deployedLocation) {
  if (!previousScan) return false
  const previousLocation = normalizeString(previousScan.deployedLocation || previousScan.venue)
  const currentLocation = normalizeString(deployedLocation)
  if (!previousLocation || !currentLocation) return false
  return previousLocation.toLowerCase() !== currentLocation.toLowerCase()
}

export function hidScanTypeToEventType(scanType) {
  if (scanType === HID_SCAN_TYPES.LUNCH_CHECKIN) return HID_EVENT_TYPES.LUNCH
  if (scanType === HID_SCAN_TYPES.SESSION_ATTENDANCE) return HID_EVENT_TYPES.SESSION_ENTRY
  return HID_EVENT_TYPES.CONFERENCE_ENTRY
}

export function teraOperatorEmail(serialNumber) {
  const serial = normalizeHidSerial(serialNumber)
  return serial ? `sn${serial}@${TERA_OPERATOR_EMAIL_DOMAIN}` : ""
}

export function parseTeraSerialFromOperator(operator = {}) {
  const email = String(operator.email || "").trim().toLowerCase()
  const match = email.match(/^sn(\d+)@tera\.rec\.local$/i)
  if (match?.[1]) return match[1]
  const phone = normalizeHidSerial(operator.phone)
  if (REC_TERA_HW0009_SERIALS.includes(phone)) return phone
  return ""
}

export function isTeraScannerOperator(operator = {}) {
  return Boolean(parseTeraSerialFromOperator(operator))
    || String(operator.organization || "").toLowerCase().includes("tera hw0009")
}

export function eventMatchesOperatorRestrictions(event, operator) {
  if (!event || !operator) return true
  const ids = Array.isArray(operator.allowedEventIds) ? operator.allowedEventIds : []
  const types = Array.isArray(operator.allowedEventTypes) ? operator.allowedEventTypes : []
  const venues = Array.isArray(operator.allowedVenues) ? operator.allowedVenues : []
  const days = Array.isArray(operator.allowedDays) ? operator.allowedDays : []

  if (ids.length && !ids.includes(event.$id)) return false
  if (types.length && !types.includes(event.type)) return false
  if (venues.length && event.venue) {
    const venue = normalizeString(event.venue).toLowerCase()
    const matched = venues.some((item) => {
      const value = normalizeString(item).toLowerCase()
      return value && (value === venue || value.includes(venue) || venue.includes(value))
    })
    if (!matched) return false
  }
  if (days.length && event.day && !days.includes(String(event.day))) return false
  return true
}

export function getTeraStationEventTypes(assignedRole = "", deployedLocation = "") {
  if (isMainEntranceLocation(deployedLocation, assignedRole)) {
    return [HID_EVENT_TYPES.CONFERENCE_ENTRY, HID_EVENT_TYPES.LUNCH]
  }
  return [HID_EVENT_TYPES.SESSION_ENTRY, HID_EVENT_TYPES.LUNCH]
}

function toKampalaDateOnly(value) {
  const raw = normalizeString(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const ms = parseDateMs(raw)
  if (ms === null) return ""
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REC_EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms))
  const get = (type) => parts.find((part) => part.type === type)?.value || ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

export function getDefaultScannerAccessWindow(conference) {
  const days = Array.isArray(conference?.days) ? conference.days : []
  const dates = days.map((day) => toKampalaDateOnly(day?.date)).filter(Boolean)
  const start = dates[0] || toKampalaDateOnly(conference?.startDate)
  const end = dates[dates.length - 1] || toKampalaDateOnly(conference?.endDate) || start
  return {
    accessStartsAt: start ? `${start}T08:00:00+03:00` : "",
    accessEndsAt: end ? `${end}T18:00:00+03:00` : "",
    allowedDays: days.map((_, index) => String(index + 1)),
  }
}

export function resolveTeraOperatorAccess(existing = null, conference = null, provided = {}) {
  const defaults = getDefaultScannerAccessWindow(conference)
  const applyWindow = Object.hasOwn(provided || {}, "accessStartsAt") || Object.hasOwn(provided || {}, "accessEndsAt")
  const applyDays = Object.hasOwn(provided || {}, "allowedDays")
  const existingDays = Array.isArray(existing?.allowedDays) ? existing.allowedDays : []

  return {
    accessStartsAt: applyWindow
      ? normalizeString(provided.accessStartsAt)
      : (existing?.accessStartsAt || defaults.accessStartsAt || ""),
    accessEndsAt: applyWindow
      ? normalizeString(provided.accessEndsAt)
      : (existing?.accessEndsAt || defaults.accessEndsAt || ""),
    allowedDays: applyDays
      ? uniqueStrings(provided.allowedDays)
      : (existingDays.length ? existingDays : defaults.allowedDays),
  }
}

export function selectTeraScanEvent(events = [], {
  assignedRole = "",
  deployedLocation = "",
  now = new Date(),
  preferredEventType = "",
  operator = null,
} = {}) {
  const allowedTypes = new Set(getTeraStationEventTypes(assignedRole, deployedLocation))
  const candidates = events.filter((event) => {
    if (!event || event.isActive === false) return false
    if (operator) return eventMatchesOperatorRestrictions(event, operator)
    return allowedTypes.has(event.type)
  })
  if (!candidates.length) return null

  const location = normalizeString(deployedLocation).toLowerCase()
  const scoreEvent = (event) => {
    const availability = getRecScanEventWindowStatus(event, now)
    const venue = normalizeString(event.venue).toLowerCase()
    let points = Number(event.sortOrder || 0) * -1
    if (availability.ok) points += 100
    if (preferredEventType && event.type === preferredEventType) points += 20
    if (location && venue && (venue.includes(location) || location.includes(venue))) points += 15
    return points
  }

  return [...candidates].sort((left, right) => scoreEvent(right) - scoreEvent(left))[0]
}
