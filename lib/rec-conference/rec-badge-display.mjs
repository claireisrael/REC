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

const MONTHS = ["JAN.", "FEB.", "MAR.", "APR.", "MAY.", "JUN.", "JUL.", "AUG.", "SEP.", "OCT.", "NOV.", "DEC."]

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

function ordinal(day) {
  const n = Number(day)
  const remainder = n % 100
  if (remainder >= 11 && remainder <= 13) return `${n}TH`
  if (n % 10 === 1) return `${n}ST`
  if (n % 10 === 2) return `${n}ND`
  if (n % 10 === 3) return `${n}RD`
  return `${n}TH`
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
    return Number(year) === 2026 ? "19TH - 22ND OCT. 2026" : ""
  }
  const from = start || end
  const to = end || start
  if (from.year === to.year && from.month === to.month) {
    if (from.day === to.day) return `${ordinal(from.day)} ${MONTHS[from.month - 1]} ${from.year}`
    return `${ordinal(from.day)} - ${ordinal(to.day)} ${MONTHS[from.month - 1]} ${from.year}`
  }
  if (from.year === to.year) {
    return `${ordinal(from.day)} ${MONTHS[from.month - 1]} - ${ordinal(to.day)} ${MONTHS[to.month - 1]} ${from.year}`
  }
  return `${ordinal(from.day)} ${MONTHS[from.month - 1]} ${from.year} - ${ordinal(to.day)} ${MONTHS[to.month - 1]} ${to.year}`
}

export function formatRecBadgeVenue(conference) {
  return normalizeString(conference?.venue)
    || normalizeString(conference?.location)
    || "Kampala Serena Hotel"
}

export function formatRecBadgeTheme(conference) {
  return normalizeString(conference?.theme)
    || "From Systems to Scale: Powering Uganda's Green Economy"
}

export function formatRecBadgeHashtag(year) {
  return `#${formatRecEdition(year)}&EXPO`
}

export function formatRecBadgeEditionLine(year) {
  const digits = String(year ?? "").replace(/\D/g, "")
  const fullYear = digits.length >= 4 ? digits.slice(0, 4) : digits.length === 2 ? `20${digits}` : "2026"
  return `${fullYear} & Expo`
}
