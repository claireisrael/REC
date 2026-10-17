// Sets the printed badge role for a list of people, and registers the people in
// groups marked createIfMissing who are not registered for the conference yet.
//
//   node scripts/apply_rec_badge_roles.mjs scripts/data/rec-badge-batch-2.json
//   node scripts/apply_rec_badge_roles.mjs scripts/data/rec-badge-batch-2.json --apply
//   node scripts/apply_rec_badge_roles.mjs scripts/data/rec-badge-batch-2.json --preview-pdf=badges.pdf
//
// Without --apply nothing is written; the report shows what would change.
// Each person is [firstName, lastName, email, badgeRole, organization?,
// country?, phone?, days?] where days is like "19;22" (day of the month).
// In a forumDelegates group, people with vetted REC days are UG-EU BF
// delegates on those days; people without are UG-EU BF only.
// People created without a usable email of their own get the
// noemail.<name>@example.invalid placeholder already used for such delegates.
// A person is matched by email only when the registration's name shares a word
// with theirs, because some lists reuse one email for two people. Otherwise the
// script looks for a single unclaimed registration with the same name.
import fs from "node:fs/promises"
import path from "node:path"
import dotenv from "dotenv"
import { Query } from "node-appwrite"
import { normalizeRecBadgeRole } from "../lib/rec-conference/rec-badge-display.mjs"
import {
  buildKampalaAttendanceRange,
  normalizeRegistrationEmail,
} from "../lib/rec-conference/registration-import-rules.mjs"
import {
  REC_BUSINESS_FORUM_ONLY_SESSION,
  REC_BUSINESS_FORUM_SESSION,
} from "../lib/rec-conference/registration-tracks.mjs"

dotenv.config({ path: ".env.local" })
dotenv.config({ path: ".env" })

const FORMAT = "1.9.0"
const APPLY = process.argv.includes("--apply")
const dataFile = process.argv.slice(2).find((arg) => !arg.startsWith("--"))

const endpoint = String(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
const apiKey = process.env.APPWRITE_API_KEY
const databaseId = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID
const registrationsCollectionId = process.env.NEXT_PUBLIC_REC_REGISTRATIONS_COLLECTION_ID
const conferencesCollectionId = process.env.NEXT_PUBLIC_REC_CONFERENCES_COLLECTION_ID

const NOT_PROVIDED = "Not provided"

function documentsPath(collectionId, suffix = "") {
  return `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/documents${suffix}`
}

async function request(pathname, { method = "GET", body, queries = [] } = {}) {
  const url = new URL(`${endpoint}${pathname}`)
  queries.forEach((query) => url.searchParams.append("queries[]", query))
  const response = await fetch(url, {
    method,
    headers: {
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
      "X-Appwrite-Response-Format": FORMAT,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || `${method} ${pathname} failed with ${response.status}`)
    error.status = response.status
    throw error
  }
  return payload
}

async function listAll(collectionId) {
  const documents = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])]
    const page = await request(documentsPath(collectionId), { queries })
    documents.push(...page.documents)
    if (page.documents.length < 100) return documents
    cursor = page.documents.at(-1).$id
  }
}

function nameWords(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 1)
}

function registrationWords(registration) {
  return new Set(nameWords([
    registration.firstName,
    registration.otherName,
    registration.lastName,
    registration.name,
  ].join(" ")))
}

function sharesNameWord(person, registration) {
  const words = registrationWords(registration)
  return nameWords(`${person.firstName} ${person.lastName}`).some((word) => words.has(word))
}

function hasFullName(person, registration) {
  const words = registrationWords(registration)
  return nameWords(`${person.firstName} ${person.lastName}`).every((word) => words.has(word))
}

function personLabel(person) {
  return `${person.firstName} ${person.lastName} <${person.email || "no email"}>`
}

function readPeople(data) {
  return (data.groups || []).flatMap((group) =>
    (group.people || []).map(([firstName, lastName, email, role, organization, country, phone, days]) => ({
      group: group.name,
      createIfMissing: Boolean(group.createIfMissing),
      forumDelegate: Boolean(group.forumDelegates),
      firstName: String(firstName || "").trim(),
      lastName: String(lastName || "").trim(),
      email: normalizeRegistrationEmail(email),
      role: normalizeRecBadgeRole(role),
      requestedRole: role,
      organization: String(organization || "").trim(),
      country: String(country || "").trim(),
      phone: String(phone || "").trim(),
      days: String(days || "").split(/[;,|]/).map((day) => day.trim()).filter(Boolean),
    }))
  )
}

function attendance(person, days) {
  const vetted = days.filter((day) => person.days.some((n) => String(day.date || "").endsWith(`-${n.padStart(2, "0")}`)))
  const chosen = vetted.length ? vetted : days
  return {
    daysAttending: chosen.map((day) => day.label),
    ...buildKampalaAttendanceRange(chosen),
    additionalSessions: !person.forumDelegate
      ? []
      : vetted.length ? [REC_BUSINESS_FORUM_SESSION] : [REC_BUSINESS_FORUM_SESSION, REC_BUSINESS_FORUM_ONLY_SESSION],
  }
}

function placeholderEmail(person) {
  const slug = nameWords(`${person.firstName} ${person.lastName}`).join(".")
  return `noemail.${slug}@example.invalid`
}

function parseDays(conference) {
  let days = conference.days
  if (typeof days === "string") {
    try { days = JSON.parse(days) } catch { days = [] }
  }
  return Array.isArray(days) ? days.filter((day) => day?.label) : []
}

if (!dataFile) throw new Error("Pass the JSON data file, for example scripts/data/rec-badge-batch-2.json")
if (!endpoint || !projectId || !apiKey || !databaseId || !registrationsCollectionId || !conferencesCollectionId) {
  throw new Error("Appwrite registrations and conferences configuration is missing.")
}

const data = JSON.parse(await fs.readFile(path.resolve(dataFile), "utf8"))
const year = Number(data.conferenceYear)
const people = readPeople(data)

const invalidRoles = people.filter((person) => !person.role)
if (invalidRoles.length) {
  throw new Error(`Unknown badge roles: ${invalidRoles.map((p) => `${personLabel(p)} "${p.requestedRole}"`).join("; ")}`)
}

const conference = (await listAll(conferencesCollectionId)).find((item) => Number(item.year) === year)
if (!conference) throw new Error(`No conference found for ${year}.`)
const days = parseDays(conference)

const registrations = (await listAll(registrationsCollectionId))
  .filter((registration) => registration.registrationType !== "Unregistered")
const byEmail = new Map()
for (const registration of registrations) {
  const email = normalizeRegistrationEmail(registration.email)
  if (email) byEmail.set(email, [...(byEmail.get(email) || []), registration])
}
const inConference = (registration) =>
  (Array.isArray(registration.conferenceYears) ? registration.conferenceYears : []).map(Number).includes(year)

// Email matches first, so a name fallback cannot take a registration that an
// email in this list already points at.
const claimed = new Map()
const results = people.map((person) => ({ person, registration: null, how: "" }))
for (const result of results) {
  const candidates = (byEmail.get(result.person.email) || []).filter((r) => sharesNameWord(result.person, r))
  const registration = candidates.find(inConference) || candidates[0]
  if (registration && !claimed.has(registration.$id)) {
    result.registration = registration
    result.how = "email"
    claimed.set(registration.$id, result.person)
  }
}
for (const result of results.filter((item) => !item.registration)) {
  const matches = registrations.filter((r) => !claimed.has(r.$id) && hasFullName(result.person, r))
  const current = matches.filter(inConference)
  const pick = current.length ? current : matches
  if (pick.length === 1) {
    result.registration = pick[0]
    result.how = "name"
    claimed.set(pick[0].$id, result.person)
  } else if (pick.length > 1) {
    result.how = `ambiguous (${pick.length} registrations named ${result.person.firstName} ${result.person.lastName})`
  }
}

const report = { updated: [], unchanged: [], addedToConference: [], created: [], missing: [], notInConference: [] }

console.log(`${APPLY ? "Applying" : "Dry run"}: ${people.length} people, ${conference.name || year}`)

for (const { person, registration, how } of results) {
  if (!registration) {
    if (!person.createIfMissing) {
      report.missing.push(`${person.group}: ${personLabel(person)}${how ? ` - ${how}` : ""}`)
      continue
    }
    const usable = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email) && !byEmail.has(person.email)
    const email = usable ? person.email : placeholderEmail(person)
    if (byEmail.has(email)) {
      report.missing.push(`${person.group}: ${personLabel(person)} - cannot create, ${email} is already used`)
      continue
    }
    const payload = {
      email,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone || NOT_PROVIDED,
      organization: person.organization || NOT_PROVIDED,
      city: NOT_PROVIDED,
      stateRegion: NOT_PROVIDED,
      country: person.country || (person.forumDelegate ? NOT_PROVIDED : "Uganda"),
      registrationType: "Attendee",
      badgeRole: person.role,
      conferenceYears: [year],
      ...attendance(person, days),
      additionalComments: `Added from the ${person.group} list.`,
    }
    byEmail.set(email, [payload])
    if (APPLY) {
      await request(documentsPath(registrationsCollectionId), {
        method: "POST",
        body: { documentId: "unique()", data: payload },
      })
    }
    const where = payload.additionalSessions.includes(REC_BUSINESS_FORUM_ONLY_SESSION)
      ? "UG-EU BF only"
      : payload.additionalSessions.length ? "REC26 & UG-EU BF" : "REC26 & Expo"
    report.created.push(`${person.group}: ${personLabel(person)} as ${person.role}, ${where}, ${payload.daysAttending.length} day(s)${usable ? "" : `, email ${email}`}`)
    continue
  }

  const changes = {}
  if (registration.badgeRole !== person.role) changes.badgeRole = person.role
  const registered = inConference(registration)
  if (!registered && person.createIfMissing) {
    changes.conferenceYears = [...(registration.conferenceYears || []), year]
    Object.assign(changes, attendance(person, days))
  }
  const label = `${person.group}: ${personLabel(person)} -> ${registration.firstName} ${registration.lastName} <${registration.email}> [${how}]`
  if (!registered && !person.createIfMissing) report.notInConference.push(label)

  if (!Object.keys(changes).length) {
    report.unchanged.push(label)
    continue
  }
  if (APPLY) {
    await request(documentsPath(registrationsCollectionId, `/${encodeURIComponent(registration.$id)}`), {
      method: "PATCH",
      body: { data: changes },
    })
  }
  if (changes.conferenceYears) report.addedToConference.push(`${label} as ${person.role}`)
  else report.updated.push(`${label}: ${registration.badgeRole || "(automatic)"} -> ${person.role}`)
}

report.renamed = []
for (const fix of data.nameCorrections || []) {
  const matches = byEmail.get(normalizeRegistrationEmail(fix.email)) || []
  if (matches.length !== 1 || !matches[0].$id) {
    report.missing.push(`Name correction: ${fix.email} matched ${matches.length} registrations`)
    continue
  }
  const [registration] = matches
  if (registration.firstName === fix.firstName && registration.lastName === fix.lastName) continue
  if (APPLY) {
    await request(documentsPath(registrationsCollectionId, `/${encodeURIComponent(registration.$id)}`), {
      method: "PATCH",
      body: { data: { firstName: fix.firstName, lastName: fix.lastName } },
    })
  }
  report.renamed.push(`${registration.firstName} ${registration.lastName} <${registration.email}> -> ${fix.firstName} ${fix.lastName}`)
}

const verb = APPLY ? "" : "would be "
for (const [key, title] of [
  ["updated", `Badge role ${verb}set`],
  ["addedToConference", `Existing people ${verb}added to ${year}`],
  ["created", `New registrations ${verb}created`],
  ["renamed", `Names ${verb}corrected`],
  ["unchanged", "Already correct"],
  ["notInConference", `Matched but not registered for ${year} (role still set; no badge until they are registered)`],
  ["missing", "Not found - add or fix these by hand"],
]) {
  console.log(`\n${title}: ${report[key].length}`)
  for (const line of report[key]) console.log(`  ${line}`)
}
if (!APPLY) console.log("\nNothing was written. Run again with --apply to save these changes.")

// --preview-pdf=out.pdf renders every matched person's badge, as it will print,
// into one PDF for checking. The QR codes are placeholders and there are no
// badge numbers; real ones come from Generate in the badge registry.
const previewArg = process.argv.find((arg) => arg.startsWith("--preview-pdf="))
if (previewArg) {
  const out = path.resolve(previewArg.slice("--preview-pdf=".length))
  const { renderBadge, combineBadgePdfs } = await import("../lib/rec-conference/badge-renderer.mjs")
  const { resolveRecBadgeRole } = await import("../lib/rec-conference/rec-badge-display.mjs")
  const { getRecRegistrantName } = await import("../lib/rec-conference/scanning-analytics.mjs")
  const { formatRecParticipantCategoryTag } = await import("../lib/rec-conference/registration-tracks.mjs")
  const pages = []
  for (const { registration } of results) {
    if (!registration?.$id) continue
    pages.push(await renderBadge({
      registration: {
        ...registration,
        name: getRecRegistrantName(registration),
        badgeRole: resolveRecBadgeRole(registration),
        participantCategoryTag: formatRecParticipantCategoryTag(registration, year),
      },
      badge: { badgeNumberLabel: "" },
      qrPayload: "NREP-PREVIEW-NOT-A-VALID-BADGE",
    }, { format: "pdf" }))
  }
  await fs.writeFile(out, await combineBadgePdfs(pages))
  console.log(`\nPreview PDF: ${pages.length} badges written to ${out}`)
}
