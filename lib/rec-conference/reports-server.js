import { Query } from "node-appwrite"
import {
  createRestDocument,
  deleteRestDocument,
  getRestDocument,
  listRestDocuments,
  updateRestDocument,
} from "@/lib/appwrite/appwrite-rest-server"
import { config } from "@/lib/appwrite/config"
import {
  compareRecReports,
  isConferenceFinished,
  isHttpsUrl,
  normalizeRecReportType,
  REC_REPORT_TYPES,
  selectPreviousConferenceReport,
} from "@/lib/rec-conference/report-rules.mjs"

export { REC_REPORT_TYPES }

export class RecReportError extends Error {
  constructor(message, status = 400, code = "rec_report_error") {
    super(message)
    this.name = "RecReportError"
    this.status = status
    this.code = code
  }
}

function assertConfigured() {
  if (!config.recConferenceReportsCollectionId) {
    throw new RecReportError("REC conference reports collection is not configured.", 500, "missing_collection")
  }
  if (!config.recConferencesCollectionId) {
    throw new RecReportError("REC conferences collection is not configured.", 500, "missing_conference_collection")
  }
}

function text(value) {
  return String(value || "").trim()
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase())
}

function integerValue(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function reportTypeValue(value) {
  const normalized = text(value)
  if (normalized && !Object.values(REC_REPORT_TYPES).includes(normalized)) {
    throw new RecReportError("Report type is not supported.", 400, "invalid_report_type")
  }
  return normalizeRecReportType(normalized)
}

function displayOrderValue(value) {
  const normalized = integerValue(value, 0)
  if (normalized < 0) {
    throw new RecReportError("Display order cannot be negative.", 400, "invalid_display_order")
  }
  return normalized
}

function nullableText(value) {
  return text(value) || null
}

function validateLength(value, label, maxLength, { required = false } = {}) {
  const normalized = text(value)
  if (required && !normalized) {
    throw new RecReportError(`${label} is required.`, 400, `missing_${label.toLowerCase().replace(/\s+/g, "_")}`)
  }
  if (normalized.length > maxLength) {
    throw new RecReportError(`${label} must be ${maxLength} characters or fewer.`, 400, "field_too_long")
  }
  return normalized
}

function validateHttpsUrl(value, label, { required = false } = {}) {
  const normalized = text(value)
  if (!normalized) {
    if (required) throw new RecReportError(`${label} is required.`, 400, "missing_url")
    return null
  }
  if (!isHttpsUrl(normalized)) {
    throw new RecReportError(`${label} must be a valid HTTPS URL.`, 400, "invalid_url")
  }
  return new URL(normalized).toString()
}

function normalizeDate(value, label) {
  const normalized = text(value)
  if (!normalized) return null
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new RecReportError(`${label} must be a valid date.`, 400, "invalid_date")
  }
  return parsed.toISOString()
}

function compactData(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
}

function publicConference(conference, reportCount) {
  if (!conference) return null
  return {
    $id: conference.$id,
    year: conference.year,
    title: conference.title || "",
    shortName: conference.shortName || "",
    fullName: conference.fullName || "",
    description: conference.description || "",
    startDate: conference.startDate || "",
    endDate: conference.endDate || "",
    location: conference.location || "",
    venue: conference.venue || "",
    isActive: conference.isActive === true,
    registrationOpen: conference.registrationOpen === true,
    logoUrl: conference.logoUrl || "",
    heroImageUrl: conference.heroImageUrl || "",
    heroTagline: conference.heroTagline || "",
    accentColor: conference.accentColor || "",
    mainWebsiteUrl: conference.mainWebsiteUrl || "",
    contactEmail: conference.contactEmail || "",
    contactPhone: conference.contactPhone || "",
    socialsJson: conference.socialsJson || "",
    reportCount: Number(reportCount || 0),
  }
}

function reportView(report, conference, { includeAudit = false } = {}) {
  if (!report) return null
  const result = {
    $id: report.$id,
    conferenceId: report.conferenceId,
    reportType: report.reportType || REC_REPORT_TYPES.CONFERENCE_REPORT,
    title: report.title || "",
    summary: report.summary || "",
    reportUrl: report.reportUrl || "",
    coverImageUrl: report.coverImageUrl || "",
    publicationDate: report.publicationDate || "",
    displayOrder: Number(report.displayOrder || 0),
    isFeatured: report.isFeatured === true,
    isPublished: report.isPublished === true,
    createdAt: report.createdAt || report.$createdAt || "",
    updatedAt: report.updatedAt || report.$updatedAt || "",
    conference: publicConference(conference),
  }
  if (includeAudit) {
    result.createdBy = report.createdBy || ""
    result.updatedBy = report.updatedBy || ""
  }
  return result
}

async function listAllDocuments(collectionId, queries = []) {
  const documents = []
  let total = 0
  do {
    const result = await listRestDocuments(collectionId, [
      ...queries,
      Query.limit(100),
      Query.offset(documents.length),
    ])
    documents.push(...(result.documents || []))
    total = result.total || documents.length
    if (!result.documents?.length) break
  } while (documents.length < total)
  return documents
}

async function getConference(conferenceId) {
  if (!conferenceId) {
    throw new RecReportError("Conference is required.", 400, "missing_conference")
  }
  try {
    return await getRestDocument(config.recConferencesCollectionId, conferenceId)
  } catch (error) {
    if (error.status === 404) {
      throw new RecReportError("Conference was not found.", 404, "conference_not_found")
    }
    throw error
  }
}

async function getReport(reportId) {
  try {
    return await getRestDocument(config.recConferenceReportsCollectionId, reportId)
  } catch (error) {
    if (error.status === 404) {
      throw new RecReportError("Conference report was not found.", 404, "report_not_found")
    }
    throw error
  }
}

async function getActiveConference() {
  const result = await listRestDocuments(config.recConferencesCollectionId, [
    Query.equal("isActive", true),
    Query.limit(1),
  ])
  return result.documents?.[0] || null
}

function assertFinishedConference(conference) {
  if (!isConferenceFinished(conference)) {
    throw new RecReportError(
      "Reports can only be added to conferences that have finished.",
      409,
      "conference_not_finished"
    )
  }
}

function normalizePayload(input, existing = {}) {
  const source = input && typeof input === "object" ? input : {}
  return {
    conferenceId: text(source.conferenceId ?? existing.conferenceId),
    reportType: reportTypeValue(source.reportType ?? existing.reportType),
    title: validateLength(source.title ?? existing.title, "Title", 180, { required: true }),
    summary: nullableText(validateLength(source.summary ?? existing.summary, "Summary", 1200)),
    reportUrl: validateHttpsUrl(source.reportUrl ?? existing.reportUrl, "Report link", { required: true }),
    coverImageUrl: validateHttpsUrl(source.coverImageUrl ?? existing.coverImageUrl, "Cover image URL"),
    publicationDate: normalizeDate(source.publicationDate ?? existing.publicationDate, "Publication date"),
    displayOrder: displayOrderValue(source.displayOrder ?? existing.displayOrder),
    isFeatured: booleanValue(source.isFeatured, existing.isFeatured === true),
    isPublished: booleanValue(source.isPublished, existing.isPublished === true),
  }
}

async function clearOtherFeaturedReports(conferenceId, reportId) {
  const result = await listRestDocuments(config.recConferenceReportsCollectionId, [
    Query.equal("conferenceId", conferenceId),
    Query.equal("isFeatured", true),
    Query.limit(100),
  ])
  await Promise.all(
    (result.documents || [])
      .filter((report) => report.$id !== reportId)
      .map((report) => updateRestDocument(config.recConferenceReportsCollectionId, report.$id, {
        isFeatured: false,
        updatedAt: new Date().toISOString(),
      }))
  )
}

export async function listRecReportConferences({ publicOnly = false } = {}) {
  assertConfigured()
  const [conferences, reports] = await Promise.all([
    listAllDocuments(config.recConferencesCollectionId, [Query.orderDesc("year")]),
    listAllDocuments(
      config.recConferenceReportsCollectionId,
      publicOnly ? [Query.equal("isPublished", true)] : []
    ),
  ])
  const counts = reports.reduce((map, report) => {
    map.set(report.conferenceId, (map.get(report.conferenceId) || 0) + 1)
    return map
  }, new Map())

  const documents = conferences
    .filter((conference) => isConferenceFinished(conference))
    .filter((conference) => !publicOnly || counts.has(conference.$id))
    .map((conference) => publicConference(conference, counts.get(conference.$id) || 0))

  return {
    documents,
    total: documents.length,
    ...(publicOnly
      ? { siteConference: publicConference(conferences.find((conference) => conference.isActive === true) || conferences[0]) }
      : {}),
  }
}

export async function listRecReports({
  conferenceId,
  reportType = "",
  publicOnly = false,
  page = 1,
  limit = 12,
} = {}) {
  assertConfigured()
  let resolvedConferenceId = text(conferenceId)
  let selectedConference = null

  if (!resolvedConferenceId && publicOnly) {
    const available = await listRecReportConferences({ publicOnly: true })
    resolvedConferenceId = available.documents[0]?.$id || ""
  }

  const safePage = Math.max(1, Number.parseInt(page, 10) || 1)
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 12))
  if (!resolvedConferenceId && publicOnly) {
    return {
      documents: [],
      conference: null,
      total: 0,
      page: safePage,
      limit: safeLimit,
      totalPages: 1,
    }
  }

  if (!resolvedConferenceId) {
    throw new RecReportError("Conference is required.", 400, "missing_conference")
  }

  selectedConference = await getConference(resolvedConferenceId)
  if (publicOnly) assertFinishedConference(selectedConference)

  const normalizedType = text(reportType)
  const queries = [Query.equal("conferenceId", resolvedConferenceId)]
  if (publicOnly) queries.push(Query.equal("isPublished", true))
  if (Object.values(REC_REPORT_TYPES).includes(normalizedType)) {
    queries.push(Query.equal("reportType", normalizedType))
  }
  queries.push(
    Query.orderAsc("displayOrder"),
    Query.orderAsc("title"),
    Query.limit(safeLimit),
    Query.offset((safePage - 1) * safeLimit)
  )

  const result = await listRestDocuments(config.recConferenceReportsCollectionId, queries)
  const total = result.total || 0
  return {
    documents: (result.documents || []).map((report) => reportView(report, selectedConference, {
      includeAudit: !publicOnly,
    })),
    conference: publicConference(selectedConference, total),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  }
}

export async function createRecReport(input, actorId) {
  assertConfigured()
  const payload = normalizePayload(input)
  const conference = await getConference(payload.conferenceId)
  assertFinishedConference(conference)
  const timestamp = new Date().toISOString()
  const report = await createRestDocument(config.recConferenceReportsCollectionId, compactData({
    ...payload,
    createdBy: actorId || "",
    updatedBy: actorId || "",
    createdAt: timestamp,
    updatedAt: timestamp,
  }))
  if (payload.isFeatured) await clearOtherFeaturedReports(payload.conferenceId, report.$id)
  return reportView(report, conference, { includeAudit: true })
}

export async function updateRecReport(reportId, input, actorId) {
  assertConfigured()
  const existing = await getReport(reportId)
  const payload = normalizePayload(input, existing)
  const conference = await getConference(payload.conferenceId)
  assertFinishedConference(conference)
  const report = await updateRestDocument(config.recConferenceReportsCollectionId, reportId, compactData({
    ...payload,
    updatedBy: actorId || "",
    updatedAt: new Date().toISOString(),
  }))
  if (payload.isFeatured) await clearOtherFeaturedReports(payload.conferenceId, report.$id)
  return reportView(report, conference, { includeAudit: true })
}

export async function deleteRecReport(reportId) {
  assertConfigured()
  await getReport(reportId)
  await deleteRestDocument(config.recConferenceReportsCollectionId, reportId)
  return { success: true }
}

export async function getFeaturedPreviousRecReport({ conferenceId = "" } = {}) {
  assertConfigured()
  const [currentConference, conferences, reports] = await Promise.all([
    conferenceId ? getConference(conferenceId) : getActiveConference(),
    listAllDocuments(config.recConferencesCollectionId, [Query.orderDesc("year")]),
    listAllDocuments(config.recConferenceReportsCollectionId, [Query.equal("isPublished", true)]),
  ])
  const selected = selectPreviousConferenceReport({
    reports: reports.sort(compareRecReports),
    conferences,
    currentConference,
  })
  if (!selected) return { report: null, conference: null }
  return {
    report: reportView(selected.report, selected.conference),
    conference: publicConference(selected.conference),
  }
}
