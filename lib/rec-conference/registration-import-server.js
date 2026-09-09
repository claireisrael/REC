import crypto from "node:crypto"
import Papa from "papaparse"
import { Query } from "node-appwrite"
import countries from "world-countries"
import { config } from "@/lib/appwrite/config"
import {
  createRestDocument,
  createRestDocumentWithId,
  deleteRestDocument,
  getRestDocument,
  listRestDocuments,
  updateRestDocument,
} from "@/lib/appwrite/appwrite-rest-server"
import { sendRecRegistrationConfirmationEmail } from "@/lib/rec-conference/registration-email"
import {
  REC_IMPORT_TEMPLATE_TYPES,
  addDuplicateRegistrationImportErrors,
  determineRegistrationImportAction,
  getCouponImportValidationErrors,
  getRegistrationImportDownloadHeaders,
  getRegistrationImportHeaders,
  getRegistrationImportSampleRows,
  normalizeCouponCode,
  normalizeRegistrationEmail,
  parseConferenceDays,
  protectCsvSpreadsheetValue,
  validateAndMapRegistrationImportRow,
  validateRegistrationImportHeaders,
} from "@/lib/rec-conference/registration-import-rules.mjs"

const MAX_FILE_BYTES = Number(process.env.REC_REGISTRATION_IMPORT_MAX_FILE_BYTES || 2 * 1024 * 1024)
const MAX_IMPORT_ROWS = Math.min(
  2000,
  Math.max(1, Number(process.env.REC_REGISTRATION_IMPORT_MAX_ROWS || 500))
)
const DEFAULT_PAGE_LIMIT = 25
const MAX_PAGE_LIMIT = 100
const COMMIT_BATCH_SIZE = Math.min(
  25,
  Math.max(1, Number(process.env.REC_REGISTRATION_IMPORT_BATCH_SIZE || 10))
)
const REGISTRATION_LOCK_SCOPE = "registration-submit"
const KAMPALA_COUNTRIES = countries
  .map((country) => country?.name?.common)
  .filter(Boolean)
  .sort((first, second) => first.localeCompare(second))

export class RecRegistrationImportError extends Error {
  constructor(status, code, message, details = {}) {
    super(message)
    this.name = "RecRegistrationImportError"
    this.status = status
    this.code = code
    this.details = details
  }
}

function importError(status, code, message, details = {}) {
  return new RecRegistrationImportError(status, code, message, details)
}

function clampInteger(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

function parseJson(value, fallback = null) {
  if (!value) return fallback
  if (typeof value === "object") return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function trimMessage(value, limit = 2000) {
  return String(value || "Unexpected import error").trim().slice(0, limit)
}

function actorName(actor) {
  return String(
    actor?.name ||
    [actor?.profile?.firstName, actor?.profile?.lastName].filter(Boolean).join(" ") ||
    actor?.email ||
    "REC administrator"
  ).trim()
}

function serializeConference(document) {
  return {
    ...document,
    days: parseConferenceDays(document?.days),
  }
}

function serializeImport(document) {
  return {
    ...document,
    couponSummary: parseJson(document?.couponSummaryJson, []),
  }
}

function serializeImportRow(document) {
  const saved = parseJson(document?.payloadJson, {})
  const payload = saved?.payload || saved
  const source = saved?.source || {}
  return {
    ...document,
    payload,
    source,
    attendeeName: [
      payload.title,
      payload.firstName,
      payload.otherName,
      payload.lastName,
    ].filter(Boolean).join(" "),
  }
}

function documentIncludesConference(registration, conferenceYear) {
  return Array.isArray(registration?.conferenceYears) &&
    registration.conferenceYears.map(Number).includes(Number(conferenceYear))
}

function registrationMap(documents) {
  const sorted = [...documents].sort(
    (first, second) =>
      String(second.$createdAt || "").localeCompare(String(first.$createdAt || ""))
  )
  const result = new Map()
  sorted.forEach((registration) => {
    const email = normalizeRegistrationEmail(registration.email)
    if (email && !result.has(email)) result.set(email, registration)
  })
  return result
}

async function listAllDocuments(collectionId, queries = []) {
  const documents = []
  let total = 0

  do {
    const response = await listRestDocuments(collectionId, [
      ...queries,
      Query.limit(100),
      Query.offset(documents.length),
    ])
    documents.push(...(response.documents || []))
    total = Number(response.total || documents.length)
  } while (documents.length < total)

  return documents
}

async function runWithConcurrency(items, concurrency, operation) {
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        await operation(items[index], index)
      }
    }
  )
  await Promise.all(workers)
}

async function getConference(conferenceId) {
  if (!conferenceId) {
    throw importError(400, "conference_required", "Select a conference before importing attendees.")
  }

  try {
    return serializeConference(
      await getRestDocument(config.recConferencesCollectionId, conferenceId)
    )
  } catch (error) {
    if (error.status === 404) {
      throw importError(404, "conference_not_found", "The selected conference was not found.")
    }
    throw error
  }
}

async function parseCsvFile(file, templateType) {
  if (!file || typeof file.text !== "function") {
    throw importError(400, "file_required", "Choose a CSV file to validate.")
  }
  if (!String(file.name || "").toLowerCase().endsWith(".csv")) {
    throw importError(400, "invalid_file_type", "Only .csv files can be imported.")
  }
  if (Number(file.size || 0) > MAX_FILE_BYTES) {
    throw importError(
      413,
      "file_too_large",
      `The CSV file must not exceed ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`
    )
  }

  const csvText = await file.text()
  if (!csvText.trim()) {
    throw importError(400, "empty_file", "The selected CSV file is empty.")
  }
  if (csvText.includes("\0")) {
    throw importError(400, "invalid_csv", "The selected file is not a valid text CSV file.")
  }

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => String(header || "").replace(/^\uFEFF/, "").trim(),
  })
  const parserErrors = (parsed.errors || []).filter(
    (error) => error.type !== "FieldMismatch" || error.code !== "TooFewFields"
  )
  if (parserErrors.length) {
    throw importError(
      400,
      "invalid_csv",
      "The CSV could not be parsed.",
      {
        errors: parserErrors.slice(0, 10).map((error) => (
          `Row ${Number(error.row || 0) + 2}: ${error.message}`
        )),
      }
    )
  }

  const headerResult = validateRegistrationImportHeaders(parsed.meta?.fields, templateType)
  if (!headerResult.valid) {
    throw importError(
      400,
      "invalid_headers",
      "The CSV columns do not match the selected template.",
      {
        missing: headerResult.missing,
        unexpected: headerResult.unexpected,
        expected: headerResult.expected,
      }
    )
  }
  if (!parsed.data.length) {
    throw importError(400, "no_rows", "The CSV does not contain any attendee rows.")
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    throw importError(
      413,
      "too_many_rows",
      `A single import can contain at most ${MAX_IMPORT_ROWS} attendees.`
    )
  }

  return {
    rows: parsed.data,
    fileName: String(file.name || "rec-attendees.csv").slice(0, 255),
  }
}

function buildSourceRow(row, templateType) {
  const headers = getRegistrationImportDownloadHeaders(templateType)
  return Object.fromEntries(
    headers.map((header) => [
      header,
      String(row?.[header] ?? "").trim(),
    ])
  )
}

async function buildValidatedRows({
  rows,
  conference,
  templateType,
  updateExisting,
}) {
  const [registrationDocuments, couponDocuments] = await Promise.all([
    listAllDocuments(config.recRegistrationsCollectionId),
    templateType === REC_IMPORT_TEMPLATE_TYPES.SPONSORED
      ? listAllDocuments(config.recCouponsCollectionId)
      : Promise.resolve([]),
  ])
  const registrationsByEmail = registrationMap(registrationDocuments)
  const couponsByCode = new Map(
    couponDocuments
      .map((coupon) => [normalizeCouponCode(coupon.coupon), coupon])
      .filter(([code]) => code)
  )

  let mappedRows = rows.map((sourceRow, index) => {
    const mapped = validateAndMapRegistrationImportRow(sourceRow, {
      templateType,
      conferenceDays: conference.days,
      validCountries: KAMPALA_COUNTRIES,
    })
    return {
      ...mapped,
      rowNumber: index + 2,
      source: buildSourceRow(sourceRow, templateType),
    }
  })
  mappedRows = addDuplicateRegistrationImportErrors(mappedRows)

  const couponDemand = new Map()
  mappedRows = mappedRows.map((row) => {
    const existing = registrationsByEmail.get(row.normalizedEmail) || null
    const action = determineRegistrationImportAction(
      existing,
      conference.year,
      updateExisting
    )
    const errors = [...row.errors]

    if (
      action === "update_existing" &&
      String(existing?.registrationType || "").toLowerCase() !== "attendee"
    ) {
      errors.push(
        "This email is already registered for the conference under a non-attendee registration type."
      )
    }

    if (
      templateType === REC_IMPORT_TEMPLATE_TYPES.SPONSORED &&
      errors.length === 0
    ) {
      const coupon = couponsByCode.get(row.couponCode)
      if (action === "update_existing") {
        if (normalizeCouponCode(existing?.coupon) !== row.couponCode) {
          errors.push(
            "An existing conference registration cannot change its coupon through bulk import."
          )
        } else {
          errors.push(...getCouponImportValidationErrors(coupon, {
            couponCode: row.couponCode,
            conferenceYear: conference.year,
            requiresSeat: false,
          }))
        }
      } else if (action !== "skip") {
        const demand = couponDemand.get(row.couponCode) || []
        demand.push(row.rowNumber)
        couponDemand.set(row.couponCode, demand)
      }
    }

    return {
      ...row,
      action,
      errors,
      valid: errors.length === 0,
    }
  })

  const couponErrorsByCode = new Map()
  const couponSummary = []
  for (const [couponCode, rowNumbers] of couponDemand.entries()) {
    const coupon = couponsByCode.get(couponCode)
    const errors = getCouponImportValidationErrors(coupon, {
      couponCode,
      conferenceYear: conference.year,
      requiredSeats: rowNumbers.length,
    })
    if (errors.length) couponErrorsByCode.set(couponCode, errors)
    couponSummary.push({
      couponCode,
      sponsorOrganization: coupon?.organization || "",
      sponsorSector: coupon?.sector || "",
      requiredSeats: rowNumbers.length,
      availableSeats: Number(coupon?.usersLeft || 0),
      valid: errors.length === 0,
      errors,
    })
  }

  mappedRows = mappedRows.map((row) => {
    const couponErrors = row.valid ? couponErrorsByCode.get(row.couponCode) || [] : []
    if (!couponErrors.length) return row
    const errors = [...row.errors, ...couponErrors]
    return { ...row, errors, valid: false }
  })

  return { rows: mappedRows, couponSummary }
}

async function persistValidatedImport({
  conference,
  templateType,
  fileName,
  sendEmails,
  updateExisting,
  rows,
  couponSummary,
  actor,
}) {
  const now = new Date().toISOString()
  const validRows = rows.filter((row) => row.valid)
  const importRecord = await createRestDocument(
    config.recRegistrationImportsCollectionId,
    {
      conferenceId: conference.$id,
      conferenceYear: Number(conference.year),
      conferenceTitle: String(conference.title || `REC ${conference.year}`).slice(0, 200),
      templateType,
      status: "validated",
      fileName,
      sendEmails: Boolean(sendEmails),
      updateExisting: Boolean(updateExisting),
      rowCount: rows.length,
      readyCount: validRows.length,
      invalidCount: rows.length - validRows.length,
      createdCount: 0,
      returningCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      emailsSent: 0,
      emailsFailed: 0,
      couponSummaryJson: couponSummary.length ? JSON.stringify(couponSummary) : null,
      createdBy: actor.userId,
      createdByName: actorName(actor).slice(0, 180),
      idempotencyKey: crypto.randomUUID(),
      createdAt: now,
      validatedAt: now,
    }
  )

  try {
    await runWithConcurrency(rows, 8, async (row) => {
      await createRestDocument(config.recRegistrationImportRowsCollectionId, {
        importId: importRecord.$id,
        rowNumber: row.rowNumber,
        email: row.normalizedEmail || null,
        couponCode: row.couponCode || null,
        action: row.action,
        status: row.valid ? "pending" : "invalid",
        payloadJson: JSON.stringify({
          source: row.source,
          payload: row.payload,
        }),
        errorMessage: row.errors.length ? row.errors.join(" ").slice(0, 2000) : null,
        emailStatus: "not_requested",
      })
    })
  } catch (error) {
    await updateRestDocument(
      config.recRegistrationImportsCollectionId,
      importRecord.$id,
      {
        status: "failed",
        errorMessage: trimMessage(`Could not persist all CSV rows: ${error.message}`),
        completedAt: new Date().toISOString(),
      }
    ).catch(() => null)
    throw error
  }

  return importRecord
}

export async function validateRegistrationImport({
  file,
  conferenceId,
  templateType,
  sendEmails = false,
  updateExisting = false,
  actor,
}) {
  if (!Object.values(REC_IMPORT_TEMPLATE_TYPES).includes(templateType)) {
    throw importError(
      400,
      "invalid_template_type",
      "Choose either the standard or coupon-sponsored template."
    )
  }

  const [conference, csv] = await Promise.all([
    getConference(conferenceId),
    parseCsvFile(file, templateType),
  ])
  const validation = await buildValidatedRows({
    rows: csv.rows,
    conference,
    templateType,
    updateExisting: Boolean(updateExisting),
  })
  const importRecord = await persistValidatedImport({
    conference,
    templateType,
    fileName: csv.fileName,
    sendEmails: Boolean(sendEmails),
    updateExisting: Boolean(updateExisting),
    rows: validation.rows,
    couponSummary: validation.couponSummary,
    actor,
  })

  return getRegistrationImport(importRecord.$id, { page: 1, limit: DEFAULT_PAGE_LIMIT })
}

export async function buildRegistrationImportTemplate(templateType, conferenceId = "") {
  if (!Object.values(REC_IMPORT_TEMPLATE_TYPES).includes(templateType)) {
    throw importError(400, "invalid_template_type", "Unknown registration import template.")
  }

  const conferenceDays = conferenceId ? (await getConference(conferenceId)).days : []
  return `\uFEFF${Papa.unparse({
    fields: getRegistrationImportDownloadHeaders(templateType),
    data: getRegistrationImportSampleRows(templateType, conferenceDays),
  })}\r\n`
}

export async function listRegistrationImports({
  conferenceId = "",
  page = 1,
  limit = DEFAULT_PAGE_LIMIT,
} = {}) {
  const safePage = clampInteger(page, 1)
  const safeLimit = clampInteger(limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT)
  const queries = [
    ...(conferenceId ? [Query.equal("conferenceId", conferenceId)] : []),
    Query.orderDesc("$createdAt"),
    Query.limit(safeLimit),
    Query.offset((safePage - 1) * safeLimit),
  ]
  const response = await listRestDocuments(config.recRegistrationImportsCollectionId, queries)
  const total = Number(response.total || 0)

  return {
    documents: (response.documents || []).map(serializeImport),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  }
}

export async function getRegistrationImport(
  importId,
  { page = 1, limit = DEFAULT_PAGE_LIMIT, status = "" } = {}
) {
  let importRecord
  try {
    importRecord = await getRestDocument(config.recRegistrationImportsCollectionId, importId)
  } catch (error) {
    if (error.status === 404) {
      throw importError(404, "import_not_found", "The registration import was not found.")
    }
    throw error
  }

  const safePage = clampInteger(page, 1)
  const safeLimit = clampInteger(limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT)
  const queries = [
    Query.equal("importId", importId),
    ...(status ? [Query.equal("status", status)] : []),
    Query.orderAsc("rowNumber"),
    Query.limit(safeLimit),
    Query.offset((safePage - 1) * safeLimit),
  ]
  const response = await listRestDocuments(config.recRegistrationImportRowsCollectionId, queries)
  const total = Number(response.total || 0)

  return {
    import: serializeImport(importRecord),
    rows: {
      documents: (response.documents || []).map(serializeImportRow),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  }
}

function lockIdFor(scope) {
  return `lock_${crypto.createHash("sha256").update(scope).digest("hex").slice(0, 28)}`
}

async function tryAcquireLock(scope, ttlMs) {
  const documentId = lockIdFor(scope)
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()

  try {
    await createRestDocumentWithId(config.recRegistrationLocksCollectionId, documentId, {
      scope,
      expiresAt,
    })
    return documentId
  } catch (error) {
    if (error.status !== 409) throw error
  }

  try {
    const current = await getRestDocument(config.recRegistrationLocksCollectionId, documentId)
    if (Date.parse(current.expiresAt) <= Date.now()) {
      await deleteRestDocument(config.recRegistrationLocksCollectionId, documentId)
      await createRestDocumentWithId(config.recRegistrationLocksCollectionId, documentId, {
        scope,
        expiresAt,
      })
      return documentId
    }
  } catch (error) {
    if (![404, 409].includes(error.status)) throw error
  }

  return null
}

async function acquireLock(scope, { ttlMs = 120000, attempts = 24 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const documentId = await tryAcquireLock(scope, ttlMs)
    if (documentId) return documentId
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw importError(
    409,
    "registration_busy",
    "Registration processing is busy. Please continue the import in a moment."
  )
}

async function withLock(scope, operation, options = {}) {
  const lockId = await acquireLock(scope, options)
  try {
    return await operation()
  } finally {
    await deleteRestDocument(config.recRegistrationLocksCollectionId, lockId).catch(() => null)
  }
}

async function findCurrentRegistration(email, legacyRegistrations) {
  const exact = await listRestDocuments(config.recRegistrationsCollectionId, [
    Query.equal("email", email),
    Query.limit(10),
  ])
  const exactMatch = (exact.documents || []).find(
    (registration) => normalizeRegistrationEmail(registration.email) === email
  )
  return exactMatch || legacyRegistrations.get(email) || null
}

async function findCoupon(couponCode) {
  if (!couponCode) return null
  const response = await listRestDocuments(config.recCouponsCollectionId, [
    Query.equal("coupon", couponCode),
    Query.limit(1),
  ])
  return response.documents?.[0] || null
}

function sponsorshipFromCoupon(coupon) {
  if (!coupon) {
    return {
      sponsorOrganization: null,
      sponsorSector: null,
      sponsorCouponId: null,
    }
  }
  return {
    sponsorOrganization: String(coupon.organization || "").trim() || null,
    sponsorSector: String(coupon.sector || "").trim() || null,
    sponsorCouponId: coupon.$id,
  }
}

function mergedConferenceYears(existing, conferenceYear) {
  return Array.from(
    new Set([
      ...(Array.isArray(existing?.conferenceYears) ? existing.conferenceYears.map(Number) : []),
      Number(conferenceYear),
    ])
  ).sort((first, second) => first - second)
}

function buildRegistrationPayload({
  importedPayload,
  existing,
  conferenceYear,
  sponsorship,
  couponCode,
  preserveCurrentSponsorship,
}) {
  const sponsorshipFields = preserveCurrentSponsorship
    ? {
        sponsorOrganization: existing?.sponsorOrganization || null,
        sponsorSector: existing?.sponsorSector || null,
        sponsorCouponId: existing?.sponsorCouponId || null,
        coupon: existing?.coupon || null,
      }
    : {
        ...sponsorship,
        coupon: couponCode || null,
        usedCoupon: null,
      }

  return {
    ...importedPayload,
    email: normalizeRegistrationEmail(importedPayload.email),
    conferenceYears: mergedConferenceYears(existing, conferenceYear),
    registrationType: "Attendee",
    ...sponsorshipFields,
  }
}

async function decrementCouponForRegistration(coupon, conferenceYear) {
  const errors = getCouponImportValidationErrors(coupon, {
    couponCode: coupon?.coupon,
    conferenceYear,
    requiredSeats: 1,
  })
  if (errors.length) {
    throw importError(409, "coupon_unavailable", errors.join(" "))
  }

  const usersLeft = Number(coupon.usersLeft || 0)
  await updateRestDocument(config.recCouponsCollectionId, coupon.$id, {
    usersLeft: usersLeft - 1,
    isActive: usersLeft - 1 > 0,
  })
}

async function restoreCouponAfterFailure(coupon) {
  if (!coupon) return
  try {
    const current = await getRestDocument(config.recCouponsCollectionId, coupon.$id)
    await updateRestDocument(config.recCouponsCollectionId, coupon.$id, {
      usersLeft: Number(current.usersLeft || 0) + 1,
      isActive: true,
    })
  } catch (error) {
    console.error("REC import coupon rollback failed", error)
  }
}

async function processRegistrationRow(row, importRecord, legacyRegistrations) {
  const savedPayload = parseJson(row.payloadJson, null)
  const importedPayload = savedPayload?.payload || savedPayload
  if (!importedPayload?.email) {
    throw importError(400, "invalid_row_payload", "The saved import row is incomplete.")
  }

  return withLock(REGISTRATION_LOCK_SCOPE, async () => {
    const email = normalizeRegistrationEmail(importedPayload.email)
    const existing = await findCurrentRegistration(email, legacyRegistrations)
    const currentConferenceRegistration = documentIncludesConference(
      existing,
      importRecord.conferenceYear
    )
    let action = existing
      ? currentConferenceRegistration
        ? importRecord.updateExisting
          ? "update_existing"
          : "skip"
        : "register_existing"
      : "create"

    if (action === "skip") {
      return {
        action,
        registration: existing,
        emailStatus: "not_requested",
      }
    }
    if (
      action === "update_existing" &&
      String(existing?.registrationType || "").toLowerCase() !== "attendee"
    ) {
      throw importError(
        409,
        "registration_type_conflict",
        "The current registration uses a non-attendee registration type."
      )
    }

    const sponsored = importRecord.templateType === REC_IMPORT_TEMPLATE_TYPES.SPONSORED
    const requiresConferenceSeat = action === "create" || action === "register_existing"
    let coupon = null
    let couponDecremented = false
    let sponsorship = sponsorshipFromCoupon(null)

    if (sponsored && action === "update_existing") {
      if (normalizeCouponCode(existing?.coupon) !== normalizeCouponCode(row.couponCode)) {
        throw importError(
          409,
          "coupon_change_blocked",
          "An existing conference registration cannot change its coupon through bulk import."
        )
      }
    } else if (sponsored && requiresConferenceSeat) {
      coupon = await findCoupon(normalizeCouponCode(row.couponCode))
      sponsorship = sponsorshipFromCoupon(coupon)
      await decrementCouponForRegistration(coupon, importRecord.conferenceYear)
      couponDecremented = true
    }

    const registrationPayload = buildRegistrationPayload({
      importedPayload,
      existing,
      conferenceYear: importRecord.conferenceYear,
      sponsorship,
      couponCode: sponsored ? normalizeCouponCode(row.couponCode) : null,
      preserveCurrentSponsorship: action === "update_existing",
    })

    try {
      const registration = existing
        ? await updateRestDocument(
            config.recRegistrationsCollectionId,
            existing.$id,
            registrationPayload
          )
        : await createRestDocument(
            config.recRegistrationsCollectionId,
            registrationPayload
          )
      legacyRegistrations.set(email, registration)
      return {
        action,
        registration,
        emailStatus: importRecord.sendEmails ? "pending" : "not_requested",
      }
    } catch (error) {
      if (couponDecremented) await restoreCouponAfterFailure(coupon)
      throw error
    }
  })
}

async function markRowFailed(row, error) {
  await updateRestDocument(config.recRegistrationImportRowsCollectionId, row.$id, {
    status: "failed",
    errorMessage: trimMessage(error.message),
    processedAt: new Date().toISOString(),
    emailStatus: "not_requested",
  })
}

async function processPendingRows(importRecord, rows, legacyRegistrations) {
  for (const row of rows) {
    try {
      await updateRestDocument(config.recRegistrationImportRowsCollectionId, row.$id, {
        status: "processing",
        errorMessage: null,
      })
      const result = await processRegistrationRow(row, importRecord, legacyRegistrations)
      await updateRestDocument(config.recRegistrationImportRowsCollectionId, row.$id, {
        action: result.action,
        status: result.action === "skip" ? "skipped" : "completed",
        registrationId: result.registration?.$id || null,
        errorMessage: null,
        emailStatus: result.emailStatus,
        emailError: null,
        processedAt: new Date().toISOString(),
      })
    } catch (error) {
      await markRowFailed(row, error)
    }
  }
}

async function deliverPendingEmails(importRecord, conference, limit = COMMIT_BATCH_SIZE) {
  if (!importRecord.sendEmails) return

  const response = await listRestDocuments(config.recRegistrationImportRowsCollectionId, [
    Query.equal("importId", importRecord.$id),
    Query.equal("emailStatus", "pending"),
    Query.orderAsc("rowNumber"),
    Query.limit(limit),
  ])

  for (const row of response.documents || []) {
    try {
      const registration = await getRestDocument(
        config.recRegistrationsCollectionId,
        row.registrationId
      )
      await sendRecRegistrationConfirmationEmail(registration, {
        year: importRecord.conferenceYear,
        sponsorshipPackageUrl: conference.sponsorshipPackageUrl || null,
        administrativeInvite: true,
      })
      await updateRestDocument(config.recRegistrationImportRowsCollectionId, row.$id, {
        emailStatus: "sent",
        emailError: null,
      })
    } catch (error) {
      await updateRestDocument(config.recRegistrationImportRowsCollectionId, row.$id, {
        emailStatus: "failed",
        emailError: trimMessage(error.message, 1000),
      })
    }
  }
}

async function summarizeImportRows(importId) {
  const rows = await listAllDocuments(config.recRegistrationImportRowsCollectionId, [
    Query.equal("importId", importId),
  ])
  const completed = rows.filter((row) => row.status === "completed")
  return {
    rows,
    rowCount: rows.length,
    readyCount: rows.filter((row) => row.status !== "invalid").length,
    invalidCount: rows.filter((row) => row.status === "invalid").length,
    createdCount: completed.filter((row) => row.action === "create").length,
    returningCount: completed.filter((row) => row.action === "register_existing").length,
    updatedCount: completed.filter((row) => row.action === "update_existing").length,
    skippedCount: rows.filter((row) => row.status === "skipped").length,
    failedCount: rows.filter((row) => row.status === "failed").length,
    emailsSent: rows.filter((row) => row.emailStatus === "sent").length,
    emailsFailed: rows.filter((row) => row.emailStatus === "failed").length,
    pendingCount: rows.filter((row) => ["pending", "processing"].includes(row.status)).length,
    pendingEmailCount: rows.filter((row) => row.emailStatus === "pending").length,
  }
}

async function reconcileConferenceCounts(conference) {
  await withLock(REGISTRATION_LOCK_SCOPE, async () => {
    const registrations = await listAllDocuments(config.recRegistrationsCollectionId)
    const currentCounts = parseJson(conference.currentCounts, {
      attendee: 0,
      exhibitor: 0,
      sponsor: 0,
    })
    const counts = {
      attendee: 0,
      exhibitor: 0,
      sponsor: 0,
    }

    registrations
      .filter((registration) => documentIncludesConference(registration, conference.year))
      .forEach((registration) => {
        const key = String(registration.registrationType || "").toLowerCase()
        if (Object.hasOwn(counts, key)) counts[key] += 1
      })

    await updateRestDocument(config.recConferencesCollectionId, conference.$id, {
      currentCounts: JSON.stringify({ ...currentCounts, ...counts }),
    })
  })
}

function importSummaryUpdate(summary) {
  return {
    rowCount: summary.rowCount,
    readyCount: summary.readyCount,
    invalidCount: summary.invalidCount,
    createdCount: summary.createdCount,
    returningCount: summary.returningCount,
    updatedCount: summary.updatedCount,
    skippedCount: summary.skippedCount,
    failedCount: summary.failedCount,
    emailsSent: summary.emailsSent,
    emailsFailed: summary.emailsFailed,
  }
}

function completionErrorMessage(summary, reconciliationError = "") {
  const messages = []
  if (summary.failedCount) messages.push(`${summary.failedCount} attendee rows failed.`)
  if (summary.emailsFailed) messages.push(`${summary.emailsFailed} optional emails failed.`)
  if (reconciliationError) messages.push(reconciliationError)
  return messages.join(" ").slice(0, 2000) || null
}

async function resetFailedRows(importId) {
  const failedRows = await listAllDocuments(config.recRegistrationImportRowsCollectionId, [
    Query.equal("importId", importId),
    Query.equal("status", "failed"),
  ])
  await runWithConcurrency(failedRows, 8, (row) =>
    updateRestDocument(config.recRegistrationImportRowsCollectionId, row.$id, {
      status: "pending",
      errorMessage: null,
      processedAt: null,
    })
  )
}

async function hasRowsWithStatus(importId, statusField, statusValue) {
  const response = await listRestDocuments(config.recRegistrationImportRowsCollectionId, [
    Query.equal("importId", importId),
    Query.equal(statusField, statusValue),
    Query.limit(1),
  ])
  return Number(response.total || 0) > 0
}

export async function commitRegistrationImport(
  importId,
  { retryFailed = false } = {}
) {
  return withLock(`registration-import:${importId}`, async () => {
    let importRecord
    try {
      importRecord = await getRestDocument(config.recRegistrationImportsCollectionId, importId)
    } catch (error) {
      if (error.status === 404) {
        throw importError(404, "import_not_found", "The registration import was not found.")
      }
      throw error
    }

    if (Number(importRecord.invalidCount || 0) > 0) {
      throw importError(
        409,
        "validation_errors",
        "Correct every invalid CSV row before creating registrations."
      )
    }
    if (["cancelled", "failed"].includes(importRecord.status) && !retryFailed) {
      throw importError(409, "import_not_ready", "This import cannot currently be processed.")
    }
    if (
      retryFailed &&
      !(await hasRowsWithStatus(importId, "status", ["pending", "processing"]))
    ) {
      await resetFailedRows(importId)
    }

    const startedAt = importRecord.startedAt || new Date().toISOString()
    importRecord = await updateRestDocument(
      config.recRegistrationImportsCollectionId,
      importId,
      {
        status: "processing",
        startedAt,
        completedAt: null,
        errorMessage: null,
      }
    )
    const [conference, allRegistrations] = await Promise.all([
      getConference(importRecord.conferenceId),
      listAllDocuments(config.recRegistrationsCollectionId),
    ])
    const legacyRegistrations = registrationMap(allRegistrations)
    const pendingResponse = await listRestDocuments(
      config.recRegistrationImportRowsCollectionId,
      [
        Query.equal("importId", importId),
        Query.equal("status", ["pending", "processing"]),
        Query.orderAsc("rowNumber"),
        Query.limit(COMMIT_BATCH_SIZE),
      ]
    )

    await processPendingRows(
      importRecord,
      pendingResponse.documents || [],
      legacyRegistrations
    )
    await deliverPendingEmails(importRecord, conference)

    const summary = await summarizeImportRows(importId)
    const hasMore = summary.pendingCount > 0 || summary.pendingEmailCount > 0
    let reconciliationError = ""

    if (!hasMore) {
      try {
        await reconcileConferenceCounts(conference)
      } catch (error) {
        console.error("REC registration count reconciliation failed", error)
        reconciliationError = "Conference registration counters could not be reconciled."
      }
    }

    const completedWithErrors = (
      summary.failedCount > 0 ||
      summary.emailsFailed > 0 ||
      Boolean(reconciliationError)
    )
    const status = hasMore
      ? "processing"
      : completedWithErrors
        ? "completed_with_errors"
        : "completed"
    await updateRestDocument(config.recRegistrationImportsCollectionId, importId, {
      status,
      ...importSummaryUpdate(summary),
      completedAt: hasMore ? null : new Date().toISOString(),
      errorMessage: completionErrorMessage(summary, reconciliationError),
    })

    return {
      ...(await getRegistrationImport(importId, { page: 1, limit: DEFAULT_PAGE_LIMIT })),
      hasMore,
      processedThisBatch: (pendingResponse.documents || []).length,
    }
  }, { ttlMs: 180000 })
}

export async function retryRegistrationImportEmails(importId) {
  return withLock(`registration-import:${importId}`, async () => {
    let importRecord = await getRestDocument(config.recRegistrationImportsCollectionId, importId)
    if (!importRecord.sendEmails) {
      throw importError(
        409,
        "emails_not_enabled",
        "Email delivery was not selected for this import."
      )
    }

    const pendingEmailsExist = await hasRowsWithStatus(
      importId,
      "emailStatus",
      "pending"
    )
    if (!pendingEmailsExist) {
      const failedEmails = await listAllDocuments(
        config.recRegistrationImportRowsCollectionId,
        [
          Query.equal("importId", importId),
          Query.equal("emailStatus", "failed"),
        ]
      )
      await runWithConcurrency(failedEmails, 8, (row) =>
        updateRestDocument(config.recRegistrationImportRowsCollectionId, row.$id, {
          emailStatus: "pending",
          emailError: null,
        })
      )
    }

    const conference = await getConference(importRecord.conferenceId)
    await deliverPendingEmails(importRecord, conference)
    const summary = await summarizeImportRows(importId)
    const hasMore = summary.pendingEmailCount > 0
    const status = hasMore
      ? "processing"
      : summary.failedCount || summary.emailsFailed
        ? "completed_with_errors"
        : "completed"
    importRecord = await updateRestDocument(
      config.recRegistrationImportsCollectionId,
      importId,
      {
        status,
        ...importSummaryUpdate(summary),
        completedAt: hasMore ? null : new Date().toISOString(),
        errorMessage: completionErrorMessage(summary),
      }
    )

    return {
      ...(await getRegistrationImport(importId, { page: 1, limit: DEFAULT_PAGE_LIMIT })),
      import: serializeImport(importRecord),
      hasMore,
    }
  }, { ttlMs: 180000 })
}

export async function buildRegistrationImportErrorCsv(importId) {
  const importRecord = serializeImport(
    await getRestDocument(config.recRegistrationImportsCollectionId, importId)
  )
  const rows = await listAllDocuments(config.recRegistrationImportRowsCollectionId, [
    Query.equal("importId", importId),
    Query.orderAsc("rowNumber"),
  ])
  const reportRows = rows.filter(
    (row) =>
      ["invalid", "failed"].includes(row.status) ||
      row.emailStatus === "failed"
  )
  const sourceHeaders = getRegistrationImportDownloadHeaders(importRecord.templateType)
  const fields = [
    ...sourceHeaders,
    "ImportRow",
    "ImportStatus",
    "ImportAction",
    "ImportErrors",
    "EmailStatus",
    "EmailError",
  ]
  const data = reportRows.map((row) => {
    const savedPayload = parseJson(row.payloadJson, {})
    const source = savedPayload?.source || {}
    const report = Object.fromEntries(
      sourceHeaders.map((header) => [
        header,
        protectCsvSpreadsheetValue(source[header] || ""),
      ])
    )
    return {
      ...report,
      ImportRow: row.rowNumber,
      ImportStatus: row.status,
      ImportAction: row.action,
      ImportErrors: protectCsvSpreadsheetValue(row.errorMessage || ""),
      EmailStatus: row.emailStatus,
      EmailError: protectCsvSpreadsheetValue(row.emailError || ""),
    }
  })

  return {
    fileName: `rec-${importRecord.conferenceYear}-import-${importId}-issues.csv`,
    csv: `\uFEFF${Papa.unparse({ fields, data })}\r\n`,
    count: reportRows.length,
  }
}
