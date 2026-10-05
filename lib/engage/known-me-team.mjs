/**
 * Known M&E team identities (fellows / publishers) who should not wait on a
 * manual Admin → Roles click to join the M&E workspace.
 *
 * Lead (Mark) stays in known-me-leads.mjs.
 */

import { normalizePersonKey } from "./known-me-leads.mjs"

export const DEFAULT_ME_TEAM_MEMBERS = Object.freeze([
  {
    nameNeedles: ["mariah"],
    scopeLabel: "publisher",
  },
  {
    nameNeedles: ["rodney", "bukusuba"],
    scopeLabel: "publisher_articles",
  },
])

function splitCsv(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function nameMatches(person, needles) {
  const bits = (Array.isArray(needles) ? needles : [needles])
    .map((needle) => normalizePersonKey(needle))
    .filter(Boolean)
  if (!person || !bits.length) return false
  return bits.every((bit) => person.includes(bit))
}

export function resolveKnownMeTeamMember(
  { userId = "", name = "", email = "" } = {},
  {
    teamUserIds = splitCsv(process.env.ENGAGE_ME_TEAM_USER_IDS),
    teamEmails = splitCsv(process.env.ENGAGE_ME_TEAM_EMAILS).map((e) => e.toLowerCase()),
    members = DEFAULT_ME_TEAM_MEMBERS,
  } = {}
) {
  const uid = String(userId || "").trim()
  const mail = String(email || "").trim().toLowerCase()
  const person = normalizePersonKey(name)

  if (uid && teamUserIds.some((id) => String(id) === uid)) {
    return { scopeLabel: "publisher", matchedBy: "userId" }
  }
  if (mail && teamEmails.includes(mail)) {
    return { scopeLabel: "publisher", matchedBy: "email" }
  }

  for (const member of Array.isArray(members) ? members : []) {
    if (nameMatches(person, member.nameNeedles)) {
      return {
        scopeLabel: member.scopeLabel || "publisher",
        matchedBy: "name",
      }
    }
  }
  return null
}

export function isKnownMeTeamIdentity(identity = {}, options = {}) {
  return Boolean(resolveKnownMeTeamMember(identity, options))
}
