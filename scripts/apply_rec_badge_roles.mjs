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
import { formatRecBadgeDayTag, normalizeRecBadgeRole } from "../lib/rec-conference/rec-badge-display.mjs"
import {
  buildKampalaAttendanceRange,
  normalizeRegistrationEmail,
} from "../lib/rec-conference/registration-import-rules.mjs"
import {
  formatRecParticipantCategory,
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

function splitDays(value) {
  return String(value || "").split(/[;,|]/).map((day) => day.trim()).filter(Boolean)
}

// A group can set "days" (e.g. "20;21") and "sessions" (e.g. ["marketplace"])
// for all its people. With "restrictDays", people found in the database are
// limited to those days, unless an earlier group in the file also lists them,
// in which case the days are added to what that group gave them.
// "baseDays" (e.g. "20;21", the UG-EU BF days) are given to everyone in the
// group on top of their own vetted days; Organisers get every day.
// A group's "sessions" are also added to people already registered.
// "emailMatchOnly" matches people by email only, never by name.
// With "sharedEmail", several people may be created under one email (e.g. a
// delegation's contact person); email matches then need the full name.
// An empty role leaves the person's current badge role alone.
function readPeople(data) {
  return (data.groups || []).flatMap((group) =>
    (group.people || []).map(([firstName, lastName, email, role, organization, country, phone, days, title]) => ({
      group: group.name,
      createIfMissing: Boolean(group.createIfMissing),
      forumDelegate: Boolean(group.forumDelegates),
      restrictDays: Boolean(group.restrictDays),
      sharedEmail: Boolean(group.sharedEmail),
      emailMatchOnly: Boolean(group.emailMatchOnly),
      sessions: Array.isArray(group.sessions) ? group.sessions : [],
      firstName: String(firstName || "").trim(),
      lastName: String(lastName || "").trim(),
      title: String(title || "").trim(),
      email: normalizeRegistrationEmail(email),
      role: role ? normalizeRecBadgeRole(role) : "",
      requestedRole: role,
      organization: String(organization || "").trim(),
      country: String(country || "").trim(),
      phone: String(phone || "").trim(),
      days: splitDays(days).length ? splitDays(days) : splitDays(group.days),
      baseDays: splitDays(group.baseDays),
    }))
  )
}

function attendance(person, days) {
  const onDays = (list) => days.filter((day) => list.some((n) => String(day.date || "").endsWith(`-${n.padStart(2, "0")}`)))
  const vetted = onDays(person.days)
  const allowed = onDays([...person.days, ...person.baseDays])
  const chosen = allowed.length && person.role !== "Organiser" ? allowed : days
  const forumSessions = !person.forumDelegate
    ? []
    : vetted.length ? [REC_BUSINESS_FORUM_SESSION] : [REC_BUSINESS_FORUM_SESSION, REC_BUSINESS_FORUM_ONLY_SESSION]
  return {
    daysAttending: chosen.map((day) => day.label),
    ...buildKampalaAttendanceRange(chosen),
    additionalSessions: Array.from(new Set([...forumSessions, ...person.sessions])),
  }
}

function sameList(left, right) {
  const a = [...(left || [])].sort()
  const b = [...(right || [])].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
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

const invalidRoles = people.filter((person) => person.requestedRole && !person.role)
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
// email in this list already points at. The same person may appear in two
// groups (same email and name); both then work on the same registration.
const claimed = new Map()
const results = people.map((person) => ({ person, registration: null, how: "" }))
for (const result of results) {
  const candidates = (byEmail.get(result.person.email) || []).filter((r) => (result.person.sharedEmail ? hasFullName : sharesNameWord)(result.person, r))
  const registration = candidates.find(inConference) || candidates[0]
  if (registration && (!claimed.has(registration.$id) || claimed.get(registration.$id).email === result.person.email)) {
    result.registration = registration
    result.how = "email"
    claimed.set(registration.$id, result.person)
  }
}
// "emailMatchOnly" groups skip this: a list with single names (e.g. "Isma")
// would otherwise take over someone else's registration.
for (const result of results.filter((item) => !item.registration && !item.person.emailMatchOnly)) {
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
const seenInGroup = new Map()
const keepNote = (earlierGroup, person) =>
  earlierGroup && earlierGroup !== person.group && person.restrictDays ? ` (also on ${earlierGroup}, so those days are kept)` : ""

console.log(`${APPLY ? "Applying" : "Dry run"}: ${people.length} people, ${conference.name || year}`)

for (const { person, registration, how } of results) {
  if (!registration) {
    if (!person.createIfMissing) {
      report.missing.push(`${person.group}: ${personLabel(person)}${how ? ` - ${how}` : ""}`)
      continue
    }
    const usable = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email) && (person.sharedEmail
      ? !(byEmail.get(person.email) || []).some((r) => hasFullName(person, r))
      : !byEmail.has(person.email))
    const email = usable ? person.email : placeholderEmail(person)
    if (byEmail.has(email) && !(person.sharedEmail && email === person.email)) {
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
      ...(person.role ? { badgeRole: person.role } : {}),
      ...(person.title ? { title: person.title } : {}),
      conferenceYears: [year],
      ...attendance(person, days),
      additionalComments: `Added from the ${person.group} list.`,
    }
    byEmail.set(email, [...(byEmail.get(email) || []), payload])
    if (APPLY) {
      await request(documentsPath(registrationsCollectionId), {
        method: "POST",
        body: { documentId: "unique()", data: payload },
      })
    }
    const where = formatRecParticipantCategory(payload, year)
    report.created.push(`${person.group}: ${personLabel(person)} as ${person.role || "Delegate"}, ${where}, ${payload.daysAttending.map(formatRecBadgeDayTag).join(" + ")}${usable ? "" : `, email ${email}`}`)
    continue
  }

  const changes = {}
  if (person.role && registration.badgeRole !== person.role) changes.badgeRole = person.role
  const registered = inConference(registration)
  const earlierGroup = seenInGroup.get(registration.$id)
  if (!registered && person.createIfMissing) {
    changes.conferenceYears = [...(registration.conferenceYears || []), year]
    Object.assign(changes, attendance(person, days))
  } else if (registered && person.restrictDays) {
    const wanted = attendance(person, days)
    const current = Array.isArray(registration.daysAttending) ? registration.daysAttending : []
    // Keep days an earlier list in this file gave them; otherwise restrict.
    const keep = earlierGroup && earlierGroup !== person.group
    const dayLabels = keep ? days.map((d) => d.label).filter((label) => current.includes(label) || wanted.daysAttending.includes(label)) : wanted.daysAttending
    const sessions = Array.from(new Set([...(registration.additionalSessions || []), ...wanted.additionalSessions]))
    if (!sameList(dayLabels, current)) {
      changes.daysAttending = dayLabels
      Object.assign(changes, buildKampalaAttendanceRange(days.filter((d) => dayLabels.includes(d.label))))
    }
    if (!sameList(sessions, registration.additionalSessions || [])) changes.additionalSessions = sessions
  } else if (registered && person.sessions.length) {
    const sessions = Array.from(new Set([...(registration.additionalSessions || []), ...person.sessions]))
    if (!sameList(sessions, registration.additionalSessions || [])) changes.additionalSessions = sessions
  }
  if (!earlierGroup) seenInGroup.set(registration.$id, person.group)
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
  // Later groups see this person as updated.
  Object.assign(registration, changes)
  const detail = [
    changes.badgeRole ? `role ${changes.badgeRole}` : "",
    changes.daysAttending ? `days ${changes.daysAttending.map(formatRecBadgeDayTag).join(" + ")}` : "",
    changes.additionalSessions ? formatRecParticipantCategory({ additionalSessions: changes.additionalSessions }, year) : "",
  ].filter(Boolean).join(", ")
  if (changes.conferenceYears) report.addedToConference.push(`${label}: ${detail}`)
  else report.updated.push(`${label}: ${detail}${keepNote(earlierGroup, person)}`)
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
  ["updated", `Existing registrations ${verb}updated`],
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
  const { renderBadge, addA3BadgePages } = await import("../lib/rec-conference/badge-renderer.mjs")
  const { resolveRecBadgeRole } = await import("../lib/rec-conference/rec-badge-display.mjs")
  const { getRecRegistrantName } = await import("../lib/rec-conference/scanning-analytics.mjs")
  const { formatRecParticipantCategoryTag } = await import("../lib/rec-conference/registration-tracks.mjs")
  const { PDFDocument } = await import("pdf-lib")
  const sharp = (await import("sharp")).default
  // Laid out nine to an A3 sheet like the print sheets. Full-resolution print
  // PNGs make a multi-gigabyte file, so the preview embeds compressed JPEGs.
  const pdf = await PDFDocument.create()
  const cards = []
  // --group=NAME limits the preview to one group of the file.
  const onlyGroup = (process.argv.find((arg) => arg.startsWith("--group=")) || "").slice("--group=".length)
  const printed = new Set()
  for (const { person, registration } of results) {
    if (onlyGroup && person.group !== onlyGroup) continue
    if (!registration?.$id || printed.has(registration.$id)) continue
    printed.add(registration.$id)
    const png = await renderBadge({
      registration: {
        ...registration,
        name: getRecRegistrantName(registration),
        badgeRole: resolveRecBadgeRole(registration),
        participantCategoryTag: formatRecParticipantCategoryTag(registration, year),
      },
      badge: { badgeNumberLabel: "" },
      qrPayload: "NREP-PREVIEW-NOT-A-VALID-BADGE",
    }, { format: "png" })
    cards.push(await sharp(png).resize({ width: 900 }).jpeg({ quality: 80 }).toBuffer())
  }
  await addA3BadgePages(pdf, cards)
  await fs.writeFile(out, await pdf.save())
  console.log(`\nPreview PDF: ${cards.length} badges on ${pdf.getPageCount()} A3 sheets written to ${out}`)
}
