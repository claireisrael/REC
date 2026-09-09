import assert from "node:assert/strict"
import test from "node:test"
import {
  REC_IMPORT_TEMPLATE_TYPES,
  addDuplicateRegistrationImportErrors,
  determineRegistrationImportAction,
  getCouponImportValidationErrors,
  getRegistrationImportHeaders,
  getRegistrationImportDownloadHeaders,
  getRegistrationImportSampleRows,
  protectCsvSpreadsheetValue,
  validateAndMapRegistrationImportRow,
  validateRegistrationImportHeaders,
} from "../lib/rec-conference/registration-import-rules.mjs"
import {
  getRecBadgeConferenceTitle,
  normalizeRecOptionalSessions,
} from "../lib/rec-conference/registration-tracks.mjs"

const conferenceDays = [
  { label: "Day 1", date: "2026-10-19" },
  { label: "Day 2", date: "2026-10-20" },
  { label: "Day 3", date: "2026-10-21" },
]

const validRow = {
  Title: "Eng.",
  FirstName: "Amina",
  OtherName: "",
  LastName: "Nabirye",
  Email: " AMINA@EXAMPLE.COM ",
  Phone: "+256700000001",
  OtherPhone: "",
  OtherEmail: "",
  Organization: "Example Energy",
  Sector: "Private",
  City: "Kampala",
  StateRegion: "Central",
  Country: "Uganda",
  DaysAttending: "Day 1|Day 3",
  VisaLetterRequired: "No",
  PassportNumber: "",
  AdditionalComments: "",
}

test("standard and sponsored template headers are strict and predictable", () => {
  const standard = getRegistrationImportHeaders(REC_IMPORT_TEMPLATE_TYPES.STANDARD)
  const sponsored = getRegistrationImportHeaders(REC_IMPORT_TEMPLATE_TYPES.SPONSORED)

  assert.equal(standard.includes("CouponCode"), false)
  assert.equal(sponsored.at(-1), "CouponCode")
  assert.deepEqual(
    validateRegistrationImportHeaders(standard, REC_IMPORT_TEMPLATE_TYPES.STANDARD),
    { valid: true, missing: [], unexpected: [], expected: standard }
  )

  const mismatch = validateRegistrationImportHeaders(
    sponsored,
    REC_IMPORT_TEMPLATE_TYPES.STANDARD
  )
  assert.equal(mismatch.valid, false)
  assert.deepEqual(mismatch.unexpected, ["CouponCode"])
})

test("download templates include four conference-aware sample attendees", () => {
  const standard = getRegistrationImportSampleRows(
    REC_IMPORT_TEMPLATE_TYPES.STANDARD,
    conferenceDays
  )
  const sponsored = getRegistrationImportSampleRows(
    REC_IMPORT_TEMPLATE_TYPES.SPONSORED,
    conferenceDays
  )

  assert.equal(standard.length, 4)
  assert.deepEqual(
    standard.map((row) => row.DaysAttending),
    ["All", "Day 1", "Day 1|Day 2", "Day 3"]
  )
  assert.equal(standard.some((row) => Object.hasOwn(row, "CouponCode")), false)
  assert.equal(sponsored.length, 4)
  assert.equal(sponsored.every((row) => row.CouponCode === "SAMPLE001"), true)
})

test("unchanged sample attendees cannot be imported", () => {
  const [sample] = getRegistrationImportSampleRows(
    REC_IMPORT_TEMPLATE_TYPES.STANDARD,
    conferenceDays
  )
  const result = validateAndMapRegistrationImportRow(sample, {
    templateType: REC_IMPORT_TEMPLATE_TYPES.STANDARD,
    conferenceDays,
    validCountries: ["Uganda", "Kenya"],
  })

  assert.equal(result.valid, false)
  assert.equal(
    result.errors.includes("Replace or remove the sample attendee row before importing."),
    true
  )
})

test("attendee rows are normalized and use explicit Kampala event timestamps", () => {
  const result = validateAndMapRegistrationImportRow(validRow, {
    templateType: REC_IMPORT_TEMPLATE_TYPES.STANDARD,
    conferenceDays,
    validCountries: ["Uganda", "Kenya"],
  })

  assert.equal(result.valid, true)
  assert.equal(result.normalizedEmail, "amina@example.com")
  assert.deepEqual(result.payload.sector, ["Private"])
  assert.deepEqual(result.payload.daysAttending, ["Day 1", "Day 3"])
  assert.deepEqual(result.payload.additionalSessions, [])
  assert.equal(result.payload.eventStart, "2026-10-19T05:00:00.000Z")
  assert.equal(result.payload.eventEnd, "2026-10-21T15:00:00.000Z")
  assert.equal(result.payload.registrationType, "Attendee")
})

test("sponsored rows require a coupon and conditional visa details", () => {
  const result = validateAndMapRegistrationImportRow(
    {
      ...validRow,
      CouponCode: "",
      VisaLetterRequired: "Yes",
    },
    {
      templateType: REC_IMPORT_TEMPLATE_TYPES.SPONSORED,
      conferenceDays,
      validCountries: ["Uganda"],
    }
  )

  assert.equal(result.valid, false)
  assert.equal(result.errors.includes("CouponCode is required for the coupon-sponsored template."), true)
  assert.equal(
    result.errors.includes("PassportNumber is required when VisaLetterRequired is Yes."),
    true
  )
})

test("unknown attendance days and duplicate emails block the complete import", () => {
  const first = validateAndMapRegistrationImportRow(
    { ...validRow, DaysAttending: "Day 4" },
    { conferenceDays, validCountries: ["Uganda"] }
  )
  assert.equal(first.valid, false)
  assert.equal(first.errors.some((error) => error.includes("unknown day")), true)

  const cleanFirst = validateAndMapRegistrationImportRow(validRow, {
    conferenceDays,
    validCountries: ["Uganda"],
  })
  const cleanSecond = validateAndMapRegistrationImportRow(
    { ...validRow, FirstName: "Another" },
    { conferenceDays, validCountries: ["Uganda"] }
  )
  const duplicates = addDuplicateRegistrationImportErrors([cleanFirst, cleanSecond])
  assert.equal(duplicates.every((row) => row.valid === false), true)
})

test("existing attendee actions preserve the selected conference policy", () => {
  assert.equal(determineRegistrationImportAction(null, 2026, false), "create")
  assert.equal(
    determineRegistrationImportAction({ conferenceYears: [2025] }, 2026, false),
    "register_existing"
  )
  assert.equal(
    determineRegistrationImportAction({ conferenceYears: [2026] }, 2026, false),
    "skip"
  )
  assert.equal(
    determineRegistrationImportAction({ conferenceYears: [2026] }, 2026, true),
    "update_existing"
  )
})

test("coupon validation enforces attendee type, conference and aggregate capacity", () => {
  const validCoupon = {
    type: "attendee",
    conference: 2026,
    organization: "Sponsor Ltd",
    usersLeft: 3,
    isActive: true,
  }
  assert.deepEqual(
    getCouponImportValidationErrors(validCoupon, {
      couponCode: "SPONSOR1",
      conferenceYear: 2026,
      requiredSeats: 3,
    }),
    []
  )

  const errors = getCouponImportValidationErrors(
    { ...validCoupon, usersLeft: 2 },
    {
      couponCode: "SPONSOR1",
      conferenceYear: 2026,
      requiredSeats: 3,
    }
  )
  assert.equal(errors.includes("CouponCode does not have enough remaining seats."), true)
})

test("CSV error exports neutralize spreadsheet formulas", () => {
  assert.equal(protectCsvSpreadsheetValue("=HYPERLINK(\"bad\")"), "'=HYPERLINK(\"bad\")")
  assert.equal(protectCsvSpreadsheetValue("Amina"), "Amina")
})

test("AdditionalSessions is optional in import files and does not break existing templates", () => {
  const standard = getRegistrationImportHeaders(REC_IMPORT_TEMPLATE_TYPES.STANDARD)
  assert.equal(standard.includes("AdditionalSessions"), false)
  assert.equal(
    validateRegistrationImportHeaders(
      [...standard, "AdditionalSessions"],
      REC_IMPORT_TEMPLATE_TYPES.STANDARD
    ).valid,
    true
  )
  assert.equal(
    getRegistrationImportDownloadHeaders(REC_IMPORT_TEMPLATE_TYPES.STANDARD).includes("AdditionalSessions"),
    true
  )

  const selected = validateAndMapRegistrationImportRow(
    { ...validRow, AdditionalSessions: "Business Forum / Marketplace" },
    {
      templateType: REC_IMPORT_TEMPLATE_TYPES.STANDARD,
      conferenceDays,
      validCountries: ["Uganda"],
    }
  )
  assert.equal(selected.valid, true)
  assert.deepEqual(selected.payload.additionalSessions, ["business_forum"])
})

test("Business Forum badge titles apply only when that optional session is selected", () => {
  const conference = { year: 2026, title: "Renewable Energy Conference & Expo 2026", shortName: "REC 2026" }
  assert.equal(
    getRecBadgeConferenceTitle(conference, { additionalSessions: [] }),
    "Renewable Energy Conference & Expo 2026"
  )
  assert.equal(
    getRecBadgeConferenceTitle(conference, { additionalSessions: ["business_forum"] }),
    "REC 2026 & Expo | Business Forum"
  )
  assert.deepEqual(
    normalizeRecOptionalSessions("Yes"),
    ["business_forum"]
  )
})
