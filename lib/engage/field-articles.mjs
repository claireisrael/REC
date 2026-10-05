/**
 * NREP field activity articles (website articles).
 * Author → trip colleague (when 2+ staff went) → M&E (Rodney) → Lead → Repository.
 * Solo trips skip the colleague step and go straight to M&E.
 */

import { resolveKnownMeTeamMember } from "./known-me-team.mjs"
import { parseIdList } from "./rules.mjs"

export const FIELD_ARTICLE_TEMPLATE_ID = "tpl-field-article"
export const ARTICLE_FIRST_REVIEWER_SCOPE = "publisher_articles"

export function isFieldArticleReport(report = {}, content = null) {
  const body = content || report?.content || {}
  const templateId = String(report?.templateId || body?._templateKey || body?._templateId || "")
  if (templateId === FIELD_ARTICLE_TEMPLATE_ID) return true
  const short = String(body?._templateShortName || body?._docTypeName || body?._templateName || "").toLowerCase()
  return short.includes("article") && !short.includes("quarterly")
}

export function isKnownArticleFirstReviewerIdentity(
  { userId = "", name = "", email = "" } = {},
  options = {}
) {
  const known = resolveKnownMeTeamMember({ userId, name, email }, options)
  return known?.scopeLabel === ARTICLE_FIRST_REVIEWER_SCOPE
}

/** Resolve the article first M&E reviewer from Appwrite user rows. */
export function resolveArticleFirstReviewerFromUsers(
  users = [],
  { leadUserIds = [], authorId = null } = {}
) {
  const leads = new Set(parseIdList(leadUserIds).map((id) => String(id)))
  const author = String(authorId || "").trim()
  for (const user of Array.isArray(users) ? users : []) {
    const key = String(user?.userId || user?.$id || "").trim()
    if (!key || key === author || leads.has(key)) continue
    if (!isKnownArticleFirstReviewerIdentity(user)) continue
    return {
      userId: key,
      userName: String(user?.name || "").trim(),
      email: user?.email || null,
      profileId: user?.$id ? String(user.$id) : null,
    }
  }
  return null
}

/** M&E article first reviewer — Rodney only (not Lead, not author). */
export function listFieldArticleMeFirstReviewCandidates(
  meTeamUserIds = [],
  leadUserIds = [],
  authorId = null,
  users = []
) {
  const leads = new Set(parseIdList(leadUserIds).map((id) => String(id)))
  const author = String(authorId || "").trim()
  const userRows = Array.isArray(users) ? users : []

  const fromRoster = parseIdList(meTeamUserIds).filter((id) => {
    const key = String(id || "").trim()
    if (!key || key === author || leads.has(key)) return false
    const user = userRows.find(
      (row) => String(row.userId || row.$id || "") === key || String(row.$id || "") === key
    )
    if (user && isKnownArticleFirstReviewerIdentity(user)) return true
    return isKnownArticleFirstReviewerIdentity({ userId: key })
  })
  if (fromRoster.length) return fromRoster

  const fromDirectory = userRows
    .map((row) => {
      const key = String(row?.userId || row?.$id || "").trim()
      if (!key || key === author || leads.has(key)) return null
      return isKnownArticleFirstReviewerIdentity(row) ? key : null
    })
    .filter(Boolean)
  return [...new Set(fromDirectory)]
}

/**
 * Articles no longer skip trip-colleague review when other staff went on the activity.
 * Kept for callers that historically treated articles as always solo → M&E.
 */
export function fieldArticleSkipsPeerReview(_report = {}, _content = null) {
  return false
}

/**
 * Articles: Draft → (Colleague) → M&E → Lead → Repository.
 */
export function resolveFieldArticleJourneyStage(report = {}) {
  const status = String(report?.status || "")
  const waiting = String(report?.waitingOnRole || "")
  if (status === "draft" || status === "revision_requested" || status === "rejected") return 1
  if (status === "peer_review") return 2
  if (waiting === "me_lead" || status === "approved") return 4
  if (waiting === "me_team" || status === "under_review" || status === "submitted") return 3
  if (status === "published") return 5
  return 1
}

export const FIELD_ARTICLE_JOURNEY_NODES = Object.freeze([
  { id: 1, label: "Drafting", short: "Draft" },
  { id: 2, label: "Colleague review", short: "Colleague" },
  { id: 3, label: "M&E review", short: "M&E" },
  { id: 4, label: "M&E Lead", short: "Lead" },
  { id: 5, label: "Repository", short: "Published" },
])
