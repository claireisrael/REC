/**
 * Approval / signature blocks for Engage field reports.
 * Names must be real people — never status words like "Approved" or "Published".
 */

import { isFieldArticleReport } from "./field-articles.mjs"

export const ENGAGE_SIGNATURE_SLOTS = Object.freeze({
  AUTHOR: "author",
  SUPERVISOR: "supervisor",
  ME_LEAD: "meLead",
  ME_PUBLISHER: "mePublisher",
})

export const ENGAGE_SIGNATURE_ROLE_LABELS = Object.freeze({
  [ENGAGE_SIGNATURE_SLOTS.AUTHOR]: "Author",
  [ENGAGE_SIGNATURE_SLOTS.SUPERVISOR]: "Activity Supervisor",
  [ENGAGE_SIGNATURE_SLOTS.ME_LEAD]: "M&E Lead",
  [ENGAGE_SIGNATURE_SLOTS.ME_PUBLISHER]: "M&E Team",
})

/** Labels for field path after colleague review: M&E member then M&E Lead publish. */
export const ENGAGE_FIELD_ME_LEAD_SIGNATURE_ROLE_LABELS = Object.freeze({
  [ENGAGE_SIGNATURE_SLOTS.AUTHOR]: "Author",
  [ENGAGE_SIGNATURE_SLOTS.SUPERVISOR]: "Colleague",
  [ENGAGE_SIGNATURE_SLOTS.ME_LEAD]: "M&E",
  [ENGAGE_SIGNATURE_SLOTS.ME_PUBLISHER]: "M&E Lead",
})
export const ENGAGE_ME_PROGRAMME_SIGNATURE_ROLE_LABELS = Object.freeze({
  [ENGAGE_SIGNATURE_SLOTS.AUTHOR]: "Author (M&E)",
  [ENGAGE_SIGNATURE_SLOTS.SUPERVISOR]: "M&E Fellow",
  [ENGAGE_SIGNATURE_SLOTS.ME_LEAD]: "M&E Lead",
  [ENGAGE_SIGNATURE_SLOTS.ME_PUBLISHER]: "Super Administrator",
})

const STATUS_LIKE_NAME =
  /^(approved|published|pending|processed|completed|awaiting(?:\s*\/?\s*completed)?|—|-|n\/?a|none|unknown)$/i

function trimName(value) {
  return String(value || "").trim()
}

/** True when the value looks like a real person's name (not a workflow status). */
export function isEngagePersonSignatureName(name) {
  const n = trimName(name)
  if (n.length < 2) return false
  if (STATUS_LIKE_NAME.test(n)) return false
  // Reject bare status phrases that sometimes leak into name fields
  if (/^(status|role|waiting)\b/i.test(n)) return false
  return true
}

function emptySlot() {
  return { name: null, userId: null, at: null, decision: null }
}

export function emptyEngageSignaturesState() {
  return {
    author: emptySlot(),
    supervisor: emptySlot(),
    meLead: emptySlot(),
    mePublisher: emptySlot(),
  }
}

function normalizeSlot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptySlot()
  const name = trimName(raw.name)
  return {
    name: isEngagePersonSignatureName(name) ? name : null,
    userId: raw.userId ? String(raw.userId) : null,
    at: raw.at || null,
    decision: raw.decision ? String(raw.decision) : null,
  }
}

export function getEngageSignaturesState(content = {}) {
  const raw = content?._signatures
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyEngageSignaturesState()
  }
  return {
    author: normalizeSlot(raw.author),
    supervisor: normalizeSlot(raw.supervisor),
    meLead: normalizeSlot(raw.meLead || raw.lead),
    mePublisher: normalizeSlot(raw.mePublisher || raw.publisher || raw.meTeam),
  }
}

/** Merge one signature slot into contentJson._signatures (preserves other content keys). */
export function withEngageSignature(
  content = {},
  slot,
  { name = "", userId = null, at = null, decision = null } = {}
) {
  const key = String(slot || "").trim()
  if (!Object.values(ENGAGE_SIGNATURE_SLOTS).includes(key)) {
    return content && typeof content === "object" ? content : {}
  }
  const prev = getEngageSignaturesState(content)
  const nextName = trimName(name)
  prev[key] = {
    name: isEngagePersonSignatureName(nextName) ? nextName : null,
    userId: userId ? String(userId) : null,
    at: at || null,
    decision: decision ? String(decision) : null,
  }
  return {
    ...(content && typeof content === "object" ? content : {}),
    _signatures: prev,
  }
}

/**
 * Map approval documents (stepOrder ascending) onto signature slots.
 * Step 2 ≈ supervisor approve; later approved/publish ≈ M&E.
 */
export function signaturesStateFromApprovals(approvals = []) {
  const state = emptyEngageSignaturesState()
  const rows = (Array.isArray(approvals) ? approvals : [])
    .filter((row) => String(row?.decision || "").toLowerCase() === "approved")
    .slice()
    .sort((a, b) => Number(a?.stepOrder || 0) - Number(b?.stepOrder || 0))

  for (const row of rows) {
    const name = trimName(row.reviewerName)
    if (!isEngagePersonSignatureName(name)) continue
    const slotPayload = {
      name,
      userId: row.reviewerId || null,
      at: row.decidedAt || null,
      decision: "approved",
    }
    const order = Number(row.stepOrder || 0)
    if (order <= 2 && !state.supervisor.name) {
      state.supervisor = slotPayload
    } else if (!state.mePublisher.name) {
      state.mePublisher = slotPayload
    } else if (!state.supervisor.name) {
      state.supervisor = slotPayload
    }
  }
  return state
}

function mergeSignatureStates(primary, fallback) {
  const a = primary || emptyEngageSignaturesState()
  const b = fallback || emptyEngageSignaturesState()
  const pick = (slot) => {
    if (isEngagePersonSignatureName(a[slot]?.name)) return a[slot]
    if (isEngagePersonSignatureName(b[slot]?.name)) return b[slot]
    return a[slot]?.at || a[slot]?.userId ? a[slot] : b[slot] || emptySlot()
  }
  return {
    author: pick(ENGAGE_SIGNATURE_SLOTS.AUTHOR),
    supervisor: pick(ENGAGE_SIGNATURE_SLOTS.SUPERVISOR),
    meLead: pick(ENGAGE_SIGNATURE_SLOTS.ME_LEAD),
    mePublisher: pick(ENGAGE_SIGNATURE_SLOTS.ME_PUBLISHER),
  }
}

/**
 * Build the three UI/export signature rows. Never puts status words in the name cell.
 * @param {string} [signatureProfile] "me_peer_admin" for M&E quarterly; "field_me_lead" for field (colleague → M&E → Lead publish).
 */
export function buildEngageSignatureRows({
  authorName = "",
  authorId = null,
  submittedAt = null,
  publishedAt = null,
  approvedAt = null,
  status = "",
  content = null,
  approvals = [],
  signatureProfile = null,
  formatDate = (value) => (value ? String(value).slice(0, 10) : "Pending"),
} = {}) {
  const fromContent = getEngageSignaturesState(content || {})
  const fromApprovals = signaturesStateFromApprovals(approvals)
  const state = mergeSignatureStates(fromContent, fromApprovals)
  const profile = String(signatureProfile || "").toLowerCase()
  const isMeProgramme = profile === "me_peer_admin"
  const isFieldMeLead = profile === "field_me_lead"
  const labels = isMeProgramme
    ? ENGAGE_ME_PROGRAMME_SIGNATURE_ROLE_LABELS
    : isFieldMeLead
      ? ENGAGE_FIELD_ME_LEAD_SIGNATURE_ROLE_LABELS
      : ENGAGE_SIGNATURE_ROLE_LABELS

  const author =
    isEngagePersonSignatureName(state.author.name)
      ? state.author.name
      : isEngagePersonSignatureName(authorName)
        ? trimName(authorName)
        : null

  const supervisor = isEngagePersonSignatureName(state.supervisor.name)
    ? state.supervisor.name
    : null
  const lead = isEngagePersonSignatureName(state.meLead?.name) ? state.meLead.name : null
  const publisher = isEngagePersonSignatureName(state.mePublisher.name)
    ? state.mePublisher.name
    : null

  const statusKey = String(status || "").toLowerCase()
  const isFieldArticle = isFieldArticleReport({}, content)
  const peerHistory = Array.isArray(content?._peerReview?.history) ? content._peerReview.history : []
  const hadColleagueReview = peerHistory.some((entry) => {
    const action = String(entry?.action || "")
      .replace(/^peer_/, "")
      .toLowerCase()
    return action === "sent_to_supervisor" || action === "passed" || action === "started" || action === "sent"
  })
  const colleagueSkipped = isFieldArticle && isFieldMeLead && !hadColleagueReview
  const leadSkipped = Boolean(content?._programmeLeadSkipped)
  const meFirstSkipped = Boolean(content?._meFirstReview?.skipped)
  const supervisorDone =
    Boolean(supervisor) ||
    colleagueSkipped ||
    ["approved", "published"].includes(statusKey) ||
    Boolean(approvedAt)
  const leadDone =
    Boolean(lead) || leadSkipped || meFirstSkipped || statusKey === "published"
  const publisherDone = Boolean(publisher) || statusKey === "published" || Boolean(publishedAt)

  const rows = [
    {
      slot: ENGAGE_SIGNATURE_SLOTS.AUTHOR,
      role: labels.author,
      name: author || "Pending",
      date: author
        ? formatDate(state.author.at || submittedAt)
        : "Pending",
      userId: state.author.userId || authorId || null,
      decision: state.author.decision || (author ? "submitted" : null),
      complete: Boolean(author),
    },
    {
      slot: ENGAGE_SIGNATURE_SLOTS.SUPERVISOR,
      role: labels.supervisor,
      name: colleagueSkipped
        ? "Not required"
        : supervisor || (supervisorDone ? "Name not recorded" : "Pending"),
      date: colleagueSkipped
        ? "—"
        : supervisor
          ? formatDate(state.supervisor.at || approvedAt)
          : supervisorDone
            ? formatDate(approvedAt) || "—"
            : "Pending",
      userId: state.supervisor.userId || null,
      decision: colleagueSkipped
        ? "skipped"
        : state.supervisor.decision ||
          (supervisor ? (isMeProgramme || isFieldMeLead ? "peer_reviewed" : "approved") : null),
      complete: Boolean(supervisor) || colleagueSkipped,
    },
  ]

  if (isMeProgramme || isFieldMeLead) {
    const skipped = isMeProgramme ? leadSkipped : meFirstSkipped
    const skipLabel = isMeProgramme
      ? "Not required (author is M&E Lead)"
      : "Not required"
    rows.push({
      slot: ENGAGE_SIGNATURE_SLOTS.ME_LEAD,
      role: labels.meLead,
      name: skipped ? skipLabel : lead || (leadDone ? "Name not recorded" : "Pending"),
      date: skipped
        ? "—"
        : lead
          ? formatDate(state.meLead.at || approvedAt)
          : leadDone
            ? formatDate(approvedAt) || "—"
            : "Pending",
      userId: state.meLead?.userId || null,
      decision: skipped ? "skipped" : state.meLead?.decision || (lead ? "approved" : null),
      complete: Boolean(lead) || skipped,
    })
  }

  rows.push({
    slot: ENGAGE_SIGNATURE_SLOTS.ME_PUBLISHER,
    role: labels.mePublisher,
    name: publisher || (publisherDone ? "Name not recorded" : "Pending"),
    date: publisher
      ? formatDate(state.mePublisher.at || publishedAt)
      : publisherDone
        ? formatDate(publishedAt) || "—"
        : "Pending",
    userId: state.mePublisher.userId || null,
    decision: state.mePublisher.decision || (publisher || publisherDone ? "published" : null),
    complete: Boolean(publisher),
  })

  return rows.map((row) => ({
    ...row,
    action: engageSignatureActionLabel(row, signatureProfile),
  }))
}

/** What this person did — shown on repository stamps and Word export. */
export function engageSignatureActionLabel(row = {}, signatureProfile = null) {
  if (!row?.complete) return "Awaiting action"
  const decision = String(row.decision || "").toLowerCase()
  if (decision === "skipped") return "Not required"
  if (decision === "peer_reviewed" || decision === "reviewed") return "Reviewed"
  if (decision === "submitted") return "Authored"
  if (decision === "published") return "Published to repository"
  if (decision === "approved") return "Approved"

  const isMeProgramme = String(signatureProfile || "").toLowerCase() === "me_peer_admin"
  const isFieldMeLead = String(signatureProfile || "").toLowerCase() === "field_me_lead"
  const slot = String(row.slot || "")
  if (slot === ENGAGE_SIGNATURE_SLOTS.AUTHOR) return "Authored"
  if (slot === ENGAGE_SIGNATURE_SLOTS.SUPERVISOR) {
    return isMeProgramme || isFieldMeLead ? "Reviewed" : "Approved"
  }
  if (slot === ENGAGE_SIGNATURE_SLOTS.ME_LEAD) return "Reviewed"
  if (slot === ENGAGE_SIGNATURE_SLOTS.ME_PUBLISHER) return "Published to repository"
  return "Recorded"
}

export const ENGAGE_PROOF_LOGO_SRC = "/letterhead/ecooking/nrep.png"

/**
 * Gate: repository publish requires named people on the signature block.
 * Field path: author + colleague + M&E (unless skipped) + M&E Lead publisher.
 * M&E programme path (me_peer_admin): author + Super Admin publisher;
 * fellow required when a peer review cycle ran.
 */
export function assertSignaturesReadyForRepository({
  content = {},
  approvals = [],
  publisherName = "",
  authorName = "",
  signatureProfile = null,
} = {}) {
  const state = mergeSignatureStates(
    getEngageSignaturesState(content),
    signaturesStateFromApprovals(approvals)
  )
  const profile = String(signatureProfile || "").toLowerCase()
  const isMeProgramme = profile === "me_peer_admin"
  const isFieldMeLead = profile === "field_me_lead"
  const isIncidentAdmin = profile === "incident_admin"
  const isFieldArticle = isFieldArticleReport({}, content)
  const peerHistory = Array.isArray(content?._peerReview?.history)
    ? content._peerReview.history
    : []
  const hadFellowReview = peerHistory.some((entry) => {
    const action = String(entry?.action || "")
      .replace(/^peer_/, "")
      .toLowerCase()
    return (
      action === "sent_to_supervisor" ||
      action === "passed" ||
      action === "started" ||
      action === "sent"
    )
  })
  const needsColleagueStamp =
    !isIncidentAdmin &&
    ((isMeProgramme && hadFellowReview) ||
      (isFieldMeLead && hadFellowReview && !isFieldArticle) ||
      (!isMeProgramme && !isFieldMeLead))

  if (needsColleagueStamp && !isEngagePersonSignatureName(state.supervisor.name)) {
    return {
      ok: false,
      code: "signatures_incomplete",
      error: isMeProgramme
        ? "Cannot publish to the repository: an M&E fellow must review this report first so their name appears on the signature block."
        : isFieldMeLead
          ? "Cannot publish: a colleague must review this report first."
          : "Cannot publish to the repository: the Activity Supervisor signature must show a real name (not just “Approved”). Ask the supervisor to approve again, or contact Engage support.",
    }
  }
  const leadSkipped = Boolean(content?._programmeLeadSkipped)
  const meFirstSkipped = Boolean(content?._meFirstReview?.skipped)
  if (
    isMeProgramme &&
    !leadSkipped &&
    !isEngagePersonSignatureName(state.meLead?.name)
  ) {
    return {
      ok: false,
      code: "signatures_incomplete",
      error:
        "Cannot publish to the repository: the M&E Lead must approve this quarterly first so their name appears on the signature block.",
    }
  }
  if (
    isFieldMeLead &&
    !isIncidentAdmin &&
    !meFirstSkipped &&
    !isEngagePersonSignatureName(state.meLead?.name)
  ) {
    return {
      ok: false,
      code: "signatures_incomplete",
      error: "Cannot publish: M&E review is not recorded yet.",
    }
  }
  if (!isEngagePersonSignatureName(publisherName) && !isEngagePersonSignatureName(state.mePublisher.name)) {
    return {
      ok: false,
      code: "signatures_incomplete",
      error: isMeProgramme
        ? "Cannot publish to the repository: your Super Admin account needs a display name for the publish signature."
        : isIncidentAdmin
          ? "Cannot publish: your Super Admin account needs a display name on the approval record."
          : isFieldMeLead
            ? "Cannot publish: your account needs a display name for the M&E Lead signature."
            : "Cannot publish to the repository: your account needs a display name for the M&E Team signature.",
    }
  }
  if (!isEngagePersonSignatureName(state.author.name) && !isEngagePersonSignatureName(authorName)) {
    return {
      ok: false,
      code: "signatures_incomplete",
      error: "Cannot publish to the repository: the report author name is missing.",
    }
  }
  return { ok: true, state }
}
