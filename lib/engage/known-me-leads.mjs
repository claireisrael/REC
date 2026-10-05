/**
 * Known M&E Lead identities. Mark leads the desk and must not wait on a manual
 * Admin → Roles click to open the M&E workspace.
 */

export const DEFAULT_ME_LEAD_NAME_NEEDLES = Object.freeze(["tusiime mark", "mark tusiime"])

function splitCsv(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function normalizePersonKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function isKnownMeLeadIdentity(
  { userId = "", name = "", email = "" } = {},
  {
    leadUserIds = splitCsv(process.env.ENGAGE_ME_LEAD_USER_IDS),
    leadEmails = splitCsv(process.env.ENGAGE_ME_LEAD_EMAILS).map((e) => e.toLowerCase()),
    nameNeedles = DEFAULT_ME_LEAD_NAME_NEEDLES,
  } = {}
) {
  const uid = String(userId || "").trim()
  if (uid && leadUserIds.some((id) => String(id) === uid)) return true

  const mail = String(email || "").trim().toLowerCase()
  if (mail && leadEmails.includes(mail)) return true

  const person = normalizePersonKey(name)
  if (!person) return false
  return (Array.isArray(nameNeedles) ? nameNeedles : []).some((needle) => {
    const bits = normalizePersonKey(needle).split(" ").filter(Boolean)
    return bits.length > 0 && bits.every((bit) => person.includes(bit))
  })
}

/** Session / actor object may carry ids on several keys — match any against known Lead. */
export function actorIsKnownMeLead(actorLike = {}) {
  if (!actorLike || typeof actorLike !== "object") return false
  const name = String(actorLike.name || "").trim()
  const email = String(actorLike.email || "").trim()
  const ids = [
    actorLike.userId,
    actorLike.profileId,
    actorLike.$id,
    actorLike.id,
    actorLike.documentId,
    ...(Array.isArray(actorLike._allIds) ? actorLike._allIds : []),
  ]
  for (const id of ids) {
    if (isKnownMeLeadIdentity({ userId: id, name, email })) return true
  }
  return isKnownMeLeadIdentity({ name, email })
}
