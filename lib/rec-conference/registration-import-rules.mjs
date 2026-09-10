import { formatRecEdition } from "./rec-edition.mjs"
import { normalizeRecOptionalSessions, recOptionalSessionImportHint } from "./registration-tracks.mjs"

export const REC_IMPORT_TEMPLATE_TYPES = Object.freeze({
  STANDARD: "standard",
  SPONSORED: "sponsored",
})

export const REC_IMPORT_SECTORS = Object.freeze([
  "Public",
  "Private",
  "Civil Society Organization",
  "Academia",
  "Other",
])

export const REC_IMPORT_TITLES = Object.freeze([
  "Dr.",
  "Mr.",
  "Ms.",
  "Mrs.",
  "Rev.",
  "Prof.",
  "Eng.",
  "Prof.Eng.",
])

export const REC_IMPORT_STANDARD_HEADERS = Object.freeze([
  "Title",
  "FirstName",
  "OtherName",
  "LastName",
  "Email",
  "Phone",
  "OtherPhone",
  "OtherEmail",
  "Organization",
  "Sector",
  "City",
  "StateRegion",
  "Country",
  "DaysAttending",
  "VisaLetterRequired",
  "PassportNumber",
  "AdditionalComments",
])

export const REC_IMPORT_SPONSORED_HEADERS = Object.freeze([
  ...REC_IMPORT_STANDARD_HEADERS,
  "CouponCode",
])

export const REC_IMPORT_OPTIONAL_HEADERS = Object.freeze([
  "AdditionalSessions",
])

const FIELD_LIMITS = Object.freeze({
  Title: 49,
  FirstName: 49,
  OtherName: 49,
  LastName: 49,
  Email: 320,
  Phone: 25,
  OtherPhone: 25,
  OtherEmail: 320,
  Organization: 500,
  Sector: 100,
  City: 49,
  StateRegion: 60,
  Country: 70,
  PassportNumber: 15,
  AdditionalComments: 2000,
  CouponCode: 10,
})

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SAMPLE_EMAIL_DOMAIN = "@example.invalid"

const REGISTRATION_IMPORT_SAMPLE_ATTENDEES = Object.freeze([
  {
    Title: "Mr.",
    FirstName: "Daniel",
    OtherName: "",
    LastName: "Okello",
    Email: "attendee1@example.invalid",
    Phone: "+256700000001",
    OtherPhone: "",
    OtherEmail: "",
    Organization: "Sample Solar Ltd",
    Sector: "Private",
    City: "Kampala",
    StateRegion: "Central",
    Country: "Uganda",
    VisaLetterRequired: "No",
    PassportNumber: "",
    AdditionalComments: "",
  },
  {
    Title: "Dr.",
    FirstName: "Amina",
    OtherName: "N.",
    LastName: "Nsubuga",
    Email: "attendee2@example.invalid",
    Phone: "+256700000002",
    OtherPhone: "+256750000002",
    OtherEmail: "attendee2.office@example.invalid",
    Organization: "Sample Energy Agency",
    Sector: "Public",
    City: "Kampala",
    StateRegion: "Central",
    Country: "Uganda",
    VisaLetterRequired: "No",
    PassportNumber: "",
    AdditionalComments: "Vegetarian lunch requested",
  },
  {
    Title: "Ms.",
    FirstName: "Grace",
    OtherName: "Achieng",
    LastName: "Laker",
    Email: "attendee3@example.invalid",
    Phone: "+256700000003",
    OtherPhone: "",
    OtherEmail: "",
    Organization: "Sample Climate Network",
    Sector: "Civil Society Organization",
    City: "Gulu",
    StateRegion: "Northern",
    Country: "Uganda",
    VisaLetterRequired: "No",
    PassportNumber: "",
    AdditionalComments: "Requires wheelchair-accessible seating",
  },
  {
    Title: "Prof.",
    FirstName: "Peter",
    OtherName: "",
    LastName: "Mwangi",
    Email: "attendee4@example.invalid",
    Phone: "+254700000004",
    OtherPhone: "",
    OtherEmail: "",
    Organization: "Sample Renewable Institute",
    Sector: "Academia",
    City: "Nairobi",
    StateRegion: "Nairobi County",
    Country: "Kenya",
    VisaLetterRequired: "Yes",
    PassportNumber: "SAMPLE12345",
    AdditionalComments: "Visa invitation letter required",
  },
])

function cleanString(value) {
  return String(value ?? "").trim()
}

function canonicalLookup(values) {
  return new Map(values.map((value) => [normalizeLookupValue(value), value]))
}

export function normalizeLookupValue(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, "")
}

export function normalizeRegistrationEmail(value) {
  return cleanString(value).toLowerCase()
}

export function normalizeCouponCode(value) {
  return cleanString(value).toUpperCase()
}

export function getRegistrationImportHeaders(templateType) {
  return templateType === REC_IMPORT_TEMPLATE_TYPES.SPONSORED
    ? [...REC_IMPORT_SPONSORED_HEADERS]
    : [...REC_IMPORT_STANDARD_HEADERS]
}

export function getRegistrationImportDownloadHeaders(templateType) {
  const headers = getRegistrationImportHeaders(templateType)
  const insertAt = Math.max(headers.indexOf("AdditionalComments") + 1, headers.length)
  return [
    ...headers.slice(0, insertAt),
    ...REC_IMPORT_OPTIONAL_HEADERS,
    ...headers.slice(insertAt),
  ]
}

export function validateRegistrationImportHeaders(fields, templateType) {
  const expected = getRegistrationImportHeaders(templateType)
  const allowed = new Set([...expected, ...REC_IMPORT_OPTIONAL_HEADERS])
  const normalizedFields = (Array.isArray(fields) ? fields : [])
    .map((field) => cleanString(field).replace(/^\uFEFF/, ""))
    .filter(Boolean)
  const missing = expected.filter((field) => !normalizedFields.includes(field))
  const unexpected = normalizedFields.filter((field) => !allowed.has(field))

  return {
    valid: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected,
    expected,
  }
}

export function parseConferenceDays(value) {
  if (Array.isArray(value)) return value
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getRegistrationImportSampleRows(templateType, conferenceDays = []) {
  const dayLabels = parseConferenceDays(conferenceDays)
    .map((day) => cleanString(day?.label || day?.name))
    .filter(Boolean)
  const attendanceExamples = [
    "All",
    dayLabels[0] || "All",
    dayLabels.length > 1 ? `${dayLabels[0]}|${dayLabels[1]}` : "All",
    dayLabels.at(-1) || "All",
  ]

  return REGISTRATION_IMPORT_SAMPLE_ATTENDEES.map((attendee, index) => ({
    ...attendee,
    DaysAttending: attendanceExamples[index],
    AdditionalSessions: index === 1 ? "REC26 & UG-EU BF" : index === 2 ? "REC26 & AEMP" : index === 3 ? "REC26, UG-EU BF & AEMP" : "REC26 & Expo",
    ...(templateType === REC_IMPORT_TEMPLATE_TYPES.SPONSORED
      ? { CouponCode: "SAMPLE001" }
      : {}),
  }))
}

export function parseImportBoolean(value, { defaultValue = false } = {}) {
  const normalized = cleanString(value).toLowerCase()
  if (!normalized) return { valid: true, value: defaultValue }
  if (["yes", "y", "true", "1"].includes(normalized)) return { valid: true, value: true }
  if (["no", "n", "false", "0"].includes(normalized)) return { valid: true, value: false }
  return { valid: false, value: defaultValue }
}

function validateLength(row, field, errors) {
  const value = cleanString(row[field])
  const limit = FIELD_LIMITS[field]
  if (limit && value.length > limit) {
    errors.push(`${field} must not exceed ${limit} characters.`)
  }
  return value
}

function resolveConferenceDays(rawValue, conferenceDays, errors) {
  const configuredDays = parseConferenceDays(conferenceDays)
    .map((day) => ({
      label: cleanString(day?.label || day?.name),
      date: cleanString(day?.date).slice(0, 10),
    }))
    .filter((day) => day.label)
  const dayLookup = new Map(
    configuredDays.map((day) => [normalizeLookupValue(day.label), day])
  )
  const raw = cleanString(rawValue)

  if (!raw) {
    errors.push("DaysAttending is required.")
    return []
  }
  if (!configuredDays.length) {
    errors.push("The selected conference does not have configured attendance days.")
    return []
  }

  const normalizedRaw = normalizeLookupValue(raw)
  const requested = ["all", "alldays"].includes(normalizedRaw)
    ? configuredDays
    : dayLookup.has(normalizedRaw)
      ? [dayLookup.get(normalizedRaw)]
      : raw
          .split(/[|;]/)
          .map((part) => dayLookup.get(normalizeLookupValue(part)))
          .filter(Boolean)
  const requestedTokens = ["all", "alldays"].includes(normalizedRaw)
    ? configuredDays.map((day) => normalizeLookupValue(day.label))
    : raw.split(/[|;]/).map(normalizeLookupValue).filter(Boolean)
  const unknown = requestedTokens.filter((token) => !dayLookup.has(token))

  if (unknown.length) {
    const validLabels = configuredDays.map((day) => day.label).join(", ")
    errors.push(`DaysAttending contains an unknown day. Use: ${validLabels}.`)
  }

  const unique = Array.from(new Map(requested.map((day) => [day.label, day])).values())
  if (!unique.length && !unknown.length) {
    errors.push("At least one conference day is required.")
  }
  if (unique.some((day) => !day.date)) {
    errors.push("Every selected conference day must have a configured date.")
  }

  return unique
}

export function buildKampalaAttendanceRange(selectedDays) {
  const dates = (Array.isArray(selectedDays) ? selectedDays : [])
    .map((day) => cleanString(day?.date).slice(0, 10))
    .filter(Boolean)
    .sort()

  if (!dates.length) return { eventStart: null, eventEnd: null }

  return {
    eventStart: new Date(`${dates[0]}T08:00:00+03:00`).toISOString(),
    eventEnd: new Date(`${dates.at(-1)}T18:00:00+03:00`).toISOString(),
  }
}

export function validateAndMapRegistrationImportRow(row, context = {}) {
  const errors = []
  const templateType = context.templateType || REC_IMPORT_TEMPLATE_TYPES.STANDARD
  const title = validateLength(row, "Title", errors)
  const firstName = validateLength(row, "FirstName", errors)
  const otherName = validateLength(row, "OtherName", errors)
  const lastName = validateLength(row, "LastName", errors)
  const email = normalizeRegistrationEmail(validateLength(row, "Email", errors))
  const phone = validateLength(row, "Phone", errors)
  const otherPhone = validateLength(row, "OtherPhone", errors)
  const otherEmail = normalizeRegistrationEmail(validateLength(row, "OtherEmail", errors))
  const organization = validateLength(row, "Organization", errors)
  const sectorInput = validateLength(row, "Sector", errors)
  const city = validateLength(row, "City", errors)
  const stateRegion = validateLength(row, "StateRegion", errors)
  const countryInput = validateLength(row, "Country", errors)
  const passportNumber = validateLength(row, "PassportNumber", errors)
  const additionalComments = validateLength(row, "AdditionalComments", errors)
  const additionalSessions = parseOptionalSessions(row.AdditionalSessions, errors)
  const couponCode = normalizeCouponCode(validateLength(row, "CouponCode", errors))

  const titleValue = canonicalLookup(REC_IMPORT_TITLES).get(normalizeLookupValue(title))
  if (!title) errors.push("Title is required.")
  else if (!titleValue) errors.push(`Title must be one of: ${REC_IMPORT_TITLES.join(", ")}.`)
  if (!firstName) errors.push("FirstName is required.")
  if (!lastName) errors.push("LastName is required.")
  if (!email || !EMAIL_PATTERN.test(email)) errors.push("A valid Email is required.")
  if (!phone) errors.push("Phone is required.")
  if (otherEmail && !EMAIL_PATTERN.test(otherEmail)) errors.push("OtherEmail must be a valid email address.")
  if (email.endsWith(SAMPLE_EMAIL_DOMAIN) || otherEmail.endsWith(SAMPLE_EMAIL_DOMAIN)) {
    errors.push("Replace or remove the sample attendee row before importing.")
  }
  if (!organization) errors.push("Organization is required.")
  if (!city) errors.push("City is required.")
  if (!stateRegion) errors.push("StateRegion is required.")

  const sector = canonicalLookup(REC_IMPORT_SECTORS).get(normalizeLookupValue(sectorInput))
  if (!sectorInput) errors.push("Sector is required.")
  else if (!sector) errors.push(`Sector must be one of: ${REC_IMPORT_SECTORS.join(", ")}.`)

  const countryValues = Array.isArray(context.validCountries) ? context.validCountries : []
  const country = countryValues.length
    ? canonicalLookup(countryValues).get(normalizeLookupValue(countryInput))
    : countryInput
  if (!countryInput) errors.push("Country is required.")
  else if (!country) errors.push("Country is not recognized.")

  const visa = parseImportBoolean(row.VisaLetterRequired)
  if (!visa.valid) errors.push("VisaLetterRequired must be Yes or No.")
  if (visa.value && !passportNumber) {
    errors.push("PassportNumber is required when VisaLetterRequired is Yes.")
  }

  if (templateType === REC_IMPORT_TEMPLATE_TYPES.SPONSORED && !couponCode) {
    errors.push("CouponCode is required for the coupon-sponsored template.")
  }

  const selectedDays = resolveConferenceDays(row.DaysAttending, context.conferenceDays, errors)
  const { eventStart, eventEnd } = buildKampalaAttendanceRange(selectedDays)

  return {
    valid: errors.length === 0,
    errors,
    normalizedEmail: email,
    couponCode,
    payload: {
      email,
      title: titleValue || title,
      firstName,
      otherName: otherName || null,
      lastName,
      phone,
      otherPhone: otherPhone || null,
      otherEmail: otherEmail || null,
      organization,
      sector: sector ? [sector] : [],
      city,
      stateRegion,
      country: country || countryInput,
      registrationType: "Attendee",
      visaLetterRequired: visa.value,
      passportNumber: passportNumber || null,
      visaLetterSent: false,
      additionalComments: additionalComments || null,
      additionalSessions,
      daysAttending: selectedDays.map((day) => day.label),
      eventStart,
      eventEnd,
      exhibitionDetails: null,
    },
  }
}

export function addDuplicateRegistrationImportErrors(rows) {
  const counts = new Map()
  rows.forEach((row) => {
    if (!row.normalizedEmail) return
    counts.set(row.normalizedEmail, (counts.get(row.normalizedEmail) || 0) + 1)
  })

  return rows.map((row) => {
    if (!row.normalizedEmail || counts.get(row.normalizedEmail) < 2) return row
    const errors = [...row.errors, "Email appears more than once in this CSV file."]
    return { ...row, valid: false, errors }
  })
}

export function determineRegistrationImportAction(existingRegistration, conferenceYear, updateExisting) {
  if (!existingRegistration) return "create"

  const years = Array.isArray(existingRegistration.conferenceYears)
    ? existingRegistration.conferenceYears.map(Number)
    : []
  if (!years.includes(Number(conferenceYear))) return "register_existing"
  return updateExisting ? "update_existing" : "skip"
}

export function getCouponImportValidationErrors(coupon, options = {}) {
  const errors = []
  const requiresSeat = options.requiresSeat !== false
  const couponCode = normalizeCouponCode(options.couponCode)

  if (!coupon) return [`CouponCode ${couponCode || "(blank)"} was not found.`]
  if (String(coupon.type || "").toLowerCase() !== "attendee") {
    errors.push("CouponCode must be an attendee coupon.")
  }
  if (Number(coupon.conference) !== Number(options.conferenceYear)) {
    errors.push(`CouponCode is not valid for ${formatRecEdition(options.conferenceYear)}.`)
  }
  if (!cleanString(coupon.organization)) {
    errors.push("CouponCode does not have a sponsoring organization.")
  }
  if (requiresSeat && coupon.isActive === false) {
    errors.push("CouponCode is inactive.")
  }
  if (requiresSeat && Number(coupon.usersLeft || 0) < Number(options.requiredSeats || 1)) {
    errors.push("CouponCode does not have enough remaining seats.")
  }

  return errors
}

export function protectCsvSpreadsheetValue(value) {
  const text = String(value ?? "")
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function parseOptionalSessions(rawValue, errors) {
  const raw = cleanString(rawValue)
  if (!raw) return []

  const values = normalizeRecOptionalSessions(raw)
  const leftover = raw
    .split(/[|;]/)
    .map(normalizeLookupValue)
    .filter(Boolean)

  if (!values.length && leftover.length && leftover.some((token) => !/^(rec\d{2}|rec|conference|main|none|no|n|false|0)$/.test(token))) {
    errors.push(`AdditionalSessions must be blank, or one of: ${recOptionalSessionImportHint()}.`)
  }

  return values
}
