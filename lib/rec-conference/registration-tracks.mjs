export const REC_BUSINESS_FORUM_SESSION = "business_forum"

export const REC_OPTIONAL_SESSIONS = Object.freeze([
  {
    value: REC_BUSINESS_FORUM_SESSION,
    label: "Business Forum / Marketplace",
    badgeLabel: "Business Forum",
  },
])

function cleanString(value) {
  return String(value || "").trim()
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(cleanString)
    .filter(Boolean)))
}

function normalizeSessionToken(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, "")
}

const SESSION_LOOKUP = new Map(
  REC_OPTIONAL_SESSIONS.flatMap((session) => ([
    [session.value, session.value],
    [normalizeSessionToken(session.value), session.value],
    [normalizeSessionToken(session.label), session.value],
    [normalizeSessionToken(session.badgeLabel), session.value],
  ]))
)

SESSION_LOOKUP.set("yes", REC_BUSINESS_FORUM_SESSION)
SESSION_LOOKUP.set("y", REC_BUSINESS_FORUM_SESSION)
SESSION_LOOKUP.set("true", REC_BUSINESS_FORUM_SESSION)
SESSION_LOOKUP.set("1", REC_BUSINESS_FORUM_SESSION)
SESSION_LOOKUP.set("marketplace", REC_BUSINESS_FORUM_SESSION)
SESSION_LOOKUP.set("businessforummarketplace", REC_BUSINESS_FORUM_SESSION)

export function normalizeRecOptionalSessions(value) {
  const tokens = Array.isArray(value)
    ? value
    : cleanString(value).split(/[|;,]/)

  return uniqueStrings(tokens.map((item) => {
    const token = normalizeSessionToken(item)
    if (!token || ["no", "n", "false", "0", "none"].includes(token)) return ""
    return SESSION_LOOKUP.get(token) || SESSION_LOOKUP.get(normalizeSessionToken(item)) || ""
  }))
}

export function hasRecOptionalSession(registration, sessionValue = REC_BUSINESS_FORUM_SESSION) {
  return normalizeRecOptionalSessions(registration?.additionalSessions).includes(sessionValue)
}

export function formatRecOptionalSessions(value) {
  const selected = new Set(normalizeRecOptionalSessions(value))
  return REC_OPTIONAL_SESSIONS
    .filter((session) => selected.has(session.value))
    .map((session) => session.label)
}

export function getRecBadgeConferenceTitle(conference, registration) {
  const year = conference?.year || ""
  const defaultTitle = conference?.title
    || (year ? `Renewable Energy Conference & Expo ${year}` : "Renewable Energy Conference & Expo")

  if (!hasRecOptionalSession(registration, REC_BUSINESS_FORUM_SESSION)) {
    return defaultTitle
  }

  return `REC ${year} & Expo | Business Forum`.replace(/\s+/g, " ").trim()
}
