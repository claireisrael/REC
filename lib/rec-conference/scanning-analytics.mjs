import { getRecScanAttendanceEligibility } from "./scanning-rules.mjs"

const ACCEPTED = "accepted"

function normalizeString(value) {
  return String(value || "").trim()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.map(normalizeString).filter(Boolean) : []
}

function percent(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((Number(numerator || 0) / Number(denominator)) * 1000) / 10
}

function timestamp(value) {
  const parsed = Date.parse(value || "")
  return Number.isNaN(parsed) ? 0 : parsed
}

function increment(map, key, count = 1) {
  const normalized = normalizeString(key) || "Unknown"
  map.set(normalized, (map.get(normalized) || 0) + count)
}

function sortCounts(map) {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function kampalaTimeBucket(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const read = (type) => parts.find((part) => part.type === type)?.value || ""
  const key = `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:00`
  return {
    key,
    label: `${read("day")}/${read("month")}/${read("year")} ${read("hour")}:00`,
  }
}

function registrationIsEligibleForEvent(registration, event, conference) {
  const allowedTypes = normalizeArray(event?.allowedRegistrationTypes)
  if (allowedTypes.length && !allowedTypes.includes(registration?.registrationType)) return false
  return getRecScanAttendanceEligibility(registration, event, conference).ok
}

export function getRecRegistrantName(registration) {
  return [registration?.title, registration?.firstName, registration?.otherName, registration?.lastName]
    .map(normalizeString)
    .filter(Boolean)
    .join(" ")
}

export function paginateRecAnalyticsRows(rows, page, limit, defaultLimit = 25) {
  const safeRows = Array.isArray(rows) ? rows : []
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1)
  const safeLimit = Math.min(100, Math.max(5, Number.parseInt(limit, 10) || defaultLimit))
  const total = safeRows.length
  const totalPages = Math.max(1, Math.ceil(total / safeLimit))
  const resolvedPage = Math.min(safePage, totalPages)
  const start = (resolvedPage - 1) * safeLimit

  return {
    documents: safeRows.slice(start, start + safeLimit),
    total,
    page: resolvedPage,
    limit: safeLimit,
    totalPages,
  }
}

export function buildRecScanAnalytics({ scans = [], registrations = [], events = [], conference = null } = {}) {
  const eventMap = new Map(events.map((event) => [event.$id, event]))
  const acceptedScans = scans.filter((scan) => scan.status === ACCEPTED)
  const rejectedScans = scans.filter((scan) => scan.status === "rejected")
  const duplicateScans = scans.filter((scan) => scan.status === "duplicate")
  const acceptedRegistrationIds = new Set(acceptedScans.map((scan) => scan.registrationId).filter(Boolean))

  const statusCounts = new Map()
  const typeCounts = new Map()
  const rejectionCounts = new Map()
  scans.forEach((scan) => {
    increment(statusCounts, scan.status || "unknown")
    increment(typeCounts, scan.scanType || "unknown")
    if (scan.status !== ACCEPTED) increment(rejectionCounts, scan.resultReason || scan.status || "unknown")
  })

  const eventRows = events.map((event) => {
    const eventScans = scans.filter((scan) => scan.eventId === event.$id)
    const accepted = eventScans.filter((scan) => scan.status === ACCEPTED)
    const rejected = eventScans.filter((scan) => scan.status === "rejected")
    const duplicates = eventScans.filter((scan) => scan.status === "duplicate")
    const uniqueRegistrants = new Set(accepted.map((scan) => scan.registrationId).filter(Boolean)).size
    const eligibleRegistrants = registrations.filter((registration) => (
      registrationIsEligibleForEvent(registration, event, conference)
    )).length
    return {
      eventId: event.$id,
      name: event.name || "Unnamed event",
      type: event.type || "custom",
      day: event.day || null,
      date: event.date || "",
      venue: event.venue || "",
      startTime: event.startTime || "",
      endTime: event.endTime || "",
      isActive: event.isActive === true,
      total: eventScans.length,
      accepted: accepted.length,
      rejected: rejected.length,
      duplicates: duplicates.length,
      uniqueRegistrants,
      eligibleRegistrants,
      attendanceRate: percent(uniqueRegistrants, eligibleRegistrants),
      lastScanAt: eventScans.reduce((latest, scan) => (
        timestamp(scan.scannedAt) > timestamp(latest) ? scan.scannedAt : latest
      ), ""),
    }
  }).sort((left, right) => (
    Number(left.day || 999) - Number(right.day || 999)
    || timestamp(left.startTime) - timestamp(right.startTime)
    || left.name.localeCompare(right.name)
  ))

  const unknownEventIds = Array.from(new Set(scans.map((scan) => scan.eventId).filter((id) => id && !eventMap.has(id))))
  unknownEventIds.forEach((eventId) => {
    const eventScans = scans.filter((scan) => scan.eventId === eventId)
    const accepted = eventScans.filter((scan) => scan.status === ACCEPTED)
    eventRows.push({
      eventId,
      name: "Deleted or unavailable event",
      type: eventScans[0]?.scanType || "unknown",
      day: eventScans[0]?.day || null,
      date: "",
      venue: eventScans[0]?.venue || "",
      startTime: "",
      endTime: "",
      isActive: false,
      total: eventScans.length,
      accepted: accepted.length,
      rejected: eventScans.filter((scan) => scan.status === "rejected").length,
      duplicates: eventScans.filter((scan) => scan.status === "duplicate").length,
      uniqueRegistrants: new Set(accepted.map((scan) => scan.registrationId).filter(Boolean)).size,
      eligibleRegistrants: 0,
      attendanceRate: 0,
      lastScanAt: eventScans.reduce((latest, scan) => (
        timestamp(scan.scannedAt) > timestamp(latest) ? scan.scannedAt : latest
      ), ""),
    })
  })

  const scannerMap = new Map()
  scans.forEach((scan) => {
    const key = normalizeString(scan.scannedBy || scan.scannerName) || "unknown"
    const current = scannerMap.get(key) || {
      key,
      name: normalizeString(scan.scannerName || scan.scannedBy) || "Unknown scanner",
      total: 0,
      accepted: 0,
      rejected: 0,
      duplicates: 0,
      registrationIds: new Set(),
      lastScanAt: "",
    }
    current.total += 1
    if (scan.status === ACCEPTED) current.accepted += 1
    if (scan.status === "rejected") current.rejected += 1
    if (scan.status === "duplicate") current.duplicates += 1
    if (scan.status === ACCEPTED && scan.registrationId) current.registrationIds.add(scan.registrationId)
    if (timestamp(scan.scannedAt) > timestamp(current.lastScanAt)) current.lastScanAt = scan.scannedAt
    scannerMap.set(key, current)
  })
  const byScanner = Array.from(scannerMap.values())
    .map((item) => ({
      key: item.key,
      name: item.name,
      total: item.total,
      accepted: item.accepted,
      rejected: item.rejected,
      duplicates: item.duplicates,
      uniqueRegistrants: item.registrationIds.size,
      acceptanceRate: percent(item.accepted, item.total),
      lastScanAt: item.lastScanAt,
    }))
    .sort((left, right) => right.accepted - left.accepted || left.name.localeCompare(right.name))

  const registrationDimensions = (field, fallback) => {
    const groups = new Map()
    registrations.forEach((registration) => {
      const key = normalizeString(registration?.[field]) || fallback
      const current = groups.get(key) || { key, label: key, registered: 0, scannedIds: new Set() }
      current.registered += 1
      if (acceptedRegistrationIds.has(registration.$id)) current.scannedIds.add(registration.$id)
      groups.set(key, current)
    })
    return Array.from(groups.values())
      .map((item) => ({
        key: item.key,
        label: item.label,
        registered: item.registered,
        scanned: item.scannedIds.size,
        attendanceRate: percent(item.scannedIds.size, item.registered),
      }))
      .sort((left, right) => right.registered - left.registered || left.label.localeCompare(right.label))
  }

  const dayMap = new Map()
  registrations.forEach((registration) => {
    const days = normalizeArray(registration.daysAttending)
    ;(days.length ? days : ["Unspecified"]).forEach((day) => {
      const current = dayMap.get(day) || { key: day, label: day, registeredIds: new Set(), scannedIds: new Set() }
      current.registeredIds.add(registration.$id)
      if (acceptedRegistrationIds.has(registration.$id)) current.scannedIds.add(registration.$id)
      dayMap.set(day, current)
    })
  })
  const byAttendanceDay = Array.from(dayMap.values()).map((item) => ({
    key: item.key,
    label: item.label,
    registered: item.registeredIds.size,
    scanned: item.scannedIds.size,
    attendanceRate: percent(item.scannedIds.size, item.registeredIds.size),
  }))

  const timelineMap = new Map()
  scans.forEach((scan) => {
    const bucket = kampalaTimeBucket(scan.scannedAt)
    if (!bucket) return
    const current = timelineMap.get(bucket.key) || {
      key: bucket.key,
      label: bucket.label,
      total: 0,
      accepted: 0,
      rejected: 0,
    }
    current.total += 1
    if (scan.status === ACCEPTED) current.accepted += 1
    if (scan.status !== ACCEPTED) current.rejected += 1
    timelineMap.set(bucket.key, current)
  })

  return {
    summary: {
      totalScanRecords: scans.length,
      acceptedScans: acceptedScans.length,
      rejectedScans: rejectedScans.length,
      duplicateScans: duplicateScans.length,
      uniqueAttendees: acceptedRegistrationIds.size,
      registeredAttendees: registrations.length,
      notYetScanned: Math.max(0, registrations.length - acceptedRegistrationIds.size),
      attendanceRate: percent(acceptedRegistrationIds.size, registrations.length),
      acceptanceRate: percent(acceptedScans.length, scans.length),
      configuredEvents: events.length,
      activeEvents: events.filter((event) => event.isActive === true).length,
    },
    byStatus: sortCounts(statusCounts),
    byType: sortCounts(typeCounts),
    byEvent: eventRows,
    byScanner,
    byRegistrationType: registrationDimensions("registrationType", "Unspecified"),
    byCountry: registrationDimensions("country", "Unspecified").slice(0, 10),
    byOrganization: registrationDimensions("organization", "Unspecified").slice(0, 10),
    byAttendanceDay,
    rejectionReasons: sortCounts(rejectionCounts),
    timeline: Array.from(timelineMap.values()).sort((left, right) => left.key.localeCompare(right.key)),
  }
}

export function buildRecScanRegistrantRows({ registrations = [], scans = [], events = [] } = {}) {
  const eventMap = new Map(events.map((event) => [event.$id, event]))
  const scansByRegistration = new Map()
  scans.forEach((scan) => {
    if (!scan.registrationId) return
    const rows = scansByRegistration.get(scan.registrationId) || []
    rows.push(scan)
    scansByRegistration.set(scan.registrationId, rows)
  })

  return registrations.map((registration) => {
    const registrationScans = scansByRegistration.get(registration.$id) || []
    const accepted = registrationScans.filter((scan) => scan.status === ACCEPTED)
    const rejected = registrationScans.filter((scan) => scan.status === "rejected")
    const eventIds = Array.from(new Set(accepted.map((scan) => scan.eventId).filter(Boolean)))
    const sortedScans = [...registrationScans].sort((left, right) => timestamp(left.scannedAt) - timestamp(right.scannedAt))
    return {
      registrationId: registration.$id,
      name: getRecRegistrantName(registration) || "Unnamed registrant",
      email: registration.email || "",
      organization: registration.organization || "",
      sponsorOrganization: registration.sponsorOrganization || "",
      registrationType: registration.registrationType || "",
      country: registration.country || "",
      daysAttending: normalizeArray(registration.daysAttending),
      attendanceStatus: accepted.length ? "scanned" : "not_scanned",
      totalScans: registrationScans.length,
      acceptedScans: accepted.length,
      rejectedScans: rejected.length,
      eventCount: eventIds.length,
      eventsAttended: eventIds.map((eventId) => ({
        eventId,
        name: eventMap.get(eventId)?.name || "Deleted or unavailable event",
      })),
      firstScanAt: sortedScans[0]?.scannedAt || "",
      lastScanAt: sortedScans[sortedScans.length - 1]?.scannedAt || "",
    }
  })
}

export function filterRecScanRegistrantRows(rows, {
  search = "",
  attendance = "all",
  registrationType = "",
} = {}) {
  const term = normalizeString(search).toLowerCase()
  return rows.filter((row) => {
    if (attendance !== "all" && row.attendanceStatus !== attendance) return false
    if (registrationType && row.registrationType !== registrationType) return false
    if (!term) return true
    return [row.name, row.email, row.organization, row.sponsorOrganization, row.country]
      .some((value) => normalizeString(value).toLowerCase().includes(term))
  })
}

export function buildRecScanLogRows({ scans = [], registrations = [], events = [] } = {}) {
  const registrationMap = new Map(registrations.map((registration) => [registration.$id, registration]))
  const eventMap = new Map(events.map((event) => [event.$id, event]))
  return [...scans]
    .sort((left, right) => timestamp(right.scannedAt) - timestamp(left.scannedAt))
    .map((scan) => {
      const registration = registrationMap.get(scan.registrationId)
      const event = eventMap.get(scan.eventId)
      return {
        scanId: scan.$id,
        scannedAt: scan.scannedAt || "",
        status: scan.status || "unknown",
        reason: scan.resultReason || "",
        registrationId: scan.registrationId || "",
        registrantName: registration ? getRecRegistrantName(registration) : "",
        registrantEmail: registration?.email || scan.registrationEmail || "",
        organization: registration?.organization || "",
        registrationType: registration?.registrationType || "",
        eventId: scan.eventId || "",
        eventName: event?.name || "Deleted or unavailable event",
        eventType: event?.type || scan.scanType || "",
        eventDay: event?.day || scan.day || null,
        venue: event?.venue || scan.venue || "",
        scannerKey: scan.scannedBy || scan.scannerName || "unknown",
        scannerName: scan.scannerName || scan.scannedBy || "Unknown scanner",
        deviceLabel: scan.deviceLabel || "",
        registeredDays: normalizeArray(scan.registrationDaysAttending),
        matchedDays: normalizeArray(scan.matchedAttendanceDays),
      }
    })
}

export function filterRecScanLogRows(rows, {
  search = "",
  status = "",
  scanner = "",
} = {}) {
  const term = normalizeString(search).toLowerCase()
  return rows.filter((row) => {
    if (status && row.status !== status) return false
    if (scanner && row.scannerKey !== scanner) return false
    if (!term) return true
    return [row.registrantName, row.registrantEmail, row.organization, row.eventName, row.scannerName]
      .some((value) => normalizeString(value).toLowerCase().includes(term))
  })
}

function safeSpreadsheetValue(value) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "")
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

function csvCell(value) {
  const safe = safeSpreadsheetValue(value).replace(/"/g, '""')
  return /[",\r\n]/.test(safe) ? `"${safe}"` : safe
}

export function rowsToRecAnalyticsCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label)).join(",")
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(","))
  return [header, ...body].join("\r\n")
}
