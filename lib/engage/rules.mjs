/**
 * NREP Engage — pure domain rules (safe for Node tests, no Appwrite SDK).
 */

import { isParticipantLogReport, participantLogSubmitGate } from "./participant-logs.mjs"

export const ENGAGE_ACTIVITY_TYPES = Object.freeze({
  FIELD_ACTIVITY: "field_activity",
  MEETING: "meeting",
  INCIDENT: "incident",
  WORKSHOP: "workshop",
  CONFERENCE: "conference",
  /** M&E programme / quarterly reports (e.g. eCooking Scale and Support) */
  PROGRAMME_REPORT: "programme_report",
})

export const ENGAGE_ACTIVITY_STATUSES = Object.freeze({
  PLANNED: "planned",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  ARCHIVED: "archived",
})

export const ENGAGE_REPORT_STATUSES = Object.freeze({
  DRAFT: "draft",
  SUBMITTED: "submitted",
  PEER_REVIEW: "peer_review",
  UNDER_REVIEW: "under_review",
  REVISION_REQUESTED: "revision_requested",
  REJECTED: "rejected",
  APPROVED: "approved",
  PUBLISHED: "published",
  ARCHIVED: "archived",
})

export const ENGAGE_DECISIONS = Object.freeze({
  APPROVED: "approved",
  REVISION_REQUESTED: "revision_requested",
  REJECTED: "rejected",
})

/** Peer field-review actions (pass-along chain before supervisor). */
export const ENGAGE_PEER_ACTIONS = Object.freeze({
  PASSED: "passed",
  SENT_TO_SUPERVISOR: "sent_to_supervisor",
  BOUNCED: "bounced",
  STARTED: "started",
  REASSIGNED: "reassigned",
  RESUBMITTED: "resubmitted",
})

export const PEER_REVIEW_GUIDING_TIPS = Object.freeze([
  "Check that findings and dates match what happened in the field",
  "Confirm photos and captions are clear and relevant",
  "Verify locations and participant names are accurate",
  "Ensure action points are specific, owned, and dated where possible",
])

export const ENGAGE_ROLES = Object.freeze({
  STAFF: "staff",
  FIELD_SUPERVISOR: "field_supervisor",
  DEPT_SUPERVISOR: "department_supervisor",
  ME_TEAM: "me_team",
  /** Waiting role only — assigned as M&E scope `lead`, not a separate staff role. */
  ME_LEAD: "me_lead",
  SUPER_ADMIN: "super_admin",
})

export const ENGAGE_NOTIFICATION_CHANNELS = Object.freeze({
  IN_APP: "in_app",
  EMAIL: "email",
  BOTH: "both",
})

/**
 * Formal approval chain after colleague field review.
 * Last colleague tags an M&E member (step 2), then M&E Lead publishes (step 3).
 */
export const DEFAULT_FIELD_ACTIVITY_WORKFLOW = Object.freeze([
  { order: 1, role: ENGAGE_ROLES.STAFF, action: "submit", slaDays: 0 },
  { order: 2, role: ENGAGE_ROLES.ME_TEAM, action: "approve", slaDays: 3 },
  { order: 3, role: ENGAGE_ROLES.ME_LEAD, action: "publish", slaDays: 5 },
])

/**
 * M&E programme quarterly reports:
 * author (M&E, including the Lead) → fellow peer review → M&E Lead approve → Super Admin publish.
 * If the author is the Lead, the lead step is skipped (no self-approve).
 * Peer pass-along runs in status peer_review before step 2.
 */
export const DEFAULT_ME_PROGRAMME_WORKFLOW = Object.freeze([
  { order: 1, role: ENGAGE_ROLES.ME_TEAM, action: "submit", slaDays: 0 },
  { order: 2, role: ENGAGE_ROLES.ME_LEAD, action: "approve", slaDays: 3 },
  { order: 3, role: ENGAGE_ROLES.SUPER_ADMIN, action: "publish", slaDays: 5 },
])

/** Incident reports: staff upload → Super Admin approve & publish to repository. */
export const DEFAULT_INCIDENT_WORKFLOW = Object.freeze([
  { order: 1, role: ENGAGE_ROLES.STAFF, action: "submit", slaDays: 0 },
  { order: 2, role: ENGAGE_ROLES.SUPER_ADMIN, action: "publish", slaDays: 5 },
])

/** Alias kept for older call sites / docs. */
export const ME_PROGRAMME_WORKFLOW_PROFILE = "me_peer_admin"

/** Templates / reports that use M&E fellows as peers and Super Admin as publisher. */
export function isMeProgrammeWorkflowProfile(value) {
  return String(value || "").trim().toLowerCase() === "me_peer_admin"
}

export function parseIdList(raw) {
  if (Array.isArray(raw)) return raw.map((id) => String(id)).filter(Boolean)
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

export function emptyMeFirstReviewState() {
  return {
    waitingOnUserId: null,
    waitingOnUserName: null,
    waitingOnIdentityIds: [],
    assignedAt: null,
    assignedBy: null,
    completedAt: null,
    completedBy: null,
    skipped: false,
  }
}

export function getMeFirstReviewState(content = {}) {
  const raw = content?._meFirstReview
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyMeFirstReviewState()
  }
  const waitingOnIdentityIds = parseIdList(raw.waitingOnIdentityIds)
  const waitingOnUserId = raw.waitingOnUserId ? String(raw.waitingOnUserId) : null
  if (waitingOnUserId && !waitingOnIdentityIds.includes(waitingOnUserId)) {
    waitingOnIdentityIds.unshift(waitingOnUserId)
  }
  return {
    waitingOnUserId,
    waitingOnUserName: raw.waitingOnUserName ? String(raw.waitingOnUserName) : null,
    waitingOnIdentityIds,
    assignedAt: raw.assignedAt || null,
    assignedBy: raw.assignedBy ? String(raw.assignedBy) : null,
    completedAt: raw.completedAt || null,
    completedBy: raw.completedBy ? String(raw.completedBy) : null,
    skipped: Boolean(raw.skipped),
  }
}

export function isAssignedMeFirstReviewer(state, userLike) {
  const targets = new Set()
  for (const id of [
    state?.waitingOnUserId,
    ...parseIdList(state?.waitingOnIdentityIds),
  ]) {
    const key = String(id || "").trim()
    if (key) targets.add(key)
  }
  if (!targets.size) return false
  const actorIds = engageIdentityIds(userLike)
  for (const target of targets) {
    if (actorIds.has(target)) return true
  }
  return false
}

/** M&E staff who can take the first field review — not the Lead, not the author. */
export function listMeFirstReviewCandidates(meTeamUserIds = [], leadUserIds = [], authorId = null) {
  const leads = new Set(parseIdList(leadUserIds).map((id) => String(id)))
  const author = String(authorId || "").trim()
  return parseIdList(meTeamUserIds).filter((id) => {
    const key = String(id || "").trim()
    if (!key || key === author) return false
    if (leads.has(key)) return false
    return true
  })
}

export function withMeFirstReview(content = {}, patch = {}) {
  const prev = getMeFirstReviewState(content)
  return {
    ...(content && typeof content === "object" ? content : {}),
    _meFirstReview: { ...prev, ...patch },
  }
}

export function preserveMeFirstReviewInContent(nextContent = {}, prevContent = {}) {
  const next = nextContent && typeof nextContent === "object" ? { ...nextContent } : {}
  const prev = getMeFirstReviewState(prevContent)
  const hasPrev = Boolean(prev.waitingOnUserId || prev.completedBy || prev.skipped)
  if (!hasPrev) return next
  if (next._meFirstReview && typeof next._meFirstReview === "object") return next
  next._meFirstReview = prev
  return next
}

export function emptyPeerReviewState(cycle = 1) {
  return {
    cycle: Number(cycle) > 0 ? Number(cycle) : 1,
    waitingOnUserId: null,
    waitingOnUserName: null,
    waitingOnIdentityIds: [],
    waitingSince: null,
    history: [],
  }
}

export function getPeerReviewState(content = {}) {
  const raw = content?._peerReview
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyPeerReviewState(1)
  }
  const waitingOnIdentityIds = parseIdList(raw.waitingOnIdentityIds)
  const waitingOnUserId = raw.waitingOnUserId ? String(raw.waitingOnUserId) : null
  if (waitingOnUserId && !waitingOnIdentityIds.includes(waitingOnUserId)) {
    waitingOnIdentityIds.unshift(waitingOnUserId)
  }
  return reconcilePeerReviewWaiting({
    cycle: Number(raw.cycle) > 0 ? Number(raw.cycle) : 1,
    waitingOnUserId,
    waitingOnUserName: raw.waitingOnUserName ? String(raw.waitingOnUserName) : null,
    waitingOnIdentityIds,
    waitingSince: raw.waitingSince || null,
    history: Array.isArray(raw.history) ? raw.history : [],
  })
}

/** Latest peer assignment from history (started / passed / reassigned). */
export function latestPeerAssignmentFromHistory(history = []) {
  const assignActions = new Set(["started", "passed", "reassigned"])
  const rows = Array.isArray(history) ? history : []
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const entry = rows[i]
    const action = String(entry?.action || "")
      .trim()
      .toLowerCase()
      .replace(/^peer_/, "")
    const toUserId = entry?.toUserId ? String(entry.toUserId).trim() : ""
    if (assignActions.has(action) && toUserId) {
      return {
        toUserId,
        toUserName: entry?.toUserName ? String(entry.toUserName) : "",
        at: entry?.at || null,
        action,
      }
    }
  }
  return null
}

/**
 * When `_peerReview.waitingOn*` drifted from history (e.g. heartbeat race during submit),
 * trust the latest assignment row — that is what the author actually chose.
 * Never revive a closed peer assignment after send-to-supervisor / bounce / formal resubmit.
 */
export function reconcilePeerReviewWaiting(peerState = {}) {
  const history = Array.isArray(peerState?.history) ? peerState.history : []
  const last = history[history.length - 1]
  const lastAction = String(last?.action || "")
    .trim()
    .toLowerCase()
    .replace(/^peer_/, "")

  const closedActions = new Set([
    ENGAGE_PEER_ACTIONS.SENT_TO_SUPERVISOR,
    "sent_to_supervisor",
    ENGAGE_PEER_ACTIONS.BOUNCED,
    "bounce",
    ENGAGE_PEER_ACTIONS.RESUBMITTED,
    "resubmitted",
  ])
  if (closedActions.has(lastAction)) {
    return {
      ...peerState,
      waitingOnUserId: null,
      waitingOnUserName: null,
      waitingOnIdentityIds: [],
      waitingSince: null,
    }
  }

  const latest = latestPeerAssignmentFromHistory(peerState?.history)
  if (!latest?.toUserId) return peerState

  const waiting = String(peerState?.waitingOnUserId || "").trim()
  const latestId = String(latest.toUserId).trim()
  if (waiting === latestId) return peerState

  const ids = parseIdList(peerState?.waitingOnIdentityIds)
  if (!ids.includes(latestId)) ids.unshift(latestId)

  return {
    ...peerState,
    waitingOnUserId: latestId,
    waitingOnUserName: latest.toUserName || peerState?.waitingOnUserName || "",
    waitingOnIdentityIds: ids,
    waitingSince: latest.at || peerState?.waitingSince || null,
  }
}

/**
 * Activity participants + reporters who may peer-review.
 * Excludes the primary author and optional co-authors/writers.
 * Trip supervisors who also went on the activity stay eligible — they can do the
 * first colleague review (excludeSupervisorId is ignored for field trips by callers).
 */
export function listPeerCandidates(
  activity = {},
  authorId,
  { excludeSupervisorId = null, excludeWriterIds = null } = {}
) {
  void excludeSupervisorId
  const exclude = new Set(
    [
      authorId ? String(authorId) : null,
      ...parseIdList(excludeWriterIds),
    ].filter(Boolean)
  )
  const ids = [
    ...parseIdList(activity.participantIds ?? activity.participantIdsJson),
    ...parseIdList(activity.reporterIds ?? activity.reporterIdsJson),
  ]
  const seen = new Set()
  const out = []
  for (const id of ids) {
    const key = String(id)
    if (!key || exclude.has(key) || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

export function peerRequiresFieldReview(activity = {}, authorId, options = {}) {
  return listPeerCandidates(activity, authorId, options).length > 0
}

export function reviewedUserIdsInCurrentCycle(peerState = {}) {
  const cycle = Number(peerState.cycle) > 0 ? Number(peerState.cycle) : 1
  const history = Array.isArray(peerState.history) ? peerState.history : []
  const ids = new Set()
  for (const entry of history) {
    if (Number(entry?.cycle) !== cycle) continue
    if (!entry?.userId) continue
    if (entry.action === ENGAGE_PEER_ACTIONS.STARTED) continue
    ids.add(String(entry.userId))
  }
  return ids
}

export function listPassablePeers(activity, authorId, peerState, options = {}) {
  const reviewed = reviewedUserIdsInCurrentCycle(peerState)
  const waiting = peerState?.waitingOnUserId ? String(peerState.waitingOnUserId) : null
  return listPeerCandidates(activity, authorId, options).filter(
    (id) => !reviewed.has(String(id)) && String(id) !== waiting
  )
}

/* ------------------------------------------------------------------ */
/* Shared co-author reports (one document, multiple writers)            */
/* ------------------------------------------------------------------ */

export const ENGAGE_SHARE_ROLES = Object.freeze({
  EDITOR: "editor",
  VIEWER: "viewer",
})

export function emptyCollaborationState() {
  return {
    coAuthorIds: [],
    coAuthorNames: [],
    viewerIds: [],
    viewerNames: [],
    invites: [],
    contentRevision: 1,
    lastSavedById: null,
    lastSavedByName: null,
    activeEditors: [],
  }
}

function normalizeShareInvites(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const userId = String(row.userId || "").trim()
    if (!userId || seen.has(userId)) continue
    const role =
      String(row.role || "").toLowerCase() === ENGAGE_SHARE_ROLES.VIEWER
        ? ENGAGE_SHARE_ROLES.VIEWER
        : ENGAGE_SHARE_ROLES.EDITOR
    seen.add(userId)
    out.push({
      userId,
      userName: String(row.userName || "").trim() || userId,
      role,
      invitedBy: row.invitedBy ? String(row.invitedBy) : null,
      invitedAt: row.invitedAt ? String(row.invitedAt) : null,
      message: String(row.message || "").trim().slice(0, 500) || null,
    })
  }
  return out
}

/** Freshness window for “colleague is working” presence (ms). */
export const ENGAGE_PRESENCE_TTL_MS = 45_000

const PRESENCE_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899"]

export function editorColorForUserId(userId) {
  const s = String(userId || "")
  let hash = 0
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]
}

function normalizeActiveEditors(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const userId = String(row.userId || "").trim()
    if (!userId || seen.has(userId)) continue
    seen.add(userId)
    const status = String(row.status || "editing").toLowerCase() === "viewing" ? "viewing" : "editing"
    const from = Number(row.cursorFrom)
    const to = Number(row.cursorTo)
    out.push({
      userId,
      userName: String(row.userName || "").trim() || userId,
      lastSeenAt: row.lastSeenAt ? String(row.lastSeenAt) : null,
      status,
      color: String(row.color || "").trim() || editorColorForUserId(userId),
      cursorFrom: Number.isFinite(from) ? from : null,
      cursorTo: Number.isFinite(to) ? to : null,
      snippet: String(row.snippet || "").trim().slice(0, 80) || null,
    })
  }
  return out
}

/** Read collaboration block from content object or report-like shape. */
export function getCollaborationState(contentOrReport = {}) {
  let content = contentOrReport
  if (contentOrReport && typeof contentOrReport === "object") {
    if (contentOrReport.content && typeof contentOrReport.content === "object") {
      content = contentOrReport.content
    } else if (typeof contentOrReport.contentJson === "string") {
      try {
        content = JSON.parse(contentOrReport.contentJson || "{}")
      } catch {
        content = {}
      }
    } else if (contentOrReport.contentJson && typeof contentOrReport.contentJson === "object") {
      content = contentOrReport.contentJson
    }
  }
  const raw = content?._collaboration
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyCollaborationState()
  }
  const coAuthorIds = parseIdList(raw.coAuthorIds)
  const names = Array.isArray(raw.coAuthorNames) ? raw.coAuthorNames.map((n) => String(n || "")) : []
  const viewerIds = parseIdList(raw.viewerIds)
  const viewerNames = Array.isArray(raw.viewerNames)
    ? raw.viewerNames.map((n) => String(n || ""))
    : []
  const contentRevision = Number(raw.contentRevision)
  return {
    coAuthorIds,
    coAuthorNames: names.slice(0, Math.max(names.length, coAuthorIds.length)),
    viewerIds,
    viewerNames: viewerNames.slice(0, Math.max(viewerNames.length, viewerIds.length)),
    invites: normalizeShareInvites(raw.invites),
    contentRevision: Number.isFinite(contentRevision) && contentRevision > 0 ? contentRevision : 1,
    lastSavedById: raw.lastSavedById ? String(raw.lastSavedById) : null,
    lastSavedByName: raw.lastSavedByName ? String(raw.lastSavedByName) : null,
    activeEditors: normalizeActiveEditors(raw.activeEditors),
  }
}

export function withCollaboration(content = {}, patch = {}) {
  const prev = getCollaborationState(content)
  const next = {
    coAuthorIds: patch.coAuthorIds !== undefined ? parseIdList(patch.coAuthorIds) : prev.coAuthorIds,
    coAuthorNames:
      patch.coAuthorNames !== undefined
        ? (Array.isArray(patch.coAuthorNames) ? patch.coAuthorNames : []).map((n) => String(n || ""))
        : prev.coAuthorNames,
    viewerIds: patch.viewerIds !== undefined ? parseIdList(patch.viewerIds) : prev.viewerIds,
    viewerNames:
      patch.viewerNames !== undefined
        ? (Array.isArray(patch.viewerNames) ? patch.viewerNames : []).map((n) => String(n || ""))
        : prev.viewerNames,
    invites: patch.invites !== undefined ? normalizeShareInvites(patch.invites) : prev.invites,
    contentRevision:
      patch.contentRevision !== undefined
        ? Math.max(1, Number(patch.contentRevision) || 1)
        : prev.contentRevision,
    lastSavedById:
      patch.lastSavedById !== undefined
        ? patch.lastSavedById
          ? String(patch.lastSavedById)
          : null
        : prev.lastSavedById,
    lastSavedByName:
      patch.lastSavedByName !== undefined
        ? patch.lastSavedByName
          ? String(patch.lastSavedByName)
          : null
        : prev.lastSavedByName,
    activeEditors:
      patch.activeEditors !== undefined
        ? normalizeActiveEditors(patch.activeEditors)
        : prev.activeEditors,
  }
  return {
    ...(content && typeof content === "object" ? content : {}),
    _collaboration: next,
  }
}

function alignNameList(ids = [], names = []) {
  return ids.map((id, index) => String(names[index] || "").trim() || id)
}

/**
 * Invite or change a colleague's share role on a draft (editor | viewer).
 * Editors write the Word body; viewers may open read-only. Mutually exclusive roles.
 */
export function applyReportShareRole(
  content = {},
  {
    userId,
    userName = "",
    role = ENGAGE_SHARE_ROLES.EDITOR,
    invitedBy = null,
    invitedAt = null,
    message = "",
  } = {}
) {
  const uid = String(userId || "").trim()
  if (!uid) return content && typeof content === "object" ? content : {}
  const nextRole =
    String(role || "").toLowerCase() === ENGAGE_SHARE_ROLES.VIEWER
      ? ENGAGE_SHARE_ROLES.VIEWER
      : ENGAGE_SHARE_ROLES.EDITOR
  const displayName = String(userName || "").trim() || uid
  const note = String(message || "").trim().slice(0, 500)
  const collab = getCollaborationState(content)

  let coAuthorIds = collab.coAuthorIds.filter((id) => id !== uid)
  let coAuthorNames = alignNameList(
    coAuthorIds,
    collab.coAuthorNames.filter((_, i) => collab.coAuthorIds[i] !== uid)
  )
  let viewerIds = collab.viewerIds.filter((id) => id !== uid)
  let viewerNames = alignNameList(
    viewerIds,
    collab.viewerNames.filter((_, i) => collab.viewerIds[i] !== uid)
  )

  if (nextRole === ENGAGE_SHARE_ROLES.EDITOR) {
    coAuthorIds = [...coAuthorIds, uid]
    coAuthorNames = [...coAuthorNames, displayName]
  } else {
    viewerIds = [...viewerIds, uid]
    viewerNames = [...viewerNames, displayName]
  }

  const invites = normalizeShareInvites(collab.invites).filter((row) => row.userId !== uid)
  invites.push({
    userId: uid,
    userName: displayName,
    role: nextRole,
    invitedBy: invitedBy ? String(invitedBy) : null,
    invitedAt: invitedAt || new Date().toISOString(),
    message: note || null,
  })

  return withCollaboration(content, {
    coAuthorIds,
    coAuthorNames,
    viewerIds,
    viewerNames,
    invites,
  })
}

/** Remove a colleague from editor and viewer lists. */
export function revokeReportShare(content = {}, userId) {
  const uid = String(userId || "").trim()
  if (!uid) return content && typeof content === "object" ? content : {}
  const collab = getCollaborationState(content)
  const coAuthorIds = collab.coAuthorIds.filter((id) => id !== uid)
  const coAuthorNames = alignNameList(
    coAuthorIds,
    collab.coAuthorNames.filter((_, i) => collab.coAuthorIds[i] !== uid)
  )
  const viewerIds = collab.viewerIds.filter((id) => id !== uid)
  const viewerNames = alignNameList(
    viewerIds,
    collab.viewerNames.filter((_, i) => collab.viewerIds[i] !== uid)
  )
  const invites = normalizeShareInvites(collab.invites).filter((row) => row.userId !== uid)
  return withCollaboration(content, {
    coAuthorIds,
    coAuthorNames,
    viewerIds,
    viewerNames,
    invites,
  })
}

/**
 * End every Share invite when a report is published.
 * Draft collaboration is over — invitees should not keep private access to the published report.
 * (Official copies live in the Knowledge Repository.)
 */
export function clearReportShareAccess(content = {}) {
  const base = content && typeof content === "object" ? content : {}
  return withCollaboration(base, {
    coAuthorIds: [],
    coAuthorNames: [],
    viewerIds: [],
    viewerNames: [],
    invites: [],
    activeEditors: [],
  })
}

/** True when the report has left the live share/edit track for invitees. */
export function isEngageReportShareAccessEnded(reportLike = {}) {
  const status = String(reportLike?.status || "").trim()
  if (status === ENGAGE_REPORT_STATUSES.PUBLISHED) return true
  if (status === ENGAGE_REPORT_STATUSES.ARCHIVED) return true
  if (reportLike?.publishedAt) return true
  return false
}

/**
 * Upsert one writer's presence and drop stale rows.
 * Does not change contentRevision — presence is ephemeral.
 */
export function upsertEditorPresence(
  content = {},
  {
    userId,
    userName = "",
    status = "editing",
    at = null,
    ttlMs = ENGAGE_PRESENCE_TTL_MS,
    cursorFrom = null,
    cursorTo = null,
    snippet = null,
    color = null,
  } = {}
) {
  const uid = String(userId || "").trim()
  if (!uid) return content && typeof content === "object" ? content : {}
  const nowIso = at || new Date().toISOString()
  const nowMs = Date.parse(nowIso) || Date.now()
  const collab = getCollaborationState(content)
  const fresh = collab.activeEditors.filter((row) => {
    if (String(row.userId) === uid) return false
    const seen = Date.parse(row.lastSeenAt || "")
    if (!Number.isFinite(seen)) return false
    return nowMs - seen <= ttlMs
  })
  const from = Number(cursorFrom)
  const to = Number(cursorTo)
  fresh.push({
    userId: uid,
    userName: String(userName || "").trim() || uid,
    lastSeenAt: nowIso,
    status: String(status || "editing").toLowerCase() === "viewing" ? "viewing" : "editing",
    color: String(color || "").trim() || editorColorForUserId(uid),
    cursorFrom: Number.isFinite(from) ? from : null,
    cursorTo: Number.isFinite(to) ? to : null,
    snippet: String(snippet || "").trim().slice(0, 80) || null,
  })
  return withCollaboration(content, { activeEditors: fresh })
}

/** Remove one writer from presence (leave / unmount). */
export function clearEditorPresence(content = {}, userId, { at = null, ttlMs = ENGAGE_PRESENCE_TTL_MS } = {}) {
  const uid = String(userId || "").trim()
  const nowMs = Date.parse(at || new Date().toISOString()) || Date.now()
  const collab = getCollaborationState(content)
  const next = collab.activeEditors.filter((row) => {
    if (uid && String(row.userId) === uid) return false
    const seen = Date.parse(row.lastSeenAt || "")
    if (!Number.isFinite(seen)) return false
    return nowMs - seen <= ttlMs
  })
  return withCollaboration(content, { activeEditors: next })
}

/** Active editors excluding optional self, after TTL filter. */
export function listLiveEditors(
  contentOrReport = {},
  { excludeUserId = null, now = null, ttlMs = ENGAGE_PRESENCE_TTL_MS } = {}
) {
  const collab = getCollaborationState(contentOrReport)
  const nowMs = Date.parse(now || new Date().toISOString()) || Date.now()
  const exclude = excludeUserId ? String(excludeUserId) : null
  return collab.activeEditors.filter((row) => {
    if (exclude && String(row.userId) === exclude) return false
    const seen = Date.parse(row.lastSeenAt || "")
    if (!Number.isFinite(seen)) return false
    return nowMs - seen <= ttlMs
  })
}

export function formatLiveEditorsLabel(editors = []) {
  const names = (Array.isArray(editors) ? editors : [])
    .map((e) => e.userName || e.userId)
    .filter(Boolean)
  if (!names.length) return ""
  if (names.length === 1) {
    const status = editors[0]?.status === "viewing" ? "viewing" : "editing"
    return `${names[0]} is ${status} this report right now`
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]} are working on this report right now`
  }
  return `${names[0]} and ${names.length - 1} others are working on this report right now`
}

/** Author + co-authors who may edit/submit the shared Word body. */
export function listReportWriterIds(reportLike = {}) {
  // null bypasses default params — guard so loading screens don't crash.
  const report = reportLike && typeof reportLike === "object" ? reportLike : {}
  const ids = []
  const seen = new Set()
  const push = (id) => {
    const key = String(id || "").trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    ids.push(key)
  }
  push(report.authorId)
  const collab = getCollaborationState(report)
  for (const id of collab.coAuthorIds) push(id)
  // UI-mapped reports may expose writers at the top level.
  for (const id of parseIdList(report.coAuthorIds)) push(id)
  return ids
}

export function isReportWriter(reportLike, userId) {
  const uid = String(userId || "").trim()
  if (!uid || !reportLike) return false
  return listReportWriterIds(reportLike).includes(uid)
}

/** Invited viewers (read-only) — not writers. */
export function listReportViewerIds(reportLike = {}) {
  const report = reportLike && typeof reportLike === "object" ? reportLike : {}
  const ids = []
  const seen = new Set()
  const push = (id) => {
    const key = String(id || "").trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    ids.push(key)
  }
  const collab = getCollaborationState(report)
  for (const id of collab.viewerIds) push(id)
  for (const id of parseIdList(report.viewerIds)) push(id)
  return ids
}

export function isReportViewer(reportLike, userId) {
  const uid = String(userId || "").trim()
  if (!uid || !reportLike) return false
  if (isReportWriter(reportLike, uid)) return false
  return listReportViewerIds(reportLike).includes(uid)
}

/**
 * Share invite role for someone who is not the primary author.
 * Returns "editor" | "viewer" | null.
 */
export function getReportShareInviteRole(reportLike, userId) {
  const uid = String(userId || "").trim()
  if (!uid || !reportLike) return null
  if (String(reportLike.authorId || "").trim() === uid) return null
  if (listReportViewerIds(reportLike).includes(uid) && !listReportWriterIds(reportLike).includes(uid)) {
    return ENGAGE_SHARE_ROLES.VIEWER
  }
  const writers = listReportWriterIds(reportLike)
  if (writers.includes(uid)) return ENGAGE_SHARE_ROLES.EDITOR
  return null
}

export function isReportShareInvitee(reportLike, userId) {
  return Boolean(getReportShareInviteRole(reportLike, userId))
}

/**
 * "Shared with me" is only for live drafting / review.
 * Once published (or archived), the Knowledge Repository is the home — not share queues.
 */
export function isEngageShareListEligible(reportLike = {}) {
  if (isEngageReportShareAccessEnded(reportLike)) return false
  const status = String(reportLike?.status || "").trim()
  if (!status) return false
  return true
}

/** Author, admin, or the assigned reviewer may invite / revoke share roles. */
export function canManageReportShare(reportLike, userId, capabilities = null) {
  const uid = String(userId || "").trim()
  if (!uid || !reportLike) return false
  if (capabilities?.isSuperAdmin || capabilities?.canAdmin) return true
  if (String(reportLike.authorId || "") === uid) return true
  const body = reportLike.content && typeof reportLike.content === "object" ? reportLike.content : {}
  if (
    String(reportLike.status || "") === ENGAGE_REPORT_STATUSES.PEER_REVIEW &&
    isAssignedPeerReviewer(getPeerReviewState(body), { userId: uid })
  ) {
    return true
  }
  if (isAssignedMeFirstReviewer(getMeFirstReviewState(body), { userId: uid })) {
    return true
  }
  const waiting = String(reportLike.waitingOnRole || "").trim()
  if (waiting && typeof capabilities?.canDecideForWaitingRole === "function") {
    return Boolean(capabilities.canDecideForWaitingRole(waiting))
  }
  return false
}

/**
 * User ids who share a template assignment (pure; used for joint reports).
 */
export function listJointAssigneeIds({
  assignments = [],
  reporterIds = [],
  templateId,
  defaultTemplateId = null,
} = {}) {
  const tpl = String(templateId || "").trim()
  if (!tpl) return []

  const rows = Array.isArray(assignments) ? assignments : []
  if (rows.length) {
    const ids = []
    const seen = new Set()
    for (const row of rows) {
      const uid = String(row?.userId || "").trim()
      if (!uid || seen.has(uid)) continue
      const rowTpl = String(row?.templateId || "").trim()
      if (rowTpl && rowTpl !== tpl) continue
      if (!rowTpl && defaultTemplateId && String(defaultTemplateId) !== tpl) continue
      seen.add(uid)
      ids.push(uid)
    }
    return ids
  }

  const reporters = parseIdList(reporterIds)
  if (!reporters.length) return []
  if (defaultTemplateId && String(defaultTemplateId) !== tpl) return []
  return reporters
}

/**
 * Peer options for a report: exclude every writer (author + co-authors).
 */
export function peerOptionsForReport(reportLike = {}, { excludeSupervisorId = null } = {}) {
  return {
    excludeSupervisorId,
    excludeWriterIds: listReportWriterIds(reportLike),
  }
}

/** All ids that may represent the signed-in user in Engage (session, profile, Appwrite). */
export function engageIdentityIds(userLike = {}) {
  const set = new Set()
  if (!userLike || typeof userLike !== "object") return set
  for (const value of [
    userLike.userId,
    userLike.$id,
    userLike.id,
    userLike.profileId,
    userLike.accountId,
    userLike.documentId,
  ]) {
    const id = String(value || "").trim()
    if (id) set.add(id)
  }
  if (Array.isArray(userLike._allIds)) {
    for (const value of userLike._allIds) {
      const id = String(value || "").trim()
      if (id) set.add(id)
    }
  }
  return set
}

/** Add HR directory aliases so a profile $id and auth userId both match. */
export function enrichEngageActorLike(actorLike = {}, users = []) {
  if (!actorLike || typeof actorLike !== "object") return {}
  const ids = engageIdentityIds(actorLike)
  let match = null
  for (const u of users || []) {
    const authId = String(u?.userId || "").trim()
    const docId = String(u?.$id || u?.documentId || "").trim()
    if ((authId && ids.has(authId)) || (docId && ids.has(docId))) {
      match = u
      break
    }
  }
  if (!match) return { ...actorLike }
  const authId = String(match.userId || "").trim()
  const docId = String(match.$id || match.documentId || "").trim()
  const allIds = new Set(ids)
  if (authId) allIds.add(authId)
  if (docId) allIds.add(docId)
  return {
    ...actorLike,
    userId: authId || actorLike.userId,
    $id: docId || actorLike.$id,
    profileId: docId || actorLike.profileId,
    documentId: docId || actorLike.documentId,
    _allIds: [...allIds].filter(Boolean),
  }
}

export function engageIdentityMatches(storedId, userLike) {
  const want = String(storedId || "").trim()
  if (!want) return false
  return engageIdentityIds(userLike).has(want)
}

/** True when userLike is the colleague currently holding peer / fellow review. */
export function isAssignedPeerReviewer(peerState, userLike) {
  const targets = new Set()
  for (const id of [
    peerState?.waitingOnUserId,
    ...parseIdList(peerState?.waitingOnIdentityIds),
  ]) {
    const key = String(id || "").trim()
    if (key) targets.add(key)
  }
  if (!targets.size) return false
  const actorIds = engageIdentityIds(userLike)
  for (const target of targets) {
    if (actorIds.has(target)) return true
  }
  return false
}

/** Server/client peer panel gates for the signed-in user on a report. */
export function computeEngagePeerAccess(
  reportLike = {},
  content = {},
  actorLike = {},
  capabilities = null
) {
  const status = String(reportLike?.status || "")
  if (status !== ENGAGE_REPORT_STATUSES.PEER_REVIEW) {
    return {
      canAct: false,
      canNudge: false,
      canReassign: false,
      canLeadTakeover: false,
      isAssignedReviewer: false,
    }
  }
  const peerState = getPeerReviewState(content)
  const isAssignedReviewer = isAssignedPeerReviewer(peerState, actorLike)
  const actorId = String(
    actorLike?.userId || actorLike?.profileId || actorLike?.$id || ""
  ).trim()
  const isWriter = actorId ? isReportWriter(reportLike, actorId) : false
  const canAdmin = Boolean(capabilities?.canAdmin || capabilities?.isSuperAdmin)
  const canLead = Boolean(capabilities?.isMeLead || canAdmin)
  return {
    canAct: isAssignedReviewer,
    isAssignedReviewer,
    canLeadTakeover: canLead && !isAssignedReviewer,
    canNudge:
      Boolean(peerState.waitingOnUserId) && (isWriter || canAdmin || canLead),
    canReassign: !isAssignedReviewer && (isWriter || canAdmin || canLead),
  }
}

function peerActorAuthorized(peerState, { actorId = null, actorLike = null } = {}) {
  const merged = {
    ...(actorLike && typeof actorLike === "object" ? actorLike : {}),
    ...(actorId ? { userId: actorId } : {}),
  }
  return isAssignedPeerReviewer(peerState, merged)
}

export function canPassToPeer({
  activity,
  authorId,
  peerState,
  actorId,
  actorLike = null,
  toUserId,
  excludeSupervisorId = null,
  excludeWriterIds = null,
} = {}) {
  if (!toUserId) {
    return { ok: false, error: "Actor and next peer are required" }
  }
  if (!peerActorAuthorized(peerState, { actorId, actorLike })) {
    return { ok: false, error: "Only the assigned peer reviewer can pass this report" }
  }
  const passable = listPassablePeers(activity, authorId, peerState, {
    excludeSupervisorId,
    excludeWriterIds,
  })
  if (!passable.includes(String(toUserId))) {
    return {
      ok: false,
      error: "That colleague already reviewed this cycle or is not a field participant",
    }
  }
  if (String(toUserId) === String(actorId)) {
    return { ok: false, error: "You cannot pass the report to yourself" }
  }
  return { ok: true }
}

export function canSendToSupervisorFromPeer({
  peerState,
  actorId,
  actorLike = null,
  capabilities = null,
} = {}) {
  if (!actorId && !actorLike) return { ok: false, error: "Actor is required" }
  if (capabilities?.isMeLead || capabilities?.isSuperAdmin || capabilities?.canAdmin) {
    return { ok: true }
  }
  if (!peerActorAuthorized(peerState, { actorId, actorLike })) {
    return { ok: false, error: "Only the assigned peer reviewer can send this to the supervisor" }
  }
  return { ok: true }
}

export function canBounceFromPeer({
  peerState,
  actorId,
  actorLike = null,
  capabilities = null,
} = {}) {
  if (!actorId && !actorLike) return { ok: false, error: "Actor is required" }
  if (capabilities?.isMeLead || capabilities?.isSuperAdmin || capabilities?.canAdmin) {
    return { ok: true }
  }
  if (!peerActorAuthorized(peerState, { actorId, actorLike })) {
    return { ok: false, error: "Only the assigned peer reviewer can bounce this report" }
  }
  return { ok: true }
}

/** Author/admin may swap the assigned peer while review is still open. */
export function applyPeerReassign({
  content = {},
  toUserId,
  toUserName = "",
  toIdentityIds = null,
  actorId,
  actorName = "",
  comment = "",
  at = null,
} = {}) {
  const nextId = toUserId ? String(toUserId) : ""
  if (!nextId) return { ok: false, error: "Choose who should review this report" }
  const note = String(comment || "").trim()
  if (!note) return { ok: false, error: "Add a short note explaining the change" }
  const prev = getPeerReviewState(content)
  const now = at || new Date().toISOString()
  const cycle = Number(prev.cycle) > 0 ? Number(prev.cycle) : 1
  const identityIds = parseIdList(toIdentityIds)
  if (!identityIds.includes(nextId)) identityIds.unshift(nextId)
  const history = [...(Array.isArray(prev.history) ? prev.history : [])]
  history.push({
    cycle,
    userId: String(actorId || ""),
    name: actorName || "",
    at: now,
    action: ENGAGE_PEER_ACTIONS.REASSIGNED,
    toUserId: nextId,
    toUserName: toUserName || "",
    comment: note,
  })
  const peerReview = {
    cycle,
    waitingOnUserId: nextId,
    waitingOnUserName: toUserName || "",
    waitingOnIdentityIds: identityIds,
    waitingSince: now,
    history,
  }
  return {
    ok: true,
    reportStatus: ENGAGE_REPORT_STATUSES.PEER_REVIEW,
    waitingOnRole: null,
    content: { ...content, _peerReview: peerReview },
    peerReview,
  }
}

/**
 * Start (or restart) peer review: author chooses first peer.
 */
export function applyPeerReviewStart({
  content = {},
  firstPeerUserId,
  firstPeerUserName = "",
  waitingOnIdentityIds = null,
  actorId,
  actorName = "",
  comment = "",
  at = null,
} = {}) {
  const toUserId = firstPeerUserId ? String(firstPeerUserId) : ""
  if (!toUserId) {
    return { ok: false, error: "As the author, choose which trip colleague should review this report first" }
  }
  const identityIds = parseIdList(waitingOnIdentityIds)
  if (!identityIds.includes(toUserId)) identityIds.unshift(toUserId)
  const prev = getPeerReviewState(content)
  const wasActive = Boolean(prev.waitingOnUserId || prev.history?.length)
  const cycle = wasActive ? Number(prev.cycle || 1) + 1 : Number(prev.cycle || 1)
  const now = at || new Date().toISOString()
  const history = [...(Array.isArray(prev.history) ? prev.history : [])]
  history.push({
    cycle,
    userId: actorId || null,
    name: actorName || "",
    at: now,
    action: ENGAGE_PEER_ACTIONS.STARTED,
    toUserId,
    toUserName: firstPeerUserName || "",
    comment: String(comment || "").trim(),
  })
  const peerReview = {
    cycle,
    waitingOnUserId: toUserId,
    waitingOnUserName: firstPeerUserName || "",
    waitingOnIdentityIds: identityIds,
    waitingSince: now,
    history,
  }
  return {
    ok: true,
    reportStatus: ENGAGE_REPORT_STATUSES.PEER_REVIEW,
    waitingOnRole: null,
    content: { ...content, _peerReview: peerReview },
    peerReview,
  }
}

export function applyPeerDecision({
  content = {},
  action,
  actorId,
  actorName = "",
  comment = "",
  toUserId = null,
  toUserName = "",
  toIdentityIds = null,
  at = null,
  nextWaitingRole = null,
  isProgramme = false,
} = {}) {
  const normalized = String(action || "").trim().toLowerCase()
  const note = String(comment || "").trim()
  if (!note) {
    return { ok: false, error: "A short comment is required for peer review actions" }
  }
  if (!actorId) {
    return { ok: false, error: "Actor is required" }
  }

  const peerState = getPeerReviewState(content)
  const now = at || new Date().toISOString()
  const cycle = Number(peerState.cycle) > 0 ? Number(peerState.cycle) : 1
  const history = [...(Array.isArray(peerState.history) ? peerState.history : [])]

  if (normalized === ENGAGE_PEER_ACTIONS.PASSED || normalized === "pass") {
    const nextId = toUserId ? String(toUserId) : ""
    if (!nextId) return { ok: false, error: "Select a colleague to pass the report to" }
    const nextIdentityIds = parseIdList(toIdentityIds)
    if (!nextIdentityIds.includes(nextId)) nextIdentityIds.unshift(nextId)
    history.push({
      cycle,
      userId: String(actorId),
      name: actorName || "",
      at: now,
      action: ENGAGE_PEER_ACTIONS.PASSED,
      toUserId: nextId,
      toUserName: toUserName || "",
      comment: note,
    })
    const peerReview = {
      cycle,
      waitingOnUserId: nextId,
      waitingOnUserName: toUserName || "",
      waitingOnIdentityIds: nextIdentityIds,
      waitingSince: now,
      history,
    }
    return {
      ok: true,
      reportStatus: ENGAGE_REPORT_STATUSES.PEER_REVIEW,
      waitingOnRole: null,
      content: { ...content, _peerReview: peerReview },
      peerReview,
    }
  }

  if (
    normalized === ENGAGE_PEER_ACTIONS.SENT_TO_SUPERVISOR ||
    normalized === "send_to_supervisor"
  ) {
    history.push({
      cycle,
      userId: String(actorId),
      name: actorName || "",
      at: now,
      action: ENGAGE_PEER_ACTIONS.SENT_TO_SUPERVISOR,
      comment: note,
      toUserId: toUserId ? String(toUserId) : null,
      toUserName: toUserName || "",
    })
    const peerReview = {
      cycle,
      waitingOnUserId: null,
      waitingOnUserName: null,
      waitingSince: null,
      history,
    }
    const taggedMeId = toUserId ? String(toUserId).trim() : ""
    let waitingOnRole = nextWaitingRole || null
    let meFirst = null
    if (!isProgramme && taggedMeId) {
      const identityIds = parseIdList(toIdentityIds)
      if (!identityIds.includes(taggedMeId)) identityIds.unshift(taggedMeId)
      waitingOnRole = waitingOnRole || ENGAGE_ROLES.ME_TEAM
      meFirst = {
        waitingOnUserId: taggedMeId,
        waitingOnUserName: toUserName || "",
        waitingOnIdentityIds: identityIds,
        assignedAt: now,
        assignedBy: String(actorId),
        completedAt: null,
        completedBy: null,
        skipped: false,
      }
    } else if (!waitingOnRole) {
      waitingOnRole = ENGAGE_ROLES.ME_LEAD
    }
    const reportStatus = reportStatusForWaitingRole(waitingOnRole, { isProgramme })
    const nextContent = { ...content, _peerReview: peerReview }
    if (meFirst) nextContent._meFirstReview = meFirst
    else if (!isProgramme && waitingOnRole === ENGAGE_ROLES.ME_LEAD) {
      nextContent._meFirstReview = { ...emptyMeFirstReviewState(), skipped: true }
    }
    return {
      ok: true,
      reportStatus,
      waitingOnRole,
      content: nextContent,
      peerReview,
    }
  }

  if (normalized === ENGAGE_PEER_ACTIONS.BOUNCED || normalized === "bounce") {
    history.push({
      cycle,
      userId: String(actorId),
      name: actorName || "",
      at: now,
      action: ENGAGE_PEER_ACTIONS.BOUNCED,
      comment: note,
    })
    const peerReview = {
      cycle,
      waitingOnUserId: null,
      waitingOnUserName: null,
      waitingSince: null,
      history,
    }
    return {
      ok: true,
      reportStatus: ENGAGE_REPORT_STATUSES.REVISION_REQUESTED,
      waitingOnRole: ENGAGE_ROLES.STAFF,
      content: withEngageRevisionReturn(
        { ...content, _peerReview: peerReview },
        {
          returnedBy: actorId,
          returnedByName: actorName || "",
          comment: note,
          returnedAt: now,
          via: "peer",
        }
      ),
      peerReview,
    }
  }

  return { ok: false, error: "Invalid peer review action" }
}

export function normalizeActivityType(value) {
  const normalized = String(value || "").trim().toLowerCase()
  return Object.values(ENGAGE_ACTIVITY_TYPES).includes(normalized)
    ? normalized
    : null
}

export function normalizeReportStatus(value) {
  const normalized = String(value || "").trim().toLowerCase()
  return Object.values(ENGAGE_REPORT_STATUSES).includes(normalized)
    ? normalized
    : null
}

export function normalizeEngageRole(value) {
  const normalized = String(value || "").trim().toLowerCase()
  return Object.values(ENGAGE_ROLES).includes(normalized) ? normalized : null
}

export function normalizeDecision(value) {
  const normalized = String(value || "").trim().toLowerCase()
  return Object.values(ENGAGE_DECISIONS).includes(normalized) ? normalized : null
}

/** Reject / return-for-revision always need an author-facing reason (every Engage report type). */
export function engageDecisionRequiresReason(decision) {
  const normalized = normalizeDecision(decision) || String(decision || "").trim().toLowerCase()
  return (
    normalized === ENGAGE_DECISIONS.REJECTED ||
    normalized === ENGAGE_DECISIONS.REVISION_REQUESTED
  )
}

/** Peer bounce back to author also needs a reason. */
export function engagePeerActionRequiresReason(action) {
  const normalized = String(action || "")
    .trim()
    .toLowerCase()
    .replace(/^peer_/, "")
  return normalized === "bounce" || normalized === ENGAGE_PEER_ACTIONS.BOUNCED
}

export function parseWorkflowSteps(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function parseJsonObject(raw, fallback = {}) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

export function stringifyJson(value, fallback = "{}") {
  try {
    return JSON.stringify(value ?? JSON.parse(fallback))
  } catch {
    return fallback
  }
}

/** Keys needed for list/queue UIs — never ship the full Word body over the wire. */
const ENGAGE_LIST_CONTENT_KEYS = [
  "_collaboration",
  "_peerReview",
  "_meFirstReview",
  "_workflowProfile",
  "_incidentUpload",
  "_uploadedFile",
  "_supportingFiles",
  "_templateKey",
  "_templateId",
  "_templateShortName",
  "_templateName",
  "_docTypeName",
  "_letterhead",
  "_signatures",
]

/**
 * Strip `_documentHtml` and other heavy fields from report docs used in lists/queues.
 * Detail GET still returns the full hydrated document.
 */
export function slimEngageReportDocForList(doc) {
  if (!doc || typeof doc !== "object") return doc
  const content = parseJsonObject(doc.contentJson, {})
  const slim = {}
  for (const key of ENGAGE_LIST_CONTENT_KEYS) {
    if (content[key] !== undefined) slim[key] = content[key]
  }
  if (slim._collaboration && typeof slim._collaboration === "object") {
    slim._collaboration = {
      coAuthorIds: Array.isArray(slim._collaboration.coAuthorIds)
        ? slim._collaboration.coAuthorIds
        : [],
      coAuthorNames: Array.isArray(slim._collaboration.coAuthorNames)
        ? slim._collaboration.coAuthorNames
        : [],
      viewerIds: Array.isArray(slim._collaboration.viewerIds) ? slim._collaboration.viewerIds : [],
      viewerNames: Array.isArray(slim._collaboration.viewerNames)
        ? slim._collaboration.viewerNames
        : [],
      invites: Array.isArray(slim._collaboration.invites) ? slim._collaboration.invites : [],
      contentRevision: slim._collaboration.contentRevision || 1,
      lastSavedById: slim._collaboration.lastSavedById || null,
      lastSavedByName: slim._collaboration.lastSavedByName || null,
    }
  }
  return {
    ...doc,
    contentJson: stringifyJson(slim),
  }
}

export function slimEngageReportListResult(result) {
  if (!result || typeof result !== "object") return result
  const documents = Array.isArray(result.documents)
    ? result.documents.map(slimEngageReportDocForList)
    : []
  return { ...result, documents }
}

export function generateEngageRequestId(prefix = "ENG") {
  const year = new Date().getFullYear()
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let suffix = ""
  for (let i = 0; i < 4; i += 1) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${prefix}-${year}-${suffix}`
}

export function validateActivityInput(input = {}) {
  const errors = []
  const title = String(input.title || "").trim()
  const type = normalizeActivityType(input.type)
  if (!title) errors.push("title is required")
  if (!type) errors.push("type must be a valid activity type")
  if (input.startDate && input.endDate && new Date(input.endDate) < new Date(input.startDate)) {
    errors.push("endDate must be on or after startDate")
  }
  return {
    ok: errors.length === 0,
    errors,
    value: {
      title,
      type,
      description: String(input.description || "").trim(),
      location: String(input.location || "").trim(),
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      status: Object.values(ENGAGE_ACTIVITY_STATUSES).includes(input.status)
        ? input.status
        : ENGAGE_ACTIVITY_STATUSES.PLANNED,
      departmentId: input.departmentId || null,
      projectId: input.projectId || null,
      ownerId: input.ownerId || null,
      metadataJson: stringifyJson(input.metadata || {}, "{}"),
      participantIdsJson: stringifyJson(input.participantIds || [], "[]"),
      reporterIdsJson: stringifyJson(
        type === ENGAGE_ACTIVITY_TYPES.MEETING ? [] : input.reporterIds || [],
        "[]"
      ),
    },
  }
}

export function validateReportDraftInput(input = {}) {
  const errors = []
  const title = String(input.title || "").trim()
  if (!title) errors.push("title is required")
  if (!input.activityId) errors.push("activityId is required")
  if (!input.templateId) errors.push("templateId is required")
  if (!input.authorId) errors.push("authorId is required")
  const fromObject =
    input.content && typeof input.content === "object" && !Array.isArray(input.content)
      ? input.content
      : {}
  const fromJson = parseJsonObject(input.contentJson, {})
  const content = { ...fromJson, ...fromObject }
  return {
    ok: errors.length === 0,
    errors,
    value: {
      title,
      activityId: input.activityId,
      templateId: input.templateId,
      authorId: input.authorId,
      authorName: String(input.authorName || "").trim(),
      departmentId: input.departmentId || null,
      contentJson: stringifyJson(content, "{}"),
      version: Number(input.version) > 0 ? Number(input.version) : 1,
    },
  }
}

export function requiredFieldsComplete(content = {}, schema = {}) {
  if (isParticipantLogReport({ templateId: content?._templateKey || content?._templateId }, content)) {
    const gate = participantLogSubmitGate(content)
    return { ok: gate.ok, missing: gate.missing || [] }
  }

  // Full Word HTML document counts as complete when it has meaningful text
  const html = typeof content?._documentHtml === "string" ? content._documentHtml : ""
  if (html.trim()) {
    const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    if (plain.length >= 40) return { ok: true, missing: [] }
  }

  // Body parked in Appwrite storage — complete even if hydrate timed out.
  if (String(content?._documentFileId || "").trim()) {
    return { ok: true, missing: [] }
  }

  const fields = Array.isArray(schema?.fields) ? schema.fields : []
  const missing = []
  for (const field of fields) {
    if (!field?.required) continue
    const key = field.key || field.id
    if (!key) continue
    const value = content?.[key]
    const empty =
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
    if (empty) missing.push(key)
  }
  return { ok: missing.length === 0, missing }
}

/**
 * Advance or rewind workflow based on decision.
 * steps: [{ order, role, action, slaDays }]
 * currentStep: 1-based index into steps (matches order)
 */
export function applyWorkflowDecision({
  steps = [],
  currentStep = 1,
  decision,
  isProgramme = false,
} = {}) {
  const ordered = [...parseWorkflowSteps(steps)].sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  )
  const normalized = normalizeDecision(decision)
  if (!normalized) {
    return { ok: false, error: "Invalid decision" }
  }
  if (!ordered.length) {
    return { ok: false, error: "Workflow has no steps" }
  }

  const index = Math.max(
    0,
    ordered.findIndex((step) => Number(step.order) === Number(currentStep))
  )
  const step = ordered[index] || ordered[0]

  if (normalized === ENGAGE_DECISIONS.REVISION_REQUESTED) {
    return {
      ok: true,
      currentStep: Number(step.order || currentStep),
      reportStatus: ENGAGE_REPORT_STATUSES.REVISION_REQUESTED,
      waitingOnRole: ENGAGE_ROLES.STAFF,
      completed: false,
      resumeFromRole: step.role || null,
    }
  }

  if (normalized === ENGAGE_DECISIONS.REJECTED) {
    return {
      ok: true,
      currentStep: Number(step.order || currentStep),
      // Same as revision: back with the author to fix and resubmit — never a hard "killed" archive.
      reportStatus: ENGAGE_REPORT_STATUSES.REVISION_REQUESTED,
      waitingOnRole: ENGAGE_ROLES.STAFF,
      completed: false,
      rejected: false,
      resumeFromRole: step.role || null,
    }
  }

  // approved
  const next = ordered[index + 1]
  if (!next) {
    return {
      ok: true,
      currentStep: Number(step.order || currentStep),
      reportStatus: ENGAGE_REPORT_STATUSES.APPROVED,
      waitingOnRole: null,
      completed: true,
      readyToPublish: step.action === "publish" || !ordered.some((s) => s.action === "publish"),
    }
  }

  if (step.action === "publish") {
    return {
      ok: true,
      currentStep: Number(step.order || currentStep),
      reportStatus: ENGAGE_REPORT_STATUSES.PUBLISHED,
      waitingOnRole: null,
      completed: true,
      published: true,
    }
  }

  return {
    ok: true,
    currentStep: Number(next.order),
    reportStatus: reportStatusForWaitingRole(next.role, { isProgramme }),
    waitingOnRole: next.role || null,
    completed: false,
  }
}

export function isOrgWideEngageRole(role) {
  return (
    role === ENGAGE_ROLES.ME_TEAM ||
    role === ENGAGE_ROLES.ME_LEAD ||
    role === ENGAGE_ROLES.SUPER_ADMIN
  )
}

export function canAuthorEditReport(status) {
  return [
    ENGAGE_REPORT_STATUSES.DRAFT,
    ENGAGE_REPORT_STATUSES.REVISION_REQUESTED,
    ENGAGE_REPORT_STATUSES.REJECTED,
  ].includes(status)
}

/** Fellow / field peer chain finished — report already advanced to formal review. */
export function peerReviewCycleCompleted(peerState = {}) {
  const history = Array.isArray(peerState?.history) ? peerState.history : []
  return history.some((entry) => {
    const action = String(entry?.action || "")
      .trim()
      .toLowerCase()
      .replace(/^peer_/, "")
    return (
      action === ENGAGE_PEER_ACTIONS.SENT_TO_SUPERVISOR || action === "sent_to_supervisor"
    )
  })
}

function signatureSlotHasPerson(content = {}, slotKey = "") {
  const raw = content?._signatures
  if (!raw || typeof raw !== "object") return false
  const slot = raw[slotKey]
  const name = String(slot?.name || "").trim()
  if (name.length < 2) return false
  return !/^(approved|published|pending|processed|completed|—|-|n\/?a|none|unknown)$/i.test(name)
}

/**
 * Infer who returned the report when `_workflowResume` was lost (e.g. draft overwrite).
 * Programme: Lead signature means Super Admin had it; fellow-only means Lead had it.
 */
export function inferEngageRevisionReturnRole({
  content = {},
  isProgramme = false,
  workflowCurrentStep = null,
} = {}) {
  const resume = getEngageWorkflowResume(content)
  if (resume?.waitingOnRole) return resume.waitingOnRole

  const fromStep = inferResumeRoleFromWorkflowStep({ workflowCurrentStep, isProgramme })
  if (fromStep) return fromStep

  if (isProgramme) {
    if (signatureSlotHasPerson(content, "meLead") || content?._programmeLeadSkipped) {
      return ENGAGE_ROLES.SUPER_ADMIN
    }
    if (peerReviewCycleCompleted(getPeerReviewState(content))) {
      return ENGAGE_ROLES.ME_LEAD
    }
  } else if (peerReviewCycleCompleted(getPeerReviewState(content))) {
    const first = getMeFirstReviewState(content)
    if (first.completedBy || signatureSlotHasPerson(content, "meLead")) {
      return ENGAGE_ROLES.ME_LEAD
    }
    return ENGAGE_ROLES.ME_TEAM
  }
  return null
}

/** Keep resume metadata across draft saves / slims — same idea as peer review. */
export function preserveWorkflowResumeInContent(nextContent = {}, prevContent = {}) {
  const next = nextContent && typeof nextContent === "object" ? { ...nextContent } : {}
  const prevResume = getEngageWorkflowResume(prevContent)
  const nextResume = getEngageWorkflowResume(next)
  let out = next
  if (prevResume && !nextResume) {
    out = withEngageWorkflowResume(out, prevResume)
  }
  const prevReturn = getEngageRevisionReturnHint(prevContent)
  const nextReturn = getEngageRevisionReturnHint(out)
  if (prevReturn && !nextReturn?.returnedBy && prevReturn.via === "peer") {
    out = withEngageRevisionReturn(out, prevReturn)
  }
  return out
}

/**
 * Who returned the report for revision (formal reviewer or peer bounce) + their note.
 * Used so authors see the reason and resubmit defaults to the same person.
 */
export function getEngageRevisionReturnHint(content = {}) {
  const resume = getEngageWorkflowResume(content)
  if (resume?.returnedBy || resume?.comment || resume?.returnedByName) {
    return {
      returnedBy: resume.returnedBy || null,
      returnedByName: resume.returnedByName || null,
      comment: resume.comment || "",
      returnedAt: resume.returnedAt || null,
      via: "formal",
      waitingOnRole: resume.waitingOnRole || null,
    }
  }

  const raw = content?._revisionReturn
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const returnedBy = raw.returnedBy ? String(raw.returnedBy) : null
    if (returnedBy || raw.comment || raw.returnedByName) {
      return {
        returnedBy,
        returnedByName: raw.returnedByName ? String(raw.returnedByName) : null,
        comment: raw.comment ? String(raw.comment) : "",
        returnedAt: raw.returnedAt || null,
        via: String(raw.via || "peer"),
        waitingOnRole: null,
      }
    }
  }

  const history = Array.isArray(getPeerReviewState(content)?.history)
    ? getPeerReviewState(content).history
    : []
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i] || {}
    const action = String(entry.action || "")
      .trim()
      .toLowerCase()
      .replace(/^peer_/, "")
    if (action !== ENGAGE_PEER_ACTIONS.BOUNCED && action !== "bounce") continue
    return {
      returnedBy: entry.userId ? String(entry.userId) : null,
      returnedByName: entry.name ? String(entry.name) : null,
      comment: entry.comment ? String(entry.comment) : "",
      returnedAt: entry.at || null,
      via: "peer",
      waitingOnRole: null,
    }
  }
  return null
}

export function withEngageRevisionReturn(content = {}, hint = {}) {
  if (!hint?.returnedBy && !hint?.comment) return content
  return {
    ...content,
    _revisionReturn: {
      returnedBy: hint.returnedBy ? String(hint.returnedBy) : null,
      returnedByName: hint.returnedByName ? String(hint.returnedByName) : null,
      comment: hint.comment ? String(hint.comment) : "",
      returnedAt: hint.returnedAt || null,
      via: String(hint.via || "peer"),
    },
  }
}

/** Saved when a formal reviewer returns the report — used to resume on author resubmit. */
export function getEngageWorkflowResume(content = {}) {
  const raw = content?._workflowResume
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const waitingOnRole = String(raw.waitingOnRole || raw.returnedByRole || "").trim()
  if (!waitingOnRole || waitingOnRole === ENGAGE_ROLES.STAFF) return null
  const workflowStep = Number(raw.workflowStep)
  return {
    waitingOnRole,
    workflowStep: Number.isFinite(workflowStep) && workflowStep > 0 ? workflowStep : null,
    returnedByRole: raw.returnedByRole ? String(raw.returnedByRole) : waitingOnRole,
    returnedBy: raw.returnedBy ? String(raw.returnedBy) : null,
    returnedByName: raw.returnedByName ? String(raw.returnedByName) : null,
    returnedAt: raw.returnedAt || null,
    comment: raw.comment ? String(raw.comment) : "",
  }
}

export function withEngageWorkflowResume(content = {}, resume = {}) {
  if (!resume?.waitingOnRole) return content
  return {
    ...content,
    _workflowResume: {
      waitingOnRole: String(resume.waitingOnRole),
      workflowStep:
        resume.workflowStep != null && Number(resume.workflowStep) > 0
          ? Number(resume.workflowStep)
          : null,
      returnedByRole: resume.returnedByRole
        ? String(resume.returnedByRole)
        : String(resume.waitingOnRole),
      returnedBy: resume.returnedBy ? String(resume.returnedBy) : null,
      returnedByName: resume.returnedByName ? String(resume.returnedByName) : null,
      returnedAt: resume.returnedAt || null,
      comment: resume.comment ? String(resume.comment) : "",
    },
  }
}

export function fieldWorkflowStepForWaitingRole(waitingOnRole) {
  if (waitingOnRole === ENGAGE_ROLES.ME_LEAD) return 3
  if (waitingOnRole === ENGAGE_ROLES.ME_TEAM) return 2
  return 2
}

export function reportStatusForWaitingRole(waitingOnRole, { isProgramme = false } = {}) {
  if (waitingOnRole === ENGAGE_ROLES.SUPER_ADMIN) {
    return ENGAGE_REPORT_STATUSES.APPROVED
  }
  if (waitingOnRole === ENGAGE_ROLES.ME_LEAD) {
    return ENGAGE_REPORT_STATUSES.UNDER_REVIEW
  }
  if (waitingOnRole === ENGAGE_ROLES.FIELD_SUPERVISOR) {
    return ENGAGE_REPORT_STATUSES.SUBMITTED
  }
  if (waitingOnRole === ENGAGE_ROLES.ME_TEAM) {
    return ENGAGE_REPORT_STATUSES.UNDER_REVIEW
  }
  return ENGAGE_REPORT_STATUSES.UNDER_REVIEW
}

function inferResumeRoleFromWorkflowStep({ workflowCurrentStep = null, isProgramme = false } = {}) {
  const step = Number(workflowCurrentStep)
  if (!Number.isFinite(step) || step <= 0) return null
  if (isProgramme) {
    if (step >= 3) return ENGAGE_ROLES.SUPER_ADMIN
    if (step >= 2) return ENGAGE_ROLES.ME_LEAD
    return null
  }
  if (step >= 3) return ENGAGE_ROLES.ME_LEAD
  if (step >= 2) return ENGAGE_ROLES.ME_TEAM
  return null
}

/**
 * When the author resubmits after revision, skip a completed peer cycle and return
 * directly to the formal step that bounced the report (Super Admin, M&E Lead, etc.).
 */
export function resolveEngageResubmitRoute({
  content = {},
  reportStatus = null,
  isProgramme = false,
  workflowCurrentStep = null,
} = {}) {
  const wasReturned = [
    ENGAGE_REPORT_STATUSES.REVISION_REQUESTED,
    ENGAGE_REPORT_STATUSES.REJECTED,
  ].includes(reportStatus)
  if (!wasReturned) return { skipPeer: false }

  const resume = getEngageWorkflowResume(content)
  const peerState = getPeerReviewState(content)
  const peerDone = peerReviewCycleCompleted(peerState)
  const peerStarted = (Array.isArray(peerState?.history) ? peerState.history : []).some(
    (entry) => {
      const action = String(entry?.action || "")
        .trim()
        .toLowerCase()
        .replace(/^peer_/, "")
      return action === ENGAGE_PEER_ACTIONS.STARTED || action === "started"
    }
  )

  // Fellow bounced before finishing — author must send through peer review again.
  if (peerStarted && !peerDone && !resume?.waitingOnRole) {
    return { skipPeer: false, reason: "peer_incomplete" }
  }

  const targetRole =
    inferEngageRevisionReturnRole({
      content,
      isProgramme,
      workflowCurrentStep,
    }) ||
    (isProgramme && peerDone
      ? signatureSlotHasPerson(content, "meLead") || content?._programmeLeadSkipped
        ? ENGAGE_ROLES.SUPER_ADMIN
        : ENGAGE_ROLES.ME_LEAD
      : null) ||
    (!isProgramme && peerDone
      ? signatureSlotHasPerson(content, "meLead") || getMeFirstReviewState(content).skipped
        ? ENGAGE_ROLES.ME_LEAD
        : ENGAGE_ROLES.ME_TEAM
      : null)

  if (!targetRole || targetRole === ENGAGE_ROLES.STAFF) {
    return { skipPeer: false, reason: "no_resume_point" }
  }

  // Formal reviewer returned it — never restart fellow review.
  const workflowStep =
    resume?.workflowStep ||
    (Number(workflowCurrentStep) > 0 ? Number(workflowCurrentStep) : null) ||
    (isProgramme
      ? targetRole === ENGAGE_ROLES.SUPER_ADMIN
        ? 3
        : 2
      : targetRole === ENGAGE_ROLES.ME_LEAD
        ? 3
        : 2)

  return {
    skipPeer: true,
    waitingOnRole: targetRole,
    reportStatus: reportStatusForWaitingRole(targetRole, { isProgramme }),
    workflowStep,
    resume: resume || {
      waitingOnRole: targetRole,
      workflowStep,
      returnedByRole: targetRole,
    },
  }
}

export function applyWorkflowRevisionResubmit({
  content = {},
  actorId = null,
  actorName = "",
  comment = "",
  at = null,
  resumeToRole = null,
} = {}) {
  const peerState = getPeerReviewState(content)
  const now = at || new Date().toISOString()
  const history = [...(Array.isArray(peerState.history) ? peerState.history : [])]
  history.push({
    cycle: Number(peerState.cycle) > 0 ? Number(peerState.cycle) : 1,
    userId: actorId ? String(actorId) : null,
    name: actorName || "",
    at: now,
    action: ENGAGE_PEER_ACTIONS.RESUBMITTED,
    comment:
      String(comment || "").trim() ||
      (resumeToRole ? `Resubmitted to ${resumeToRole}` : "Resubmitted after revision"),
    resumeToRole: resumeToRole ? String(resumeToRole) : null,
  })
  const next = { ...content }
  delete next._workflowResume
  next._peerReview = {
    ...peerState,
    history,
    waitingOnUserId: null,
    waitingOnUserName: null,
    waitingOnIdentityIds: [],
    waitingSince: null,
  }
  return next
}

/** Programme quarterlies: invite helpers to view while fellow / lead review is underway. */
export function canChangeProgrammeReportShare(status, { isProgramme = false } = {}) {
  if (canAuthorEditReport(status)) return true
  return [
    ENGAGE_REPORT_STATUSES.PEER_REVIEW,
    ENGAGE_REPORT_STATUSES.SUBMITTED,
    ENGAGE_REPORT_STATUSES.UNDER_REVIEW,
    ENGAGE_REPORT_STATUSES.APPROVED,
  ].includes(String(status || ""))
}

/**
 * Collaboration writes (share / presence / save) must never drop or swap fellow review.
 * Inviting an editor after send-for-review does not change who holds formal review.
 */
export function preservePeerReviewInContent(nextContent = {}, prevContent = {}) {
  if (!prevContent || typeof prevContent !== "object") {
    return nextContent && typeof nextContent === "object" ? nextContent : {}
  }
  const prevRaw = prevContent._peerReview
  if (!prevRaw || typeof prevRaw !== "object") {
    return nextContent && typeof nextContent === "object" ? nextContent : {}
  }
  const next = nextContent && typeof nextContent === "object" ? { ...nextContent } : {}
  const prevState = reconcilePeerReviewWaiting(getPeerReviewState(prevContent))
  const nextState = getPeerReviewState(next)

  if (!next._peerReview || typeof next._peerReview !== "object") {
    next._peerReview = {
      ...prevRaw,
      ...prevState,
      history: prevState.history,
    }
    return next
  }

  const history =
    Array.isArray(nextState.history) && nextState.history.length
      ? nextState.history
      : prevState.history
  const reconciled = reconcilePeerReviewWaiting({
    ...nextState,
    history,
    waitingOnUserId: nextState.waitingOnUserId || prevState.waitingOnUserId,
    waitingOnUserName: nextState.waitingOnUserName || prevState.waitingOnUserName,
    waitingOnIdentityIds: parseIdList(nextState.waitingOnIdentityIds).length
      ? nextState.waitingOnIdentityIds
      : prevState.waitingOnIdentityIds,
    waitingSince: nextState.waitingSince || prevState.waitingSince,
    cycle: nextState.cycle || prevState.cycle,
  })

  next._peerReview = {
    ...(typeof prevRaw === "object" ? prevRaw : {}),
    cycle: reconciled.cycle,
    waitingOnUserId: reconciled.waitingOnUserId,
    waitingOnUserName: reconciled.waitingOnUserName,
    waitingOnIdentityIds: reconciled.waitingOnIdentityIds,
    waitingSince: reconciled.waitingSince,
    history: reconciled.history,
  }
  return next
}

/**
 * Primary author (or Engage admin) may permanently delete a report only while it
 * is still with the author — draft, returned for revision, or rejected.
 * Invited editors and viewers never get delete — edit/view access is not ownership.
 * Once sent for peer/supervisor review or published, deletion is blocked.
 */
export function canAuthorDeleteReport(report, userId, capabilities = null, identityIds = null) {
  if (!report) return false
  if (report.publishedAt) return false
  const status = String(report.status || "")
  if (status === ENGAGE_REPORT_STATUSES.PUBLISHED) return false
  const deletable = [
    ENGAGE_REPORT_STATUSES.DRAFT,
    ENGAGE_REPORT_STATUSES.REVISION_REQUESTED,
    ENGAGE_REPORT_STATUSES.REJECTED,
    // Legacy reject path stored unpublished "archived"
    ENGAGE_REPORT_STATUSES.ARCHIVED,
  ]
  if (!deletable.includes(status)) return false

  if (capabilities?.isSuperAdmin === true || capabilities?.canAdmin === true) return true

  const aliases = new Set(
    [
      userId,
      ...(Array.isArray(identityIds)
        ? identityIds
        : identityIds instanceof Set
          ? [...identityIds]
          : []),
    ]
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  )
  if (!aliases.size) return false
  // Only the owning author — never co-authors / invited editors / viewers.
  return aliases.has(String(report.authorId || "").trim())
}

export function waitingQueueStatuses() {
  return [
    ENGAGE_REPORT_STATUSES.SUBMITTED,
    ENGAGE_REPORT_STATUSES.PEER_REVIEW,
    ENGAGE_REPORT_STATUSES.UNDER_REVIEW,
    ENGAGE_REPORT_STATUSES.APPROVED,
  ]
}
