import { formatRecEdition } from "./rec-edition.mjs"

export const REC_BUSINESS_FORUM_SESSION = "business_forum"
export const REC_MARKETPLACE_SESSION = "marketplace"

export const REC_PARTICIPANT_CATEGORY_REC = "rec"
export const REC_PARTICIPANT_CATEGORY_UG_EU_BF = "ug_eu_bf"
export const REC_PARTICIPANT_CATEGORY_AEMP = "aemp"
export const REC_PARTICIPANT_CATEGORY_BOTH = "ug_eu_bf_aemp"

export const REC_PARTICIPANT_CATEGORIES = Object.freeze([
  {
    value: REC_PARTICIPANT_CATEGORY_REC,
    sessions: [],
    getLabel: (edition) => `${edition} & Expo`,
  },
  {
    value: REC_PARTICIPANT_CATEGORY_UG_EU_BF,
    sessions: [REC_BUSINESS_FORUM_SESSION],
    getLabel: (edition) => `${edition} & UG-EU BF`,
  },
  {
    value: REC_PARTICIPANT_CATEGORY_AEMP,
    sessions: [REC_MARKETPLACE_SESSION],
    getLabel: (edition) => `${edition} & AEMP`,
  },
  {
    value: REC_PARTICIPANT_CATEGORY_BOTH,
    sessions: [REC_BUSINESS_FORUM_SESSION, REC_MARKETPLACE_SESSION],
    getLabel: (edition) => `${edition}, UG-EU BF & AEMP`,
  },
])

export const REC_OPTIONAL_SESSIONS = Object.freeze([
  {
    value: REC_BUSINESS_FORUM_SESSION,
    label: "UG-EU Business Forum",
    badgeLabel: "UG-EU Business Forum",
  },
  {
    value: REC_MARKETPLACE_SESSION,
    label: "African Energy Market Place",
    badgeLabel: "African Energy Market Place",
  },
])

export function getRecOptionalSessionCopy() {
  return {
    label: "Participant category",
    intro: "Choose where you will be.",
  }
}

const NONE_TOKENS = new Set([
  "no", "n", "false", "0", "none", "rec", "conference", "main", "mainconference", "expo",
])

function cleanString(value) {
  return String(value || "").trim()
}

function uniqueStrings(values) {
  const allowed = new Set([REC_BUSINESS_FORUM_SESSION, REC_MARKETPLACE_SESSION])
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(cleanString)
    .filter((value) => allowed.has(value))))
}

function normalizeSessionToken(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function isConferenceOnlyToken(token) {
  return NONE_TOKENS.has(token) || /^rec\d{2}$/.test(token)
}

const CATEGORY_TOKEN_LOOKUP = new Map()

function registerCategoryTokens(sessions, tokens) {
  for (const token of tokens) {
    CATEGORY_TOKEN_LOOKUP.set(normalizeSessionToken(token), sessions)
  }
}

registerCategoryTokens([], [
  "REC26", "REC25", "REC24", "REC", "Conference", "Main conference",
  "REC26 & Expo", "REC26 & EXPO", "REC & Expo", "REC & EXPO", "Expo", "EXPO",
])
registerCategoryTokens([REC_BUSINESS_FORUM_SESSION], [
  "business_forum",
  "ug_eu_bf",
  "Business Forum",
  "UG-EU Business Forum",
  "UG-EU BF",
  "UG EU BF",
  "forum",
  "REC26 & UG-EU BF",
  "REC26 & UG-EU Business Forum",
])
registerCategoryTokens([REC_MARKETPLACE_SESSION], [
  "marketplace",
  "aemp",
  "AEMP",
  "African Energy Market Place",
  "African Energy Marketplace",
  "REC26 & AEMP",
  "REC26 & African Energy Market Place",
])
registerCategoryTokens([REC_BUSINESS_FORUM_SESSION, REC_MARKETPLACE_SESSION], [
  "both",
  "ug_eu_bf_aemp",
  "UG-EU BF & AEMP",
  "UG-EU BF and AEMP",
  "REC26, UG-EU BF & AEMP",
  "REC26 UG-EU BF & AEMP",
  "Business Forum / Marketplace",
  "Business Forum|Marketplace",
  "UG-EU Business Forum and African Energy Market Place",
])

function sessionsFromToken(token) {
  if (!token || isConferenceOnlyToken(token)) return []
  return CATEGORY_TOKEN_LOOKUP.get(token) || null
}

function resolveOptionalSession(item) {
  const token = normalizeSessionToken(item)
  const mapped = sessionsFromToken(token)
  return mapped ? [...mapped] : []
}

export function recOptionalSessionImportHint() {
  return "REC26 & Expo, REC26 & UG-EU BF, REC26 & AEMP, or REC26, UG-EU BF & AEMP"
}

export function normalizeRecOptionalSessions(value) {
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap(resolveOptionalSession))
  }

  const raw = cleanString(value)
  if (!raw) return []

  const fullMatch = sessionsFromToken(normalizeSessionToken(raw))
  if (fullMatch) return uniqueStrings(fullMatch)

  return uniqueStrings(raw.split(/[|;]/).flatMap(resolveOptionalSession))
}

export function getRecParticipantCategoryValue(value) {
  const selected = new Set(normalizeRecOptionalSessions(value?.additionalSessions ?? value))
  const hasForum = selected.has(REC_BUSINESS_FORUM_SESSION)
  const hasAemp = selected.has(REC_MARKETPLACE_SESSION)
  if (hasForum && hasAemp) return REC_PARTICIPANT_CATEGORY_BOTH
  if (hasForum) return REC_PARTICIPANT_CATEGORY_UG_EU_BF
  if (hasAemp) return REC_PARTICIPANT_CATEGORY_AEMP
  return REC_PARTICIPANT_CATEGORY_REC
}

export function isRecParticipantCategoryValue(categoryValue) {
  return REC_PARTICIPANT_CATEGORIES.some((category) => category.value === categoryValue)
}

export function registrationMatchesParticipantCategory(registration, categoryValue) {
  if (!categoryValue) return true
  return getRecParticipantCategoryValue(registration) === categoryValue
}

export function recParticipantCategoryFilterOptions(year) {
  const edition = formatRecEdition(year)
  return REC_PARTICIPANT_CATEGORIES.map((category) => ({
    value: category.value,
    label: category.getLabel(edition),
  }))
}

export function recParticipantCategoryQueryPlan(categoryValue) {
  if (!isRecParticipantCategoryValue(categoryValue)) return null

  if (categoryValue === REC_PARTICIPANT_CATEGORY_REC) {
    return { isNullAttribute: "additionalSessions", contains: [], notContains: [] }
  }

  const contains = sessionsForParticipantCategory(categoryValue)
  const notContains = []
  if (categoryValue === REC_PARTICIPANT_CATEGORY_UG_EU_BF) {
    notContains.push(REC_MARKETPLACE_SESSION)
  } else if (categoryValue === REC_PARTICIPANT_CATEGORY_AEMP) {
    notContains.push(REC_BUSINESS_FORUM_SESSION)
  }

  return { isNullAttribute: "", contains, notContains }
}

export function applyRecParticipantCategoryQueries(Query, queries, categoryValue) {
  const plan = recParticipantCategoryQueryPlan(categoryValue)
  if (!plan) return queries

  if (plan.isNullAttribute && typeof Query?.isNull === "function") {
    queries.push(Query.isNull(plan.isNullAttribute))
  }
  for (const value of plan.contains) {
    queries.push(Query.contains("additionalSessions", value))
  }
  if (typeof Query?.notContains === "function") {
    for (const value of plan.notContains) {
      queries.push(Query.notContains("additionalSessions", value))
    }
  }
  return queries
}

export function sessionsForParticipantCategory(categoryValue) {
  return [
    ...(REC_PARTICIPANT_CATEGORIES.find((category) => category.value === categoryValue)?.sessions || []),
  ]
}

export function formatRecParticipantCategory(value, year) {
  const edition = formatRecEdition(year)
  const categoryValue = getRecParticipantCategoryValue(value)
  const category = REC_PARTICIPANT_CATEGORIES.find((item) => item.value === categoryValue)
  return category.getLabel(edition)
}

export function formatRecParticipantCategoryTag(value, year) {
  return `#${formatRecParticipantCategory(value, year)}`
}

export function getRecParticipantCategoryDirection(value) {
  const categoryValue = getRecParticipantCategoryValue(value)
  if (categoryValue === REC_PARTICIPANT_CATEGORY_UG_EU_BF) return "UG-EU Business Forum"
  if (categoryValue === REC_PARTICIPANT_CATEGORY_AEMP) return "African Energy Market Place"
  if (categoryValue === REC_PARTICIPANT_CATEGORY_BOTH) return "UG-EU BF and AEMP"
  return "Main conference and Expo"
}

export function hasRecOptionalSession(registration, sessionValue = REC_BUSINESS_FORUM_SESSION) {
  return normalizeRecOptionalSessions(registration?.additionalSessions).includes(sessionValue)
}

export function formatRecOptionalSessions(value, year) {
  return [formatRecParticipantCategory(value, year)]
}

export function getRecBadgeConferenceTitle(conference) {
  return `${formatRecEdition(conference?.year)} & Expo`
}
