import crypto, { randomInt, randomUUID } from "crypto"
import { Query } from "node-appwrite"
import {
  createRestDocument,
  createRestFile,
  deleteRestDocument,
  getRestDocument,
  listRestDocuments,
  updateRestDocument,
} from "@/lib/appwrite/appwrite-rest-server"
import { config } from "@/lib/appwrite/config"
import {
  RAPPORTEUR_APPROVER_NAME,
  RAPPORTEUR_ARCHIVE_NAME,
  RAPPORTEUR_FOLDER_KEY,
  RAPPORTEUR_FOLDER_LABEL,
  RAPPORTEUR_REPOSITORY_PATH,
  rapporteurDayClusterKey,
  rapporteurFolderDay,
  RAPPORTEUR_HALLS,
  canEditReport,
  canReviewReport,
  canSubmitReport,
  clockTime,
  emptyReportContent,
  hallsMatch,
  mediaLinksFromText,
  normalizeHall,
  parseMediaLinks,
  parseReportContent,
  renderReportHtml,
  reportContentReady,
  reportFileName,
  sanitizeReportContent,
  sessionDateLabel,
  sessionOrderKey,
  speakersToComposition,
} from "@/lib/rec-conference/rapporteur-rules.mjs"

const COLLECTIONS = {
  assignments: "rec_rapporteurs",
  otps: "rec_rapporteur_otps",
  sessions: "rec_rapporteur_sessions",
  extras: "rec_rapporteur_extras",
  reports: "rec_rapporteur_reports",
  comments: "rec_rapporteur_comments",
}

const OTP_TTL_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const MAX_OTP_ATTEMPTS = 5
const personCache = new Map()

export class RecRapporteurError extends Error {
  constructor(message, status = 400, code = "rapporteur_error") {
    super(message)
    this.status = status
    this.code = code
  }
}

function nowIso() {
  return new Date().toISOString()
}

function addMs(date, ms) {
  return new Date(date.getTime() + ms).toISOString()
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase()
}

function hashValue(value) {
  const secret =
    process.env.REC_SCANNER_TOKEN_SECRET ||
    process.env.AUTH_COOKIE_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.APPWRITE_API_KEY
  if (!secret) throw new Error("Missing session secret")
  return crypto.createHmac("sha256", secret).update(String(value)).digest("hex")
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

async function listAll(collectionId, queries) {
  const documents = []
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = await listRestDocuments(collectionId, [
      ...queries,
      Query.limit(100),
      Query.offset(offset),
    ])
    const docs = page?.documents || []
    documents.push(...docs)
    if (docs.length < 100) break
  }
  return documents
}

function publicConference(doc) {
  if (!doc) return null
  return {
    $id: doc.$id,
    title: doc.title || "",
    year: doc.year || "",
    theme: doc.theme || "",
    startDate: doc.startDate || "",
    endDate: doc.endDate || "",
    location: doc.location || doc.venue || "",
  }
}

async function assignmentsForEmail(email) {
  const normalized = normalizeEmail(email)
  const documents = await listAll(COLLECTIONS.assignments, [])
  return documents.filter((item) => normalizeEmail(item.email) === normalized)
}

async function activeAssignments(email, conferenceId) {
  const normalized = normalizeEmail(email)
  const documents = await listAll(COLLECTIONS.assignments, [Query.equal("conferenceId", conferenceId)])
  return documents.filter((item) => item.status === "active" && normalizeEmail(item.email) === normalized)
}

function assignmentIsOpen(item, at = Date.now()) {
  if (!item || item.status !== "active") return false
  if (item.accessStartsAt && Date.parse(item.accessStartsAt) > at) return false
  if (item.accessEndsAt && Date.parse(item.accessEndsAt) < at) return false
  return true
}

function closedAssignmentError(items) {
  if (!items.length) {
    return new RecRapporteurError("This email is not assigned as a rapporteur for that conference.", 403, "rapporteur_not_allowed")
  }
  const now = Date.now()
  if (items.every((item) => item.status !== "active")) {
    return new RecRapporteurError("This rapporteur assignment is not active.", 403, "rapporteur_inactive")
  }
  if (items.some((item) => item.accessStartsAt && Date.parse(item.accessStartsAt) > now)) {
    return new RecRapporteurError("This rapporteur assignment has not started.", 403, "rapporteur_not_started")
  }
  return new RecRapporteurError("This rapporteur assignment has ended.", 403, "rapporteur_expired")
}

function assertHallAccess(assignments, hall) {
  if (!assignments.some((item) => hallsMatch(item.hall, hall))) {
    throw new RecRapporteurError("This session is not in your hall.", 403, "hall_forbidden")
  }
}

export function readBearerToken(request) {
  const header = request?.headers?.get?.("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ""
}

export async function getRapporteurContext(token) {
  if (!token) throw new RecRapporteurError("Sign in to open your sessions.", 401, "missing_token")
  const result = await listRestDocuments(COLLECTIONS.sessions, [
    Query.equal("tokenHash", hashValue(token)),
    Query.limit(1),
  ])
  const session = result.documents?.[0]
  if (!session || session.revokedAt || Date.parse(session.expiresAt) < Date.now()) {
    throw new RecRapporteurError("Your session has ended. Sign in again.", 401, "session_expired")
  }
  const assignments = (await activeAssignments(session.email, session.conferenceId)).filter((item) => assignmentIsOpen(item))
  if (!assignments.length) {
    const recorded = await activeAssignments(session.email, session.conferenceId)
    throw closedAssignmentError(recorded.length ? recorded : [])
  }
  const profile = assignments[0]
  return {
    email: session.email,
    name: profile.name || "",
    phone: profile.phone || "",
    conferenceId: session.conferenceId,
    assignments,
    sessionId: session.$id,
  }
}

export async function listRapporteurConferences(emailValue) {
  const email = normalizeEmail(emailValue)
  if (!email.includes("@")) {
    throw new RecRapporteurError("Enter a valid email address.", 400, "invalid_email")
  }
  const documents = await assignmentsForEmail(email)
  const open = documents.filter((item) => assignmentIsOpen(item))
  if (!open.length && documents.length) throw closedAssignmentError(documents)
  const ids = [...new Set(open.map((item) => item.conferenceId))]
  const conferences = []
  for (const id of ids) {
    try {
      conferences.push(publicConference(await getRestDocument(config.recConferencesCollectionId, id)))
    } catch {
      // A removed conference should not block the others.
    }
  }
  return { conferences: conferences.filter(Boolean) }
}

async function sendMail({ email, subject, text, html }) {
  const base = String(config.apiBaseUrl || "").trim().replace(/\/$/, "")
  if (!base || !email) throw new Error("Email API is not configured")
  const response = await fetch(`${base}/api/general/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, subject, text, ...(html ? { html } : {}) }),
  })
  if (!response.ok) throw new Error(`Email failed (${response.status})`)
}

async function createAccessCode(email, conferenceId) {
  const otpCode = String(randomInt(100000, 1000000))
  const otpId = randomUUID()
  await createRestDocument(COLLECTIONS.otps, {
    conferenceId,
    email,
    otpId,
    otpHash: hashValue(otpCode),
    expiresAt: addMs(new Date(), OTP_TTL_MS),
    attemptCount: 0,
    consumedAt: "",
    createdAt: nowIso(),
  })
  return { otpCode, otpId }
}

async function sendAccessCodeEmail({ email, name, conference, hall, otpCode }) {
  const conferenceTitle = conference?.title || "REC26"
  const recipient = name || "there"
  const hallLine = hall ? ` for ${hall}` : ""
  const link = reportingUrl()
  const subject = `${conferenceTitle} rapporteur access code`
  const text = `Hello ${recipient},

You can report${hallLine} at ${conferenceTitle}.

Open ${link}
Access code: ${otpCode}

This code expires in 10 minutes. You can request another code on that page.`
  const html = `
    <div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <div style="background:#176f91;padding:22px 24px;color:#ffffff;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#EFA74F;">REC26 &amp; EXPO</p>
            <h2 style="margin:0;font-size:22px;line-height:1.25;">Rapporteur access code</h2>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 14px;">Hello ${escapeHtml(recipient)},</p>
            <p style="margin:0 0 18px;line-height:1.6;">You can report${escapeHtml(hallLine)} at <strong>${escapeHtml(conferenceTitle)}</strong>.</p>
            <div style="margin:18px 0;padding:18px;border-radius:12px;background:#ecfeff;text-align:center;color:#176f91;font-size:30px;letter-spacing:7px;font-weight:800;">
              ${escapeHtml(otpCode)}
            </div>
            <p style="margin:0 0 18px;">
              <a href="${escapeHtml(link)}" style="display:inline-block;background:#c56a00;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:700;">Open reporting</a>
            </p>
            <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">This code expires in 10 minutes. You can request another code on that page.</p>
          </div>
        </div>
      </div>
    </div>`
  await sendMail({ email, subject, text, html })
}

async function emailAssignmentAccess({ email, name, conferenceId, hall, conference }) {
  const { otpCode, otpId } = await createAccessCode(email, conferenceId)
  await sendAccessCodeEmail({
    email,
    name,
    conference: conference || publicConference(await getRestDocument(config.recConferencesCollectionId, conferenceId)),
    hall,
    otpCode,
  })
  return { otpId }
}

async function notifySafely(payload) {
  try {
    await sendMail(payload)
    return true
  } catch (error) {
    console.error("Rapporteur email was not sent", error?.message || error)
    return false
  }
}

function reportingUrl() {
  const base = String(config.recPublicSiteUrl || process.env.REC_PUBLIC_SITE_URL || "https://rec.nrep.ug").replace(/\/$/, "")
  return `${base}/reporting`
}

function reviewPath(conferenceId, reportId = "") {
  const params = new URLSearchParams()
  if (conferenceId) params.set("conferenceId", conferenceId)
  if (reportId) params.set("reportId", reportId)
  const query = params.toString()
  return `/dashboard/rec-conference/admin/reporting${query ? `?${query}` : ""}`
}

function reviewUrl(conferenceId, reportId = "") {
  const base = String(
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://hr.nrep.ug"
  ).replace(/\/$/, "")
  return `${base}${reviewPath(conferenceId, reportId)}`
}

function mailCard({ heading, body, href, action }) {
  return `
    <div style="font-family:Arial,sans-serif;color:#1c2430;">
      <div style="max-width:560px;margin:0 auto;border:1px solid #e4eaee;border-radius:12px;overflow:hidden;">
        <div style="background:#176f91;color:#fff;padding:18px 20px;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#EFA74F;">REC26 &amp; EXPO</div>
          <h2 style="margin:6px 0 0;font-size:20px;">${escapeHtml(heading)}</h2>
        </div>
        <div style="padding:18px 20px;line-height:1.5;">
          <p style="margin:0 0 16px;">${escapeHtml(body)}</p>
          <a href="${escapeHtml(href)}" style="display:inline-block;background:#c56a00;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">${escapeHtml(action)}</a>
        </div>
      </div>
    </div>`
}

function personMatches(doc, fullName) {
  const name = String(doc?.name || doc?.fullName || "").toLowerCase()
  const wanted = fullName.toLowerCase().split(/\s+/).filter(Boolean)
  return wanted.every((part) => name.includes(part)) && Boolean(doc?.email || doc?.userId)
}

async function lookupPerson(fullName) {
  const usersId = process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || ""
  if (!usersId) return null
  const lastName = fullName.trim().split(/\s+/).pop()
  const batches = []
  try {
    batches.push(await listRestDocuments(usersId, [Query.equal("name", fullName), Query.limit(5)]))
  } catch {
    // The directory may not have an exact-name index.
  }
  try {
    batches.push(await listRestDocuments(usersId, [Query.search("name", lastName), Query.limit(25)]))
  } catch {
    // Search is optional when the name index is not full text.
  }
  for (const batch of batches) {
    const found = (batch?.documents || []).find((doc) => personMatches(doc, fullName))
    if (found) {
      return {
        userId: found.userId || "",
        email: normalizeEmail(found.email),
        name: found.name || found.fullName || fullName,
      }
    }
  }
  return null
}

async function findPerson(fullName) {
  const key = fullName.toLowerCase()
  const cached = personCache.get(key)
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.person
  const person = await lookupPerson(fullName)
  personCache.set(key, { at: Date.now(), person })
  return person
}

async function findUserByEmail(email) {
  const usersId = process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || ""
  const wanted = normalizeEmail(email)
  if (!usersId || !wanted) return null
  try {
    const batch = await listRestDocuments(usersId, [Query.equal("email", wanted), Query.limit(5)])
    const found = (batch?.documents || []).find((doc) => normalizeEmail(doc.email) === wanted)
    if (!found) return null
    return { userId: found.userId || "", email: wanted, name: found.name || "" }
  } catch {
    return null
  }
}

async function notifyInApp({ userId, message, reportId, href = "", kind = "review" }) {
  const collectionId = process.env.NEXT_PUBLIC_ENGAGE_NOTIFICATIONS_COLLECTION_ID || ""
  if (!collectionId || !userId) return false
  const path = String(href || "").startsWith("/") ? String(href) : ""
  const payload = {
    userId,
    type: kind === "filed" ? "rec_report_filed" : "rec_report_review",
    message,
    relatedEntityId: reportId,
    read: false,
    channel: "in_app",
    createdAt: nowIso(),
  }
  const attempts = []
  if (path) attempts.push({ ...payload, metaJson: JSON.stringify({ href: path }) })
  if (path) attempts.push({ ...payload, type: "comment", metaJson: JSON.stringify({ href: path }) })
  attempts.push(payload)
  let lastError = null
  for (const attempt of attempts) {
    try {
      await createRestDocument(collectionId, attempt)
      return true
    } catch (error) {
      lastError = error
    }
  }
  console.error("Rapporteur notification was not saved", lastError?.message || lastError)
  return false
}

function noticeFor(person, label, inApp, mailed) {
  if (!person) return `${label} was not found in the staff directory, so no notification was sent.`
  if (!person.email && !person.userId) return `${label} has no contact on file, so no notification was sent.`
  if (!inApp && !mailed) return `${label} could not be notified.`
  if (!mailed && person.email) return `The email to ${label} could not be sent.`
  if (!inApp && person.userId) return `The in-app notification for ${label} could not be saved.`
  return ""
}

export async function requestRapporteurOtp({ email: emailValue, conferenceId }) {
  const email = normalizeEmail(emailValue)
  if (!email.includes("@") || !conferenceId) {
    throw new RecRapporteurError("Choose the conference and enter your email.", 400, "invalid_email")
  }
  const assignments = (await activeAssignments(email, conferenceId)).filter((item) => assignmentIsOpen(item))
  if (!assignments.length) throw closedAssignmentError(await activeAssignments(email, conferenceId))
  const conference = publicConference(await getRestDocument(config.recConferencesCollectionId, conferenceId))
  const { otpCode, otpId } = await createAccessCode(email, conferenceId)
  let devOtpCode = ""
  try {
    await sendAccessCodeEmail({
      email,
      name: assignments[0].name,
      conference,
      hall: assignments.map((item) => normalizeHall(item.hall)).filter(Boolean).join(", "),
      otpCode,
    })
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new RecRapporteurError("The access code could not be emailed.", 503, "email_failed")
    }
    devOtpCode = otpCode
  }
  return {
    success: true,
    otpId,
    email,
    conference,
    ...(devOtpCode ? { devOtpCode } : {}),
  }
}

export async function verifyRapporteurOtp({ email: emailValue, conferenceId, otpId, code }) {
  const email = normalizeEmail(emailValue)
  const otpCode = String(code || "").trim()
  if (!email || !conferenceId || !otpId || !/^\d{6}$/.test(otpCode)) {
    throw new RecRapporteurError("Enter the 6-digit code.", 400, "invalid_otp_request")
  }
  const result = await listRestDocuments(COLLECTIONS.otps, [
    Query.equal("conferenceId", conferenceId),
    Query.equal("email", email),
    Query.equal("otpId", otpId),
    Query.limit(1),
  ])
  const otp = result.documents?.[0]
  if (!otp || otp.consumedAt) throw new RecRapporteurError("That code is no longer valid.", 400, "invalid_otp")
  if (Date.parse(otp.expiresAt) < Date.now()) throw new RecRapporteurError("That code has expired.", 400, "expired_otp")
  if (Number(otp.attemptCount || 0) >= MAX_OTP_ATTEMPTS) {
    throw new RecRapporteurError("Too many attempts. Request a new code.", 429, "otp_attempts_exceeded")
  }
  if (hashValue(otpCode) !== otp.otpHash) {
    await updateRestDocument(COLLECTIONS.otps, otp.$id, { attemptCount: Number(otp.attemptCount || 0) + 1 })
    throw new RecRapporteurError("That code is incorrect.", 400, "invalid_otp")
  }
  const assignments = (await activeAssignments(email, conferenceId)).filter((item) => assignmentIsOpen(item))
  if (!assignments.length) throw closedAssignmentError(await activeAssignments(email, conferenceId))
  await updateRestDocument(COLLECTIONS.otps, otp.$id, { consumedAt: nowIso() })
  const token = crypto.randomBytes(32).toString("base64url")
  const expiresAt = addMs(new Date(), SESSION_TTL_MS)
  await createRestDocument(COLLECTIONS.sessions, {
    conferenceId,
    email,
    tokenHash: hashValue(token),
    expiresAt,
    revokedAt: "",
    createdAt: nowIso(),
  })
  return {
    token,
    expiresAt,
    name: assignments[0].name || "",
    email,
    conferenceId,
    halls: assignments.map((item) => normalizeHall(item.hall)),
  }
}

export async function logoutRapporteur(token) {
  if (!token) return { success: true }
  const result = await listRestDocuments(COLLECTIONS.sessions, [
    Query.equal("tokenHash", hashValue(token)),
    Query.limit(1),
  ])
  const session = result.documents?.[0]
  if (session && !session.revokedAt) {
    await updateRestDocument(COLLECTIONS.sessions, session.$id, { revokedAt: nowIso() })
  }
  return { success: true }
}

async function loadPlannedSessions(conferenceId) {
  const programmes = await listAll(config.recProgrammesCollectionId, [Query.equal("conferenceId", conferenceId)])
  const sessions = []
  for (const programme of programmes) {
    const docs = await listAll(config.recSessionsCollectionId, [Query.equal("programId", programme.$id)])
    sessions.push(...docs.filter((doc) => String(doc.status || "").toUpperCase() !== "CANCELLED"))
  }
  return sessions
}

function listRow(source, report) {
  return {
    sessionKey: source.sessionKey,
    title: source.title || "Untitled session",
    hall: normalizeHall(source.hall),
    sessionDate: source.sessionDate || "",
    startTime: clockTime(source.startTime),
    endTime: clockTime(source.endTime),
    sortAt: sessionOrderKey({
      startTime: source.rawStart || source.startTime,
      sessionDate: source.sessionDate,
      day: source.day,
      conferenceStart: source.conferenceStart,
    }),
    unplanned: Boolean(source.unplanned),
    status: report?.status || "new",
    reportId: report?.$id || "",
  }
}

export async function listAssignedSessions(context) {
  const conference = publicConference(await getRestDocument(config.recConferencesCollectionId, context.conferenceId))
  const planned = await loadPlannedSessions(context.conferenceId)
  const extras = await listAll(COLLECTIONS.extras, [Query.equal("conferenceId", context.conferenceId)])
  const reports = await listAll(COLLECTIONS.reports, [Query.equal("conferenceId", context.conferenceId)])
  const byKey = new Map(reports.map((item) => [item.sessionKey, item]))
  const rows = []
  for (const session of planned) {
    if (!context.assignments.some((item) => hallsMatch(item.hall, session.venueHall))) continue
    const sessionKey = `session:${session.$id}`
    rows.push(listRow({
      sessionKey,
      title: session.title,
      hall: session.venueHall,
      sessionDate: sessionDateLabel(session, conference?.startDate),
      startTime: session.startTime,
      endTime: session.toTime,
      rawStart: session.startTime,
      day: session.day,
      conferenceStart: conference?.startDate,
    }, byKey.get(sessionKey)))
  }
  for (const extra of extras) {
    if (!context.assignments.some((item) => hallsMatch(item.hall, extra.hall))) continue
    const sessionKey = `extra:${extra.$id}`
    rows.push(listRow({
      sessionKey,
      title: extra.title,
      hall: extra.hall,
      sessionDate: extra.date,
      startTime: extra.startTime,
      endTime: extra.endTime,
      rawStart: extra.startTime,
      unplanned: true,
    }, byKey.get(sessionKey)))
  }
  rows.sort((a, b) => (a.sortAt - b.sortAt) || a.title.localeCompare(b.title))
  return {
    conference,
    name: context.name,
    email: context.email,
    halls: [...new Set(context.assignments.map((item) => normalizeHall(item.hall)))],
    sessions: rows,
  }
}

export async function previewRapporteurDashboard(assignmentId) {
  const id = String(assignmentId || "").trim()
  if (!id) throw new RecRapporteurError("Choose a rapporteur.", 400, "missing_assignment")
  const doc = await getRestDocument(COLLECTIONS.assignments, id).catch(() => null)
  if (!doc) throw new RecRapporteurError("That rapporteur was not found.", 404, "assignment_not_found")
  const dashboard = await listAssignedSessions({
    email: normalizeEmail(doc.email),
    name: doc.name || "",
    phone: doc.phone || "",
    conferenceId: doc.conferenceId,
    assignments: [doc],
  })
  return { ...dashboard, preview: true, assignmentId: doc.$id }
}

async function resolveSessionSource(conferenceId, sessionKey) {
  const [kind, id] = String(sessionKey || "").split(":")
  if (!id || (kind !== "session" && kind !== "extra")) {
    throw new RecRapporteurError("That session was not found.", 404, "session_not_found")
  }
  if (kind === "extra") {
    const extra = await getRestDocument(COLLECTIONS.extras, id).catch(() => null)
    if (!extra || extra.conferenceId !== conferenceId) {
      throw new RecRapporteurError("That session was not found.", 404, "session_not_found")
    }
    return {
      sessionKey,
      title: extra.title || "",
      hall: normalizeHall(extra.hall),
      sessionDate: extra.date || "",
      day: extra.day,
      startTime: extra.startTime || "",
      endTime: extra.endTime || "",
      speakers: "",
      preamble: "",
      mediaText: extra.mediaLinksJson || "[]",
      unplanned: true,
    }
  }
  const session = await getRestDocument(config.recSessionsCollectionId, id).catch(() => null)
  if (!session) throw new RecRapporteurError("That session was not found.", 404, "session_not_found")
  const programme = await getRestDocument(config.recProgrammesCollectionId, session.programId).catch(() => null)
  if (!programme || programme.conferenceId !== conferenceId) {
    throw new RecRapporteurError("That session was not found.", 404, "session_not_found")
  }
  const conference = publicConference(await getRestDocument(config.recConferencesCollectionId, conferenceId))
  return {
    sessionKey,
    title: session.title || "",
    hall: normalizeHall(session.venueHall),
    sessionDate: sessionDateLabel(session, conference?.startDate),
    day: session.day || session.dayNumber,
    startTime: session.startTime || "",
    endTime: session.toTime || "",
    speakers: session.speakers || "",
    preamble: session.preamble || "",
    mediaText: "",
    unplanned: false,
  }
}

async function liveMediaLinks(conferenceId, source) {
  const links = [
    ...parseMediaLinks(source.mediaText),
    ...mediaLinksFromText(source.preamble),
    ...mediaLinksFromText(source.speakers),
  ]
  const title = String(source.title || "").trim().toLowerCase()
  if (title.length >= 6 && config.recMediaItemsCollectionId) {
    const items = await listAll(config.recMediaItemsCollectionId, [Query.equal("conferenceId", conferenceId)]).catch(() => [])
    for (const item of items) {
      if (item.isPublished === false) continue
      const hay = `${item.title || ""} ${item.description || ""}`.toLowerCase()
      if (!hay.includes(title)) continue
      for (const url of [item.externalUrl, item.videoUrl, item.thumbnailUrl]) {
        if (/^https:\/\//i.test(String(url || ""))) links.push({ label: item.title || "Session media", url: String(url) })
      }
    }
  }
  const seen = new Set()
  return links.filter((item) => {
    if (seen.has(item.url)) return false
    seen.add(item.url)
    return true
  }).slice(0, 30)
}

async function reportByKey(sessionKey) {
  const result = await listRestDocuments(COLLECTIONS.reports, [
    Query.equal("sessionKey", sessionKey),
    Query.limit(1),
  ])
  return result.documents?.[0] || null
}

function presentReport(doc, mediaLinks, speakerHint = "") {
  return {
    $id: doc.$id,
    sessionKey: doc.sessionKey,
    conferenceId: doc.conferenceId,
    title: doc.title || "",
    hall: doc.hall || "",
    sessionDate: doc.sessionDate || "",
    startTime: clockTime(doc.startTime),
    endTime: clockTime(doc.endTime),
    authorName: doc.authorName || "",
    authorEmail: doc.authorEmail || "",
    authorPhone: doc.authorPhone || "",
    status: doc.status || "draft",
    revision: Number(doc.revision || 1),
    content: parseReportContent(doc.contentJson),
    mediaLinks,
    speakerHint,
    submittedAt: doc.submittedAt || "",
    approvedAt: doc.approvedAt || "",
    repositoryItemId: doc.repositoryItemId || "",
  }
}

function speakerHint(speakers) {
  if (typeof speakers !== "string") return ""
  const trimmed = speakers.trim()
  if (!trimmed || trimmed.startsWith("[") || trimmed.startsWith("{")) return ""
  return trimmed.slice(0, 500)
}

async function presentWithMedia(doc, source) {
  const frozen = doc.status === "submitted" || doc.status === "approved"
  const mediaLinks = frozen ? parseMediaLinks(doc.mediaLinksJson) : await liveMediaLinks(doc.conferenceId, source)
  return presentReport(doc, mediaLinks, speakerHint(source.speakers))
}

export async function openRapporteurReport(context, sessionKey) {
  const source = await resolveSessionSource(context.conferenceId, sessionKey)
  assertHallAccess(context.assignments, source.hall)
  let doc = await reportByKey(sessionKey)
  if (!doc) {
    const assignment = context.assignments.find((item) => hallsMatch(item.hall, source.hall)) || context.assignments[0]
    const content = emptyReportContent()
    content.composition = speakersToComposition(source.speakers)
    const createdAt = nowIso()
    doc = await createRestDocument(COLLECTIONS.reports, {
      conferenceId: context.conferenceId,
      sessionKey,
      hall: source.hall,
      title: String(source.title || "").slice(0, 180),
      sessionDate: String(source.sessionDate || "").slice(0, 40),
      startTime: clockTime(source.startTime).slice(0, 20),
      endTime: clockTime(source.endTime).slice(0, 20),
      authorEmail: context.email,
      authorName: assignment?.name || context.name || "",
      authorPhone: assignment?.phone || context.phone || "",
      status: "draft",
      contentJson: JSON.stringify(content),
      mediaLinksJson: "[]",
      revision: 1,
      submittedAt: "",
      approvedAt: "",
      repositoryItemId: "",
      createdAt,
      updatedAt: createdAt,
    })
    doc = await reportByKey(sessionKey) || doc
  }
  return presentWithMedia(doc, source)
}

export async function saveRapporteurReport(context, { sessionKey, content, expectedRevision }) {
  const source = await resolveSessionSource(context.conferenceId, sessionKey)
  assertHallAccess(context.assignments, source.hall)
  const doc = await reportByKey(sessionKey)
  if (!doc) throw new RecRapporteurError("Open the session before saving.", 404, "report_not_found")
  if (!canEditReport(doc.status)) throw new RecRapporteurError("This report has been sent and can no longer be edited.", 409, "report_locked")
  if (Number(doc.revision || 1) !== Number(expectedRevision)) {
    throw new RecRapporteurError("This report was saved somewhere else. Reload it.", 409, "revision_conflict")
  }
  const next = sanitizeReportContent(content)
  const contentJson = JSON.stringify(next)
  if (contentJson.length > 60000) throw new RecRapporteurError("This report is too long to save.", 400, "report_too_long")
  const revision = Number(doc.revision || 1) + 1
  await updateRestDocument(COLLECTIONS.reports, doc.$id, {
    contentJson,
    revision,
    updatedAt: nowIso(),
  })
  return { revision, content: next }
}

async function commentsFor(reportId) {
  const docs = await listAll(COLLECTIONS.comments, [Query.equal("reportId", reportId)])
  return docs
    .map((doc) => ({
      $id: doc.$id,
      authorName: doc.authorName || "",
      authorRole: doc.authorRole || "",
      message: doc.message || "",
      createdAt: doc.createdAt || doc.$createdAt || "",
    }))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
}

export async function listRapporteurComments(context, sessionKey) {
  const source = await resolveSessionSource(context.conferenceId, sessionKey)
  assertHallAccess(context.assignments, source.hall)
  const doc = await reportByKey(sessionKey)
  if (!doc) return { comments: [] }
  return { comments: await commentsFor(doc.$id) }
}

export async function addRapporteurComment(context, { sessionKey, message }) {
  const text = String(message || "").trim()
  if (!text) throw new RecRapporteurError("Write a comment first.", 400, "empty_comment")
  const source = await resolveSessionSource(context.conferenceId, sessionKey)
  assertHallAccess(context.assignments, source.hall)
  const doc = await reportByKey(sessionKey)
  if (!doc || (doc.status !== "submitted" && doc.status !== "returned")) {
    throw new RecRapporteurError("Comments open once the report has been sent.", 409, "comments_closed")
  }
  const assignment = context.assignments.find((item) => hallsMatch(item.hall, source.hall))
  await createRestDocument(COLLECTIONS.comments, {
    reportId: doc.$id,
    authorEmail: context.email,
    authorName: assignment?.name || context.name || context.email,
    authorRole: "rapporteur",
    message: text.slice(0, 4000),
    createdAt: nowIso(),
  })
  return { comments: await commentsFor(doc.$id) }
}

export async function submitRapporteurReport(context, sessionKey) {
  const source = await resolveSessionSource(context.conferenceId, sessionKey)
  assertHallAccess(context.assignments, source.hall)
  const doc = await reportByKey(sessionKey)
  if (!doc) throw new RecRapporteurError("Open the session before sending it.", 404, "report_not_found")
  if (!canSubmitReport(doc.status)) throw new RecRapporteurError("This report has already been sent.", 409, "report_locked")
  const content = parseReportContent(doc.contentJson)
  if (!reportContentReady(content)) {
    throw new RecRapporteurError("Add the purpose of the session before sending.", 400, "purpose_required")
  }
  const mediaLinks = await liveMediaLinks(context.conferenceId, source)
  const submittedAt = nowIso()
  await updateRestDocument(COLLECTIONS.reports, doc.$id, {
    status: "submitted",
    mediaLinksJson: JSON.stringify(mediaLinks),
    submittedAt,
    revision: Number(doc.revision || 1) + 1,
    updatedAt: submittedAt,
  })
  const approver = await findPerson(RAPPORTEUR_APPROVER_NAME)
  const href = reviewUrl(context.conferenceId, doc.$id)
  const heading = doc.title || "A session report"
  const inApp = await notifyInApp({
    userId: approver?.userId,
    reportId: doc.$id,
    href: reviewPath(context.conferenceId, doc.$id),
    message: `${doc.authorName || "A rapporteur"} submitted ${heading}.`,
  })
  const mailed = approver?.email
    ? await notifySafely({
      email: approver.email,
      subject: `REC26 report submitted: ${heading}`,
      text: `${doc.authorName || "A rapporteur"} submitted “${heading}” for your review.\n${href}`,
      html: mailCard({
        heading: "Report submitted",
        body: `${doc.authorName || "A rapporteur"} submitted “${heading}” for your review.`,
        href,
        action: "Open the report",
      }),
    })
    : false
  const notice = noticeFor(approver, RAPPORTEUR_APPROVER_NAME, inApp, mailed)
  return { status: "submitted", ...(notice ? { notice } : {}) }
}

function summary(doc) {
  return {
    $id: doc.$id,
    sessionKey: doc.sessionKey,
    title: doc.title || "",
    hall: doc.hall || "",
    sessionDate: doc.sessionDate || "",
    startTime: clockTime(doc.startTime),
    endTime: clockTime(doc.endTime),
    sortAt: sessionOrderKey({ startTime: doc.startTime, sessionDate: doc.sessionDate }),
    authorName: doc.authorName || "",
    authorEmail: doc.authorEmail || "",
    status: doc.status || "draft",
    submittedAt: doc.submittedAt || "",
    approvedAt: doc.approvedAt || "",
    repositoryItemId: doc.repositoryItemId || "",
    updatedAt: doc.updatedAt || "",
  }
}

async function findArchivePerson() {
  for (const name of ["Nicholas Mukisa", RAPPORTEUR_ARCHIVE_NAME]) {
    const person = await findPerson(name)
    if (person?.email || person?.userId) return person
  }
  return null
}

export async function isRapporteurApprover(email) {
  const approver = await findPerson(RAPPORTEUR_APPROVER_NAME)
  return Boolean(approver?.email) && normalizeEmail(email) === approver.email
}

async function hallSessionRows(conferenceId) {
  const conference = publicConference(await getRestDocument(config.recConferencesCollectionId, conferenceId).catch(() => null))
  const planned = await loadPlannedSessions(conferenceId)
  const extras = await listAll(COLLECTIONS.extras, [Query.equal("conferenceId", conferenceId)])
  const rows = []
  for (const session of planned) {
    const hall = normalizeHall(session.venueHall)
    if (!hall) continue
    rows.push({
      title: session.title || "Untitled session",
      hall,
      sessionDate: sessionDateLabel(session, conference?.startDate),
      startTime: clockTime(session.startTime),
      endTime: clockTime(session.toTime),
      sortAt: sessionOrderKey({
        startTime: session.startTime,
        day: session.day,
        conferenceStart: conference?.startDate,
      }),
      unplanned: false,
    })
  }
  for (const extra of extras) {
    rows.push({
      title: extra.title || "Untitled session",
      hall: normalizeHall(extra.hall),
      sessionDate: extra.date || "",
      startTime: clockTime(extra.startTime),
      endTime: clockTime(extra.endTime),
      sortAt: sessionOrderKey({ startTime: extra.startTime, sessionDate: extra.date }),
      unplanned: true,
    })
  }
  rows.sort((a, b) => a.hall.localeCompare(b.hall) || (a.sortAt - b.sortAt) || a.title.localeCompare(b.title))
  return rows
}

export async function loadRapporteurWorkspace(conferenceId, { canAssign = false, reviewerEmail = "" } = {}) {
  if (!conferenceId) throw new RecRapporteurError("Choose a conference.", 400, "missing_conference")
  const reports = await listAll(COLLECTIONS.reports, [Query.equal("conferenceId", conferenceId)])
  const visible = reports.filter((doc) => doc.status !== "draft")
  const assignments = canAssign
    ? await listAll(COLLECTIONS.assignments, [Query.equal("conferenceId", conferenceId)])
    : []
  const [approver, archive] = await Promise.all([
    findPerson(RAPPORTEUR_APPROVER_NAME),
    findArchivePerson(),
  ])
  if (!canAssign && normalizeEmail(reviewerEmail) !== approver?.email) {
    throw new RecRapporteurError("You do not have access to rapporteur reports.", 403, "review_forbidden")
  }
  return {
    canAssign,
    halls: RAPPORTEUR_HALLS,
    approver: approver ? { name: approver.name, email: approver.email } : null,
    archive: archive ? { name: archive.name, email: archive.email } : null,
    assignments: assignments.map((item) => ({
      $id: item.$id,
      name: item.name || "",
      email: item.email || "",
      phone: item.phone || "",
      organization: item.organization || "",
      hall: item.hall || "",
      status: item.status || "active",
      accessStartsAt: item.accessStartsAt || "",
      accessEndsAt: item.accessEndsAt || "",
    })),
    sessions: canAssign ? await hallSessionRows(conferenceId).catch(() => []) : [],
    reports: visible.map(summary).sort((a, b) => String(b.submittedAt || b.updatedAt).localeCompare(String(a.submittedAt || a.updatedAt))),
  }
}

async function reportForReview(reportId, actor) {
  const doc = await getRestDocument(COLLECTIONS.reports, reportId).catch(() => null)
  if (!doc) throw new RecRapporteurError("That report was not found.", 404, "report_not_found")
  if (doc.status === "draft") throw new RecRapporteurError("This report has not been submitted.", 403, "draft_hidden")
  if (!actor.canAssign) {
    const approver = await findPerson(RAPPORTEUR_APPROVER_NAME)
    if (normalizeEmail(actor.email) !== approver?.email) {
      throw new RecRapporteurError("You do not have access to rapporteur reports.", 403, "review_forbidden")
    }
  }
  return doc
}

export async function openReportForReview(reportId, actor) {
  const doc = await reportForReview(reportId, actor)
  const source = await resolveSessionSource(doc.conferenceId, doc.sessionKey).catch(() => ({ speakers: "", preamble: "", mediaText: doc.mediaLinksJson }))
  const report = await presentWithMedia(doc, source)
  return { report, comments: await commentsFor(doc.$id) }
}

async function addReviewComment(doc, actor, message) {
  const text = String(message || "").trim()
  if (!text) throw new RecRapporteurError("Write a comment first.", 400, "empty_comment")
  await createRestDocument(COLLECTIONS.comments, {
    reportId: doc.$id,
    authorEmail: normalizeEmail(actor.email),
    authorName: actor.name || RAPPORTEUR_APPROVER_NAME,
    authorRole: "approver",
    message: text.slice(0, 4000),
    createdAt: nowIso(),
  })
}

export async function commentOnReport(reportId, actor, message) {
  const doc = await reportForReview(reportId, actor)
  if (doc.status !== "submitted" && doc.status !== "returned") {
    throw new RecRapporteurError("Comments stay open while the report is with the approver.", 409, "comments_closed")
  }
  await addReviewComment(doc, actor, message)
  return { comments: await commentsFor(doc.$id) }
}

export async function returnRapporteurReport(reportId, actor, message) {
  const doc = await reportForReview(reportId, actor)
  if (!canReviewReport(doc.status)) throw new RecRapporteurError("Only a submitted report can be returned.", 409, "report_not_submitted")
  await addReviewComment(doc, actor, message)
  const updatedAt = nowIso()
  await updateRestDocument(COLLECTIONS.reports, doc.$id, {
    status: "returned",
    revision: Number(doc.revision || 1) + 1,
    updatedAt,
  })
  const href = reportingUrl()
  const mailed = await notifySafely({
    email: doc.authorEmail,
    subject: `REC26 report returned: ${doc.title || "session"}`,
    text: `${actor.name || RAPPORTEUR_APPROVER_NAME} returned “${doc.title || "your report"}”.\n\n${String(message || "").trim()}\n\n${href}`,
    html: mailCard({
      heading: "Report returned",
      body: `${actor.name || RAPPORTEUR_APPROVER_NAME} returned “${doc.title || "your report"}”. ${String(message || "").trim()}`,
      href,
      action: "Open the report",
    }),
  })
  return { status: "returned", ...(mailed ? {} : { notice: "The report was returned. The rapporteur email could not be sent." }) }
}

async function fileApprovedReport(doc) {
  const bucketId = process.env.NEXT_PUBLIC_ENGAGE_ATTACHMENTS_BUCKET_ID || ""
  const repositoryId = process.env.NEXT_PUBLIC_ENGAGE_KNOWLEDGE_REPOSITORY_COLLECTION_ID || ""
  if (!bucketId || !repositoryId) {
    throw new RecRapporteurError("The Engagement repository is not configured on this server.", 500, "repository_unconfigured")
  }
  const conference = publicConference(await getRestDocument(config.recConferencesCollectionId, doc.conferenceId).catch(() => null))
  const source = await resolveSessionSource(doc.conferenceId, doc.sessionKey).catch(() => null)
  const day = rapporteurFolderDay({
    day: source?.day,
    sessionDate: source?.sessionDate || doc.sessionDate,
    conferenceStart: conference?.startDate,
  })
  if (!day) {
    throw new RecRapporteurError(
      "This report could not be placed in Day 1, 2, 3, or 4. Check the session date, then approve it again.",
      409,
      "report_day_unknown"
    )
  }
  const clusterKey = rapporteurDayClusterKey(day)
  const report = presentReport(doc, parseMediaLinks(doc.mediaLinksJson))
  const html = renderReportHtml(report)
  const fileName = reportFileName(doc.title)
  const file = new File([html], fileName, { type: "application/msword" })
  const stored = await createRestFile(bucketId, file, { permissions: ['read("users")'] })
  const tags = [
    clusterKey,
    RAPPORTEUR_FOLDER_KEY,
    day ? `day:${day}` : "",
    "uploaded",
    `file:${stored.$id}`,
    `bucket:${bucketId}`,
    `name:${fileName}`,
    `size:${file.size}`,
  ].filter(Boolean)
  const data = {
    reportId: `upload:${stored.$id}`,
    title: `${doc.title || "REC26 session"} rapporteur report`,
    category: "field_activity",
    year: 2026,
    tagsJson: JSON.stringify(tags),
    publishStatus: "published",
    downloadCount: 0,
    publishedAt: nowIso(),
  }
  const archive = await findArchivePerson()
  if (archive?.userId) data.publishedBy = archive.userId
  const item = await createRestDocument(repositoryId, data)
  const folder = day ? `${RAPPORTEUR_FOLDER_LABEL} / Day ${day}` : RAPPORTEUR_FOLDER_LABEL
  return { itemId: item.$id, folder, day }
}

export async function approveRapporteurReport(reportId, actor) {
  const doc = await reportForReview(reportId, actor)
  if (!canReviewReport(doc.status)) throw new RecRapporteurError("Only a submitted report can be approved.", 409, "report_not_submitted")
  if (normalizeEmail(actor.email) && normalizeEmail(actor.email) === normalizeEmail(doc.authorEmail)) {
    throw new RecRapporteurError("A rapporteur cannot approve their own report.", 403, "self_approval")
  }
  const filed = await fileApprovedReport(doc)
  const approvedAt = nowIso()
  await updateRestDocument(COLLECTIONS.reports, doc.$id, {
    status: "approved",
    approvedAt,
    repositoryItemId: filed.itemId,
    revision: Number(doc.revision || 1) + 1,
    updatedAt: approvedAt,
  })
  const heading = doc.title || "A session report"
  const author = await findUserByEmail(doc.authorEmail)
  const authorMailed = doc.authorEmail
    ? await notifySafely({
      email: doc.authorEmail,
      subject: `REC26 report approved: ${doc.title || "session"}`,
      text: `Your report “${heading}” was approved.\n${reportingUrl()}`,
      html: mailCard({
        heading: "Report approved",
        body: `Your report “${heading}” was approved.`,
        href: reportingUrl(),
        action: "Open your reports",
      }),
    })
    : false
  if (author?.userId) {
    await notifyInApp({
      userId: author.userId,
      reportId: doc.$id,
      href: "/reporting",
      kind: "filed",
      message: `Your report “${heading}” was approved.`,
    })
  }
  const folderHref = `${String(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://hr.nrep.ug").replace(/\/$/, "")}${RAPPORTEUR_REPOSITORY_PATH}`
  const folderMessage = `${heading} was approved and filed in ${filed.folder}.`
  const archive = await findArchivePerson()
  const approver = await findPerson(RAPPORTEUR_APPROVER_NAME)
  const seen = new Set()
  const notices = []
  if (doc.authorEmail && !authorMailed) notices.push("The rapporteur email could not be sent.")
  for (const person of [approver, archive]) {
    if (!person) continue
    const key = normalizeEmail(person.email) || person.userId
    if (!key || seen.has(key)) continue
    seen.add(key)
    const inApp = await notifyInApp({
      userId: person.userId,
      reportId: filed.itemId,
      href: RAPPORTEUR_REPOSITORY_PATH,
      kind: "filed",
      message: folderMessage,
    })
    const mailed = person.email
      ? await notifySafely({
        email: person.email,
        subject: `REC26 report approved: ${doc.title || "session"}`,
        text: `${folderMessage}\n${folderHref}`,
        html: mailCard({
          heading: "Report filed",
          body: folderMessage,
          href: folderHref,
          action: "Open the report folder",
        }),
      })
      : false
    const label = approver && key === (normalizeEmail(approver.email) || approver.userId) ? "The approver" : "The archive"
    const note = noticeFor(person, label, inApp, mailed)
    if (note) notices.push(note)
  }
  return {
    status: "approved",
    repositoryItemId: filed.itemId,
    repositoryPath: RAPPORTEUR_REPOSITORY_PATH,
    ...(notices.length ? { notice: notices.join(" ") } : {}),
  }
}

function assignmentInput(input) {
  const hall = normalizeHall(input.hall)
  const email = normalizeEmail(input.email)
  const name = String(input.name || "").trim().slice(0, 120)
  if (!email.includes("@") || !name || !RAPPORTEUR_HALLS.includes(hall)) {
    throw new RecRapporteurError("Name, email, and hall are required.", 400, "invalid_assignment")
  }
  return {
    email,
    name,
    phone: String(input.phone || "").trim().slice(0, 40),
    organization: String(input.organization || "").trim().slice(0, 160),
    hall,
    status: input.status === "inactive" ? "inactive" : "active",
    accessStartsAt: String(input.accessStartsAt || "").trim().slice(0, 40),
    accessEndsAt: String(input.accessEndsAt || "").trim().slice(0, 40),
  }
}

function presentAssignment(doc) {
  return {
    $id: doc.$id,
    name: doc.name || "",
    email: doc.email || "",
    phone: doc.phone || "",
    organization: doc.organization || "",
    hall: doc.hall || "",
    status: doc.status || "active",
    accessStartsAt: doc.accessStartsAt || "",
    accessEndsAt: doc.accessEndsAt || "",
  }
}

export async function createRapporteurAssignment(input, actor) {
  const conferenceId = String(input.conferenceId || "").trim()
  const fields = assignmentInput(input)
  if (!conferenceId) throw new RecRapporteurError("Choose a conference.", 400, "invalid_assignment")
  const conference = await getRestDocument(config.recConferencesCollectionId, conferenceId).catch(() => null)
  if (!conference) throw new RecRapporteurError("Choose a conference.", 404, "conference_not_found")
  const existing = await activeAssignments(fields.email, conferenceId)
  if (fields.status === "active" && existing.some((item) => hallsMatch(item.hall, fields.hall))) {
    throw new RecRapporteurError("This person is already assigned to that hall.", 409, "already_assigned")
  }
  const createdAt = nowIso()
  const doc = await createRestDocument(COLLECTIONS.assignments, {
    conferenceId,
    ...fields,
    createdBy: actor?.userId || "",
    createdAt,
    updatedAt: createdAt,
  })
  const assignment = presentAssignment({ ...fields, $id: doc.$id })
  if (fields.status !== "active") return { assignment, notice: "Rapporteur added." }
  try {
    await emailAssignmentAccess({
      email: fields.email,
      name: fields.name,
      conferenceId,
      hall: fields.hall,
      conference: publicConference(conference),
    })
    return { assignment, notice: "Rapporteur added. Access email sent." }
  } catch (error) {
    console.error("Rapporteur access email was not sent", error?.message || error)
    return { assignment, notice: "Rapporteur added, but the access email could not be sent." }
  }
}

export async function updateRapporteurAssignment(assignmentId, input) {
  const existing = await getRestDocument(COLLECTIONS.assignments, assignmentId).catch(() => null)
  if (!existing) throw new RecRapporteurError("That rapporteur was not found.", 404, "assignment_not_found")
  const fields = assignmentInput({ ...existing, ...input })
  const others = await activeAssignments(fields.email, existing.conferenceId)
  if (fields.status === "active" && others.some((item) => item.$id !== existing.$id && hallsMatch(item.hall, fields.hall))) {
    throw new RecRapporteurError("This person is already assigned to that hall.", 409, "already_assigned")
  }
  await updateRestDocument(COLLECTIONS.assignments, existing.$id, {
    ...fields,
    updatedAt: nowIso(),
  })
  const assignment = presentAssignment({ ...existing, ...fields })
  const becameActive = existing.status !== "active" && fields.status === "active"
  const emailChanged = normalizeEmail(existing.email) !== fields.email
  if (fields.status !== "active" || (!becameActive && !emailChanged)) {
    return { assignment, notice: "Rapporteur updated." }
  }
  try {
    const conference = publicConference(await getRestDocument(config.recConferencesCollectionId, existing.conferenceId))
    await emailAssignmentAccess({
      email: fields.email,
      name: fields.name,
      conferenceId: existing.conferenceId,
      hall: fields.hall,
      conference,
    })
    return { assignment, notice: "Rapporteur updated. Access email sent." }
  } catch (error) {
    console.error("Rapporteur access email was not sent", error?.message || error)
    return { assignment, notice: "Rapporteur updated, but the access email could not be sent." }
  }
}

export async function deleteRapporteurAssignment(assignmentId) {
  const existing = await getRestDocument(COLLECTIONS.assignments, assignmentId).catch(() => null)
  if (!existing) throw new RecRapporteurError("That rapporteur was not found.", 404, "assignment_not_found")
  await deleteRestDocument(COLLECTIONS.assignments, existing.$id)
  const remaining = await listAll(COLLECTIONS.assignments, [
    Query.equal("conferenceId", existing.conferenceId),
    Query.equal("email", normalizeEmail(existing.email)),
  ])
  if (remaining.length) return { success: true }
  const sessions = await listAll(COLLECTIONS.sessions, [
    Query.equal("conferenceId", existing.conferenceId),
    Query.equal("email", normalizeEmail(existing.email)),
  ])
  await Promise.all(sessions.filter((session) => !session.revokedAt).map((session) => (
    updateRestDocument(COLLECTIONS.sessions, session.$id, { revokedAt: nowIso() })
  )))
  return { success: true }
}

export async function createUnplannedSession(input) {
  const conferenceId = String(input.conferenceId || "").trim()
  const hall = normalizeHall(input.hall)
  const title = String(input.title || "").trim()
  if (!conferenceId || !title || !RAPPORTEUR_HALLS.includes(hall)) {
    throw new RecRapporteurError("A session title and hall are required.", 400, "invalid_session")
  }
  const links = mediaLinksFromText(input.mediaLinks)
  const doc = await createRestDocument(COLLECTIONS.extras, {
    conferenceId,
    hall,
    title: title.slice(0, 180),
    date: String(input.date || "").trim().slice(0, 40),
    startTime: String(input.startTime || "").trim().slice(0, 20),
    endTime: String(input.endTime || "").trim().slice(0, 20),
    mediaLinksJson: JSON.stringify(links),
    createdAt: nowIso(),
  })
  return { $id: doc.$id, title: title.slice(0, 180), hall }
}
