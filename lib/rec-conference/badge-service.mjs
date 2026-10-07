import crypto from "node:crypto"
import { Query } from "node-appwrite"
import { badgeCollections } from "./badges-schema.mjs"

export class RecBadgeError extends Error {
  constructor(message, status = 400, code = "badge_error") {
    super(message)
    this.status = status
    this.code = code
  }
}

export const badgeId = (...parts) => `b_${crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32)}`
export const normalizeBadgeNumber = (value) => String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase()
export const formatBadgeNumber = (value) => normalizeBadgeNumber(value).replace(/^REC(\d{4})([A-Z0-9]{6})$/, "REC-$1-$2")
export const badgeName = (r) => [r.title, r.firstName, r.otherName, r.lastName].filter(Boolean).join(" ") || r.email || "Registrant"
export const badgeEligible = (r, c) => r?.conferenceEligible ?? (Array.isArray(r?.conferenceYears) && r.conferenceYears.map(Number).includes(Number(c.year)))
export function badgeRegistrationProjection(conference, registration) {
  return {
    conferenceId: conference.$id, registrationId: registration.$id,
    name: badgeName(registration).slice(0, 500), email: registration.email || "",
    organization: registration.organization || "", eligible: badgeEligible(registration, conference),
    registrationTypes: registration.registrationTypes || [registration.registrationType].filter(Boolean),
    daysAttending: registration.daysAttending || [], sector: registration.sector || [],
    sponsorOrganization: registration.sponsorOrganization || "", visaLetterRequired: registration.visaLetterRequired === true,
    validUntil: badgeValidUntil(conference),
    searchText: [badgeName(registration), registration.email, registration.organization].filter(Boolean).join(" ").slice(0, 1500)
  }
}
const parseDays = (value) => { try { return Array.isArray(value) ? value : JSON.parse(value || "[]") } catch { return [] } }
export function badgeValidUntil(conference) {
  const dates = [conference.endDate, ...parseDays(conference.days).map((day) => day.date)]
    .filter(Boolean).map((date) => String(date).slice(0, 10)).sort()
  if (!dates.length || !/^\d{4}-\d{2}-\d{2}$/.test(dates.at(-1))) {
    throw new RecBadgeError("Configure the conference end date before issuing badges.")
  }
  return new Date(`${dates.at(-1)}T23:59:59.999+03:00`).toISOString()
}
export function badgeStatus(row, now = Date.now()) {
  if (!row?.eligible) return "ineligible"
  if (row.status === "active" && Date.parse(row.validUntil) < now) return "expired"
  return row.status
}
export function badgeActionError(action, row, reason = "", now = Date.now()) {
  const status = badgeStatus(row, now)
  if (!row?.eligible && action !== "revoke") return "The registration is no longer linked to this conference."
  if (["generate", "replace", "restore", "resend"].includes(action) && Date.parse(row.validUntil) < now) return "This conference has ended; badges can no longer be issued or emailed."
  if (action === "generate" && status !== "not_issued") return status === "revoked" ? "This badge was revoked. Use Restore explicitly." : "A badge already exists. Use View, Resend or Replace."
  if (["replace", "resend"].includes(action) && status !== "active") return "This action requires an active badge."
  if (action === "restore" && status !== "revoked") return "Only a revoked badge can be restored."
  if (action === "revoke" && !["active", "expired", "revoked", "ineligible"].includes(status)) return "There is no badge to revoke."
  if (["replace", "restore", "revoke"].includes(action) && !String(reason).trim()) return "Provide a reason for this change."
  if (!["generate", "replace", "restore", "revoke", "resend"].includes(action)) return "Unknown badge action."
  return ""
}
export function extractBadgeToken(value) {
  const text = String(value || "").trim()
  if (text.startsWith("rec:v1:")) return text.slice(7)
  if (/^https?:\/\//.test(text)) {
    try { return decodeURIComponent(new URL(text).pathname.match(/^\/badge\/([^/]+)\/?$/)?.[1] || "") } catch { return "" }
  }
  return text
}
export function badgeCrypto(secret) {
  if (!secret) throw new Error("Configure REC_SCANNER_TOKEN_SECRET before using badges.")
  const key = crypto.createHash("sha256").update(`rec-badge-encryption:${secret}`).digest()
  return {
    hash: (value) => crypto.createHmac("sha256", secret).update(String(value)).digest("hex"),
    encrypt(value) {
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
      const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
      return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".")
    },
    decrypt(value) {
      const [version, iv, tag, body] = String(value || "").split(".")
      if (version !== "v1" || !iv || !tag || !body) throw new RecBadgeError("The saved badge cannot be recovered. Replace it explicitly.", 409, "badge_unrecoverable")
      const cipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
      cipher.setAuthTag(Buffer.from(tag, "base64url"))
      return Buffer.concat([cipher.update(Buffer.from(body, "base64url")), cipher.final()]).toString("utf8")
    },
  }
}
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]))

// All badge lifecycle mutations, projections, jobs and notification decisions live here.
export function createBadgeService({ store, config, secret, sendEmail, qrCode, now = () => new Date(), collections = badgeCollections(), getRegistrationAccess = async r => r, getRegistrationsAccess, getAppEmailBlock = async () => ({ html: "", text: "" }) }) {
  const { hash, encrypt, decrypt } = badgeCrypto(secret)
  const iso = () => now().toISOString()
  const get = async (collection, id) => {
    try { return await store.get(collection, id) } catch (error) { if (error.status === 404) return null; throw error }
  }
  const all = async (collection, queries = []) => {
    const rows = []
    let cursor
    do {
      const result = await store.list(collection, [...queries, Query.orderAsc("$id"), Query.limit(100), ...(cursor ? [Query.cursorAfter(cursor)] : [])])
      if (!result.documents.length) break
      rows.push(...result.documents)
      cursor = result.documents.at(-1).$id
      if (result.documents.length < 100) break
    } while (true)
    return rows
  }
  async function withLock(scope, operation) {
    const id = badgeId("lock", scope)
    const owner = crypto.randomUUID()
    try { await store.create(collections.locks, id, { scope, owner, createdAt: iso() }) }
    catch (error) { if (error.status === 409) throw new RecBadgeError("Another operation is processing this badge. Retry shortly. If it persists, an administrator must recover the interrupted operation.", 409, "badge_busy"); throw error }
    try { return await operation() }
    finally { await store.remove(collections.locks, id) }
  }
  const context = async (conferenceId, registrationId) => {
    if (!conferenceId || !registrationId) throw new RecBadgeError("Conference and registration are required.")
    const conference = await get(config.recConferencesCollectionId, conferenceId)
    const registration = await get(config.recRegistrationsCollectionId, registrationId)
    if (!conference || !registration) throw new RecBadgeError("Conference or registration was not found.", 404)
    return { conference, registration: await getRegistrationAccess(registration, conference) }
  }
  function projection(conference, registration) {
    return badgeRegistrationProjection(conference, registration)
  }
  async function ensureRegistry(conference, registration) {
    const id = badgeId(conference.$id, registration.$id)
    const existing = await get(collections.registry, id)
    if (existing) return existing
    try { return await store.create(collections.registry, id, { ...projection(conference, registration), status: "not_issued", version: 0, emailStatus: "not_requested" }) }
    catch (error) { if (error.status === 409) return get(collections.registry, id); throw error }
  }
  async function syncRegistration(registration) {
    const conferences = await all(config.recConferencesCollectionId)
    for (const conference of conferences) {
      const id = badgeId(conference.$id, registration.$id)
      const effective = await getRegistrationAccess(registration, conference)
      if (badgeEligible(effective, conference)) {
        await ensureRegistry(conference, effective)
        await store.update(collections.registry, id, projection(conference, effective))
      } else if (await get(collections.registry, id)) {
        await store.update(collections.registry, id, { eligible: false })
      }
      const counts = {}
      for (const type of ["Attendee", "Exhibitor", "Sponsor"]) counts[type.toLowerCase()] = (await store.list(collections.registry, [Query.equal("conferenceId", conference.$id), Query.equal("eligible", true), Query.contains("registrationTypes", [type]), Query.limit(1)])).total
      await store.update(config.recConferencesCollectionId, conference.$id, { currentCounts: JSON.stringify(counts) })
    }
  }
  function tokenDto(token) {
    if (!token) return null
    return { $id: token.$id, tokenVersion: token.tokenVersion, badgeNumber: token.badgeNumber,
      badgeNumberLabel: formatBadgeNumber(token.badgeNumber), issuedAt: token.issuedAt,
      revokedAt: token.revokedAt || "", revokedReason: token.revokedReason || "",
      lastUsedAt: token.lastUsedAt || "", isActive: token.isActive && !token.revokedAt }
  }
  function registrationDto(r) {
    return { $id: r.$id, name: badgeName(r), email: r.email, organization: r.organization,
      sponsorOrganization: r.sponsorOrganization || "", registrationType: r.registrationType, registrationTypes: r.registrationTypes || [r.registrationType], exhibitorCompanies: r.exhibitorCompanies || [],
      daysAttending: r.daysAttending || [], country: r.country || "" }
  }
  function conferenceDto(c) {
    return { $id: c.$id, title: c.title, shortName: c.shortName, year: c.year, startDate: c.startDate,
      endDate: c.endDate, venue: c.venue, location: c.location, theme: c.theme || "", days: parseDays(c.days) }
  }
  async function present(row, conference, registration, { publicOnly = false, raw } = {}) {
    const token = row.tokenId ? await get(config.recBadgeTokensCollectionId, row.tokenId) : null
    const status = badgeStatus({ ...row, eligible: badgeEligible(registration, conference), validUntil: badgeValidUntil(conference) }, now().getTime())
    const result = { badge: tokenDto(token), status, conference: conferenceDto(conference), registration: registrationDto(registration), validUntil: badgeValidUntil(conference), emailStatus: row.emailStatus || "not_requested", emailAt: row.emailAt || "" }
    if (publicOnly) {
      result.badge = { badgeNumber: token.badgeNumber, badgeNumberLabel: formatBadgeNumber(token.badgeNumber), issuedAt: token.issuedAt, isActive: true }
      delete result.emailStatus
      delete result.emailAt
      delete result.registration.$id
    }
    if (token && status === "active") {
      const rawToken = raw || decrypt(token.encryptedToken)
      result.qrPayload = `rec:v1:${rawToken}`
      result.badgeUrl = `${String(config.recPublicSiteUrl || "https://rec.nrep.ug").replace(/\/+$/, "")}/badge/${encodeURIComponent(rawToken)}`
      result.qrDataUrl = await qrCode(result.qrPayload)
    }
    return result
  }
  async function resolve(value, { manual = false } = {}) {
    const raw = extractBadgeToken(value)
    const longSecret = /^[A-Za-z0-9_-]{43}$/.test(raw)
    const number = normalizeBadgeNumber(raw)
    if (!longSecret && !(manual && /^REC\d{4}[A-Z0-9]{6}$/.test(number))) return null
    const result = await store.list(config.recBadgeTokensCollectionId, [Query.equal(longSecret ? "tokenHash" : "badgeNumber", longSecret ? hash(raw) : number), Query.limit(1)])
    const token = result.documents[0]
    if (!token || token.revokedAt || !token.isActive) return null
    const row = await get(collections.registry, badgeId(token.conferenceId, token.registrationId))
    if (!row || row.tokenId !== token.$id || badgeStatus(row, now().getTime()) !== "active") return null
    return token
  }
  async function publicBadge(value) {
    const token = await resolve(value)
    if (!token) throw new RecBadgeError("This badge link is invalid, expired or revoked.", 404, "invalid_badge")
    const { conference, registration } = await context(token.conferenceId, token.registrationId)
    if (!badgeEligible(registration, conference) || Date.parse(badgeValidUntil(conference)) < now().getTime()) throw new RecBadgeError("This badge is no longer valid for this conference.", 404, "invalid_badge")
    const row = await get(collections.registry, badgeId(token.conferenceId, token.registrationId))
    return present(row, conference, registration, { publicOnly: true, raw: extractBadgeToken(value) })
  }
  async function detail(conferenceId, registrationId, { page = 1, limit = 10 } = {}) {
    const { conference, registration } = await context(conferenceId, registrationId)
    const row = await get(collections.registry, badgeId(conferenceId, registrationId))
    if (!row) return { status: "not_issued", badge: null, registration: registrationDto(registration), conference: conferenceDto(conference), history: { documents: [], total: 0, page: 1, totalPages: 1 } }
    const history = await paginated(collections.history, [Query.equal("registryId", row.$id), Query.orderDesc("occurredAt")], page, limit)
    const scans = await paginated(config.recScansCollectionId, [Query.equal("conferenceId", conferenceId), Query.equal("registrationId", registrationId), Query.orderDesc("scannedAt")], page, limit)
    const actorIds = [...new Set(history.documents.map((entry) => entry.actorId).filter((id) => id && id !== "migration"))]
    if (config.usersCollectionId && actorIds.length) {
      const staff = await store.list(config.usersCollectionId, [Query.equal("userId", actorIds), Query.limit(100)])
      const names = new Map(staff.documents.map((person) => [person.userId, person.name || [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email]))
      history.documents = history.documents.map((entry) => ({ ...entry, actorName: names.get(entry.actorId) || (entry.actorId === "migration" ? "Legacy migration" : "Former administrator") }))
    }
    const eventIds = [...new Set(scans.documents.map((scan) => scan.eventId).filter(Boolean))]
    if (config.recScanEventsCollectionId && eventIds.length) {
      const events = await store.list(config.recScanEventsCollectionId, [Query.equal("$id", eventIds), Query.limit(100)])
      const names = new Map(events.documents.map((event) => [event.$id, event.name]))
      scans.documents = scans.documents.map((scan) => ({ ...scan, eventName: names.get(scan.eventId) || "Removed event" }))
    }
    return { ...await present(row, conference, registration), history, scans }
  }
  async function exportBadge(conferenceId, registrationId, expected = {}) {
    const { conference, registration } = await context(conferenceId, registrationId)
    const row = await get(collections.registry, badgeId(conferenceId, registrationId))
    const token = row?.tokenId ? await get(config.recBadgeTokensCollectionId, row.tokenId) : null
    if (!row || !token || !token.isActive || token.revokedAt || token.conferenceId !== conferenceId || token.registrationId !== registrationId ||
        badgeStatus({ ...row, eligible: badgeEligible(registration, conference), validUntil: badgeValidUntil(conference) }, now().getTime()) !== "active")
      throw new RecBadgeError("This badge is inactive, expired, revoked or no longer eligible.", 409, "badge_not_exportable")
    if ((expected.tokenId && token.$id !== expected.tokenId) || (expected.tokenVersion != null && token.tokenVersion !== expected.tokenVersion))
      throw new RecBadgeError("This badge was replaced after the export was requested. Start a new export.", 409, "badge_replaced")
    return present(row, conference, registration)
  }
  async function validExportItems(conferenceId, items) {
    const conference = await store.get(config.recConferencesCollectionId, conferenceId), valid = new Set()
    for (let offset=0; offset<items.length; offset+=100) {
      const chunk=items.slice(offset,offset+100), ids=chunk.map(i=>i.registrationId)
      const rows=(await store.list(collections.registry,[Query.equal("conferenceId",conferenceId),Query.equal("registrationId",ids),Query.limit(100)])).documents
      const registrations=(await store.list(config.recRegistrationsCollectionId,[Query.equal("$id",ids),Query.limit(100)])).documents
      const effective=getRegistrationsAccess ? await getRegistrationsAccess(registrations,conference) : []
      if(!getRegistrationsAccess) for(const r of registrations) effective.push(await getRegistrationAccess(r,conference))
      const tokenIds=rows.map(r=>r.tokenId).filter(Boolean)
      const tokens=tokenIds.length ? (await store.list(config.recBadgeTokensCollectionId,[Query.equal("$id",tokenIds),Query.limit(100)])).documents : []
      for(const item of chunk) {
        const row=rows.find(r=>r.registrationId===item.registrationId), registration=effective.find(r=>r.$id===item.registrationId), token=tokens.find(t=>t.$id===row?.tokenId)
        if(row && registration && token?.isActive && !token.revokedAt && token.$id===item.tokenId && token.tokenVersion===item.tokenVersion && token.registrationId===item.registrationId && token.conferenceId===conferenceId && badgeStatus({...row,eligible:badgeEligible(registration,conference),validUntil:badgeValidUntil(conference)},+now())==="active") valid.add(item.$id)
      }
    }
    return valid
  }
  async function paginated(collection, queries, page, limit = 25) {
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25))
    let safePage = Math.max(1, Number.parseInt(page, 10) || 1)
    let result = await store.list(collection, [...queries, Query.limit(safeLimit), Query.offset((safePage - 1) * safeLimit)])
    const totalPages = Math.max(1, Math.ceil(result.total / safeLimit))
    if (safePage > totalPages) { safePage = totalPages; result = await store.list(collection, [...queries, Query.limit(safeLimit), Query.offset((safePage - 1) * safeLimit)]) }
    return { ...result, page: safePage, limit: safeLimit, totalPages }
  }
  function registryQueries({ conferenceId, status = "all", search = "" }) {
    const queries = [Query.equal("conferenceId", conferenceId), Query.equal("eligible", true)]
    const mapped = ({ without_badge: "not_issued", with_badge: "active" })[status] || status
    if (mapped === "expired") queries.push(Query.equal("status", "active"), Query.lessThan("validUntil", iso()))
    else if (mapped !== "all") {
      if (!["active", "revoked", "not_issued"].includes(mapped)) throw new RecBadgeError("Unknown badge status.")
      queries.push(Query.equal("status", mapped))
      if (mapped === "active") queries.push(Query.greaterThanEqual("validUntil", iso()))
    }
    if (String(search).trim()) {
      const term = String(search).trim().slice(0, 150)
      queries.push(/^REC[-\dA-Z]+$/i.test(term) ? Query.equal("badgeNumber", normalizeBadgeNumber(term)) : Query.search("searchText", term))
    }
    return queries
  }
  async function list(input) {
    if (!input.conferenceId) throw new RecBadgeError("Select a conference.")
    const page = await paginated(collections.registry, [...registryQueries(input), ...(input.registrationType ? [Query.contains("registrationTypes", [input.registrationType])] : []), Query.orderAsc("name")], input.page, input.limit)
    const conference = await store.get(config.recConferencesCollectionId, input.conferenceId)
    const registrationIds = page.documents.map((row) => row.registrationId)
    const tokenIds = page.documents.map((row) => row.tokenId).filter(Boolean)
    const registrations = registrationIds.length ? await store.list(config.recRegistrationsCollectionId, [Query.equal("$id", registrationIds), Query.limit(100)]) : { documents: [] }
    const tokens = tokenIds.length ? await store.list(config.recBadgeTokensCollectionId, [Query.equal("$id", tokenIds), Query.limit(100)]) : { documents: [] }
    const effectiveRows = getRegistrationsAccess ? await getRegistrationsAccess(registrations.documents, conference) : []
    if (!getRegistrationsAccess) for (const r of registrations.documents) effectiveRows.push(await getRegistrationAccess(r, conference))
    const byRegistration = new Map(effectiveRows.map((r) => [r.$id, r]))
    const byToken = new Map(tokens.documents.map((t) => [t.$id, t]))
    const documents = []
    for (const row of page.documents) {
      const r = byRegistration.get(row.registrationId)
      if (!r) continue
      const t = byToken.get(row.tokenId)
      documents.push({ registration: registrationDto(r), badge: tokenDto(t), status: badgeStatus({ ...row, eligible: badgeEligible(r, conference) }, now().getTime()), emailStatus: row.emailStatus || "not_requested", emailAt: row.emailAt || "", validUntil: row.validUntil })
    }
    const counts = {}
    for (const [key, status] of Object.entries({ total: "all", withBadge: "active", withoutBadge: "not_issued", revoked: "revoked", expired: "expired" })) {
      counts[key] = (await store.list(collections.registry, [...registryQueries({ conferenceId: input.conferenceId, status }), Query.limit(1), Query.select(["$id"])] )).total
    }
    return { ...page, documents, counts }
  }
  async function notify({ row, conference, registration, actorId, action, operationId }) {
    const id = badgeId("email", operationId)
    const existing = await get(collections.history, id)
    if (existing) {
      const status = existing.status === "sending" ? "uncertain" : existing.status
      if (existing.status === "sending") await store.update(collections.history, id, { status, error: "The send acknowledgement was interrupted. Use an explicit resend after checking delivery." })
      await store.update(collections.registry, row.$id, { emailStatus: status, emailAt: existing.occurredAt })
      return status
    }
    const revoked = action === "revoke"
    const badge = revoked ? null : await present(row, conference, registration)
    const heading = revoked ? "Your conference badge has been revoked" : "Your conference badge is ready"
    const message = revoked ? "Your badge is no longer valid. Please contact the conference team if you need assistance." : "Open your digital badge and show it at the conference scan points. Keep this link private."
    const link = badge?.badgeUrl || ""
    const number = badge?.badge?.badgeNumberLabel || ""
    const appBlock = await getAppEmailBlock(conference.$id, "badge")
    const text = `${heading}\n\nHello ${badgeName(registration)},\n\n${conference.title}\n${message}\n${number ? `\nBadge number: ${number}` : ""}\n${link}\n\nAttendance days: ${(registration.daysAttending || []).join(", ")}`
    const html = `<div style="background:#f4f7f9;padding:24px;font-family:Arial,sans-serif;color:#182b35"><div style="max-width:600px;margin:auto;background:white;border:1px solid #dce4e8"><div style="background:#176F91;color:white;border-bottom:5px solid #EFA74F;padding:24px"><h2 style="margin:0">${escapeHtml(heading)}</h2></div><div style="padding:24px;line-height:1.6"><p>Hello ${escapeHtml(badgeName(registration))},</p><p><strong>${escapeHtml(conference.title)}</strong></p><p>${escapeHtml(message)}</p>${number ? `<p>Badge number: <strong>${escapeHtml(number)}</strong></p>` : ""}${link ? `<p><a href="${escapeHtml(link)}" style="background:#176F91;color:white;display:inline-block;padding:12px 18px;text-decoration:none">View my badge</a></p><p style="overflow-wrap:anywhere;word-break:break-all">${escapeHtml(link)}</p>` : ""}<p>Attendance days: ${escapeHtml((registration.daysAttending || []).join(", "))}</p>${appBlock.html}</div></div></div>`
    await store.create(collections.history, id, { registryId: row.$id, conferenceId: conference.$id, registrationId: registration.$id, tokenId: row.tokenId, action: "email", actorId, occurredAt: iso(), recipient: registration.email, status: "sending" })
    let status, providerId = "", failure = ""
    try {
      const delivery = await sendEmail({ email: registration.email, subject: `${conference.shortName || "REC"}: ${heading}`, text: text + appBlock.text, html })
      status = "accepted"
      providerId = delivery.messageId || ""
    } catch (error) {
      // Timeouts/transport failures may occur after the provider accepted the email.
      status = error.definitelyRejected || (error.status >= 400 && error.status < 500) ? "failed" : "uncertain"
      failure = String(error.message).slice(0, 2000)
    }
    // Persistence errors must not be mistaken for provider rejection or trigger another send.
    await store.update(collections.history, id, { status, providerId, error: failure })
    await store.update(collections.registry, row.$id, { emailStatus: status, emailAt: iso() })
    return status
  }
  async function action(input, actorId) {
    const { conferenceId, registrationId, action: command = "generate", sendEmail: shouldEmail = false } = input
    const reason = String(input.reason || "").trim().slice(0, 1000)
    const operationId = String(input.operationId || crypto.randomUUID())
    if (!actorId) throw new RecBadgeError("An authenticated administrator is required.", 401)
    return withLock(`badge:${conferenceId}:${registrationId}`, async () => {
      const { conference, registration } = await context(conferenceId, registrationId)
      let row = await ensureRegistry(conference, registration)
      row = { ...row, ...projection(conference, registration) }
      const historyId = badgeId("action", operationId, conferenceId, registrationId)
      let previousAction = await get(collections.history, historyId)
      if (previousAction && (previousAction.action !== command || previousAction.actorId !== actorId)) throw new RecBadgeError("This request identifier was already used for another action.", 409)
      const previousDetails = previousAction ? JSON.parse(previousAction.detailsJson || "{}") : {}
      if (previousAction && row.operationId !== operationId && row.operationId !== previousDetails.previousOperationId) {
        // A later administrator action wins. Resuming an older job must never undo it
        // or email a revoked/replaced credential from that older operation.
        throw new RecBadgeError("A newer badge action superseded this operation. Review the current badge before starting another action.", 409, "badge_action_unavailable")
      }
      const alreadyCommitted = row.operationId === operationId || previousAction?.status === "completed"
      if (!alreadyCommitted) {
        const error = badgeActionError(command, row, reason, now().getTime())
        if (error) throw new RecBadgeError(error, 409, "badge_action_unavailable")
        if (!previousAction) previousAction = await store.create(collections.history, historyId, { registryId: row.$id, conferenceId, registrationId, action: command, actorId, reason, occurredAt: iso(), status: "processing", detailsJson: JSON.stringify({ previousStatus: row.status, previousTokenId: row.tokenId || "", previousOperationId: row.operationId }) })
        if (["generate", "replace", "restore"].includes(command)) {
          const tokenId = badgeId("credential", operationId, conferenceId, registrationId)
          let token = await get(config.recBadgeTokensCollectionId, tokenId)
          if (!token) {
            const raw = crypto.randomBytes(32).toString("base64url")
            for (let retry = 0; retry < 10; retry++) {
              try {
                token = await store.create(config.recBadgeTokensCollectionId, tokenId, { conferenceId, registrationId,
                  tokenHash: hash(raw), encryptedToken: encrypt(raw), tokenVersion: Number(row.version || 0) + 1,
                  badgeNumber: `REC${conference.year}${crypto.randomInt(100000, 1000000)}`, issuedAt: iso(), issuedBy: actorId, isActive: true })
                break
              } catch (error) { if (error.status !== 409 || retry === 9) throw error }
            }
          }
          // The canonical pointer is the sole authority, so a staged credential is never usable early.
          row = await store.update(collections.registry, row.$id, { ...projection(conference, registration), tokenId: token.$id, badgeNumber: token.badgeNumber, version: token.tokenVersion, status: "active", operationId, changedAt: iso(), emailStatus: "not_requested", emailAt: null })
        } else if (command === "revoke") {
          row = await store.update(collections.registry, row.$id, { status: "revoked", operationId, changedAt: iso() })
        } else {
          row = await store.update(collections.registry, row.$id, { operationId, changedAt: iso() })
        }
      }
      const prior = previousAction ? JSON.parse(previousAction.detailsJson || "{}") : {}
      const oldTokenId = command === "revoke" ? row.tokenId : ["replace", "restore"].includes(command) ? prior.previousTokenId : null
      if (oldTokenId) {
        const old = await get(config.recBadgeTokensCollectionId, oldTokenId)
        if (old && !old.revokedAt) await store.update(config.recBadgeTokensCollectionId, oldTokenId, { isActive: false, revokedAt: iso(), revokedBy: actorId, revokedReason: reason.slice(0, 255) })
      }
      await store.update(collections.history, historyId, { status: "completed", tokenId: row.tokenId || "" })
      const emailStatus = shouldEmail || command === "resend" ? await notify({ row, conference, registration, actorId, action: command, operationId: historyId }) : "not_requested"
      return { registrationId, status: badgeStatus(row, now().getTime()), badge: row.tokenId ? tokenDto(await get(config.recBadgeTokensCollectionId, row.tokenId)) : null, emailStatus }
    })
  }
  async function createJob(input, actorId) {
    if (!input.conferenceId || !actorId) throw new RecBadgeError("Conference and authenticated actor are required.")
    if (!["generate", "resend", "replace", "restore", "revoke"].includes(input.action)) throw new RecBadgeError("Select a valid badge action.")
    if (["replace", "restore", "revoke"].includes(input.action) && !String(input.reason || "").trim()) throw new RecBadgeError("A reason is required.")
    if (input.sendEmail !== undefined && typeof input.sendEmail !== "boolean") throw new RecBadgeError("Email selection must be a boolean.")
    const ids = [...new Set(Array.isArray(input.registrationIds) ? input.registrationIds.map(String).filter(Boolean) : [])]
    if (!ids.length || ids.length > 1000) throw new RecBadgeError("Select between 1 and 1,000 registrations.")
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(input.requestId || "")) throw new RecBadgeError("A valid request identifier is required.")
    const data = { conferenceId: input.conferenceId, action: input.action, actorId, sendEmail: input.sendEmail === true, reason: String(input.reason || "").slice(0, 1000), registrationIdsJson: JSON.stringify(ids) }
    const requestHash = hash(JSON.stringify(data))
    const id = badgeId("job", actorId, input.requestId)
    const existing = await get(collections.jobs, id)
    if (existing) { if (existing.requestHash !== requestHash) throw new RecBadgeError("This request ID was already used with a different selection.", 409); return jobDto(existing) }
    return jobDto(await store.create(collections.jobs, id, { ...data, status: "pending", total: ids.length, position: 0, createdAt: iso(), requestHash }))
  }
  function jobDto(job) {
    const publicJob = { ...job }
    delete publicJob.registrationIdsJson
    delete publicJob.requestHash
    return publicJob
  }
  async function jobDetail(id, page = 1, limit = 25) {
    const job = await get(collections.jobs, id)
    if (!job) throw new RecBadgeError("Badge job was not found.", 404)
    return { ...jobDto(job), results: await paginated(collections.results, [Query.equal("jobId", id), Query.orderAsc("position")], page, limit) }
  }
  async function processJob(id) {
    return withLock(`job:${id}`, async () => {
      let job = await get(collections.jobs, id)
      if (!job) throw new RecBadgeError("Badge job was not found.", 404)
      const ids = JSON.parse(job.registrationIdsJson)
      const end = Math.min(ids.length, job.position + 2)
      for (let index = job.position; index < end; index++) {
        const resultId = badgeId(id, index)
        if (!await get(collections.results, resultId)) {
          const registrationId = ids[index]
          const r = await get(config.recRegistrationsCollectionId, registrationId)
          let result
          try {
            const change = await action({ ...job, registrationId, operationId: resultId }, job.actorId)
            result = { status: "completed", emailStatus: change.emailStatus, message: "Badge action completed." }
          } catch (error) {
            // Unexpected/transport errors pause the job at this row. The same operation ID
            // completes a committed mutation on retry without rotating credentials again.
            if (error.code === "badge_busy" || !(error instanceof RecBadgeError)) throw error
            result = { status: error.code === "badge_action_unavailable" ? "skipped" : "failed", emailStatus: "not_requested", message: String(error.message).slice(0, 2000) }
          }
          await store.create(collections.results, resultId, { jobId: id, registrationId, name: r ? badgeName(r) : "Removed registration", email: r?.email || "", ...result, position: index, processedAt: iso() })
        }
        job = await store.update(collections.jobs, id, { position: index + 1, status: index + 1 === ids.length ? "completed" : "pending" })
      }
      return jobDetail(id)
    })
  }
  const listJobs = (conferenceId, page = 1) => paginated(collections.jobs, [Query.equal("conferenceId", conferenceId), Query.orderDesc("createdAt")], page, 10).then((result) => ({ ...result, documents: result.documents.map(jobDto) }))
  async function processPendingJob() {
    const pending = await store.list(collections.jobs, [Query.equal("status", "pending"), Query.orderAsc("createdAt"), Query.limit(10)])
    for (const job of pending.documents) {
      try {
        const result = await processJob(job.$id)
        return { jobId: result.$id, position: result.position, total: result.total, status: result.status }
      } catch (error) { if (error.code !== "badge_busy") throw error }
    }
    return { status: pending.total ? "busy" : "idle" }
  }
  async function emailWebhook(payload) {
    const outcomes = { Delivery: "delivered", Bounce: "bounced", SpamComplaint: "complaint" }
    const status = outcomes[payload.RecordType]
    if (!status || !payload.MessageID || !payload.Recipient) throw new RecBadgeError("Unsupported email event.")
    const result = await store.list(collections.history, [Query.equal("providerId", String(payload.MessageID)), Query.equal("action", "email"), Query.limit(1)])
    const email = result.documents[0]
    // Other modules use the same provider; acknowledge events unrelated to badge emails.
    if (!email || email.recipient.toLowerCase() !== String(payload.Recipient).toLowerCase()) return { ignored: true }
    return withLock(`badge:${email.conferenceId}:${email.registrationId}`, async () => {
      const id = badgeId("delivery", email.$id, payload.RecordType, payload.ID || "")
      if (!await get(collections.history, id)) await store.create(collections.history, id, {
        registryId: email.registryId, conferenceId: email.conferenceId, registrationId: email.registrationId,
        tokenId: email.tokenId, action: "email_event", actorId: "email-provider", occurredAt: iso(),
        status, recipient: email.recipient, providerId: email.providerId,
        reason: String(payload.Description || payload.Details || "").slice(0, 1000),
      })
      const current = await get(collections.history, email.$id)
      // A late delivery receipt cannot undo a bounce or complaint.
      if (status === "delivered" && ["bounced", "complaint"].includes(current.status)) return { ignored: true }
      await store.update(collections.history, email.$id, { status })
      const latest = await store.list(collections.history, [Query.equal("registryId", email.registryId), Query.equal("action", "email"), Query.orderDesc("occurredAt"), Query.orderDesc("$createdAt"), Query.limit(1)])
      if (latest.documents[0]?.$id === email.$id) await store.update(collections.registry, email.registryId, { emailStatus: status })
      return { received: true }
    })
  }
  return { action, detail, list, resolve, publicBadge, exportBadge, validExportItems, syncRegistration, ensureRegistry, withLock, createJob, processJob, jobDetail, listJobs, processPendingJob, emailWebhook, all, collections }
}
