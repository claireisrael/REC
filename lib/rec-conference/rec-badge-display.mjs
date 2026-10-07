import { formatRecEdition } from "./rec-edition.mjs"

const HONORIFICS = {
  dr: "Dr.",
  mr: "Mr.",
  ms: "Ms.",
  mrs: "Mrs.",
  miss: "Ms.",
  rev: "Rev.",
  prof: "Prof.",
  eng: "Eng.",
  profeng: "Prof.Eng.",
}

const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"]

function normalizeString(value) {
  return String(value || "").trim()
}

function parseBadgeDate(value) {
  const text = normalizeString(value)
  const dayMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dayMatch) {
    return {
      year: Number(dayMatch[1]),
      month: Number(dayMatch[2]),
      day: Number(dayMatch[3]),
    }
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return null
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

export function formatRecBadgeHonorific(value) {
  const raw = normalizeString(value)
  if (!raw) return ""
  const key = raw.replace(/[\s.]+/g, "").toLowerCase()
  if (HONORIFICS[key]) return HONORIFICS[key]
  return raw.endsWith(".") ? raw : `${raw}.`
}

export function formatRecBadgeDisplayName(registration) {
  const honorific = formatRecBadgeHonorific(registration?.title)
  const given = [registration?.firstName, registration?.otherName, registration?.lastName]
    .map(normalizeString)
    .filter(Boolean)
    .join(" ")

  if (given) return [honorific, given].filter(Boolean).join(" ")

  const name = normalizeString(registration?.name)
  if (!name) return "Participant"
  if (!honorific) return name

  const nameStart = name.replace(/\./g, "").toLowerCase()
  const honorificStart = honorific.replace(/\./g, "").toLowerCase()
  if (nameStart.startsWith(honorificStart)) return name
  return `${honorific} ${name}`
}

export function formatRecBadgeDateRange(startDate, endDate, year) {
  const start = parseBadgeDate(startDate)
  const end = parseBadgeDate(endDate)
  if (!start && !end) {
    return Number(year) === 2026 ? "19 - 22 OCTOBER, 2026" : ""
  }
  const from = start || end
  const to = end || start
  if (from.year === to.year && from.month === to.month) {
    if (from.day === to.day) return `${from.day} ${MONTHS[from.month - 1]}, ${from.year}`
    return `${from.day} - ${to.day} ${MONTHS[from.month - 1]}, ${from.year}`
  }
  if (from.year === to.year) {
    return `${from.day} ${MONTHS[from.month - 1]} - ${to.day} ${MONTHS[to.month - 1]}, ${from.year}`
  }
  return `${from.day} ${MONTHS[from.month - 1]}, ${from.year} - ${to.day} ${MONTHS[to.month - 1]}, ${to.year}`
}

export function formatRecBadgeVenue(conference) {
  return normalizeString(conference?.venue)
    || normalizeString(conference?.location)
    || "Kampala Serena Hotel"
}

export function formatRecBadgeTheme(conference) {
  return normalizeString(conference?.theme)
    || "From Systems to Scale: Transforming Uganda’s Green Economy"
}

export function formatRecBadgeHashtag(year) {
  return `#${formatRecEdition(year)} & EXPO`
}

export function formatRecBadgeEditionLine(year) {
  const digits = String(year ?? "").replace(/\D/g, "")
  const fullYear = digits.length >= 4 ? digits.slice(0, 4) : digits.length === 2 ? `20${digits}` : "2026"
  return `${fullYear} & Expo`
}

// Display-only relabeling for the printed badge. The underlying
// registrationType value ("Attendee") stays exactly what's stored and used
// everywhere else (eligibility checks, admin lists, exports, analytics) -
// only the badge's own printed wording changes.
const BADGE_ROLE_LABELS = {
  attendee: "Delegate",
  unregistered: "Delegate",
}

export function formatRecWalkInBadgeName(registration) {
  const badgeLabel = normalizeString(registration?.lastName)
  const suffix = badgeLabel && !/^(code|unregistered)$/i.test(badgeLabel) ? badgeLabel : ""
  return ["Delegate", suffix].filter(Boolean).join(" ")
}

export function formatDelegateSerial(sequence) {
  const number = Number(sequence)
  if (!Number.isInteger(number) || number < 1) return ""
  return `D-${String(number).padStart(3, "0")}`
}

export function readDelegateSerial(value) {
  const match = normalizeString(value).match(/^D-(\d+)$/i)
  return match ? Number(match[1]) : 0
}

export function formatRecBadgeCardCopy(registration) {
  if (String(registration?.registrationType || "") === "Unregistered") {
    return { name: "Delegate", underName: formatDelegateSerial(readDelegateSerial(registration?.organization)) }
  }
  return {
    name: normalizeString(registration?.name) || "Participant",
    underName: normalizeString(registration?.organization),
  }
}

export function formatRecBadgeRoleLabel(registrationType) {
  const raw = normalizeString(registrationType)
  if (!raw) return ""
  return BADGE_ROLE_LABELS[raw.toLowerCase()] || raw
}

// The role printed under the organisation. Admins can set badgeRole on a
// registration; without one, exhibitors print as Exhibitor and everyone else
// as Delegate. Released walk-in codes print no role.
export const REC_BADGE_ROLES = Object.freeze(["Delegate", "Exhibitor", "Official", "Crew"])

export function normalizeRecBadgeRole(value) {
  const raw = normalizeString(value).toLowerCase()
  return REC_BADGE_ROLES.find((role) => role.toLowerCase() === raw) || ""
}

export function resolveRecBadgeRole(registration) {
  const chosen = normalizeRecBadgeRole(registration?.badgeRole)
  if (chosen) return chosen
  const type = normalizeString(registration?.registrationType).toLowerCase()
  if (type === "unregistered") return ""
  return type === "exhibitor" ? "Exhibitor" : "Delegate"
}
