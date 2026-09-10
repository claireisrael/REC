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
  formatRecParticipantCategory,
  formatRecParticipantCategoryTag,
  getRecBadgeConferenceTitle,
  getRecOptionalSessionCopy,
  getRecParticipantCategoryDirection,
  normalizeRecOptionalSessions,
  recParticipantCategoryQueryPlan,
  registrationMatchesParticipantCategory,
  applyRecParticipantCategoryQueries,
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
    { ...validRow, AdditionalSessions: "UG-EU Business Forum" },
    {
      templateType: REC_IMPORT_TEMPLATE_TYPES.STANDARD,
      conferenceDays,
      validCountries: ["Uganda"],
    }
  )
  assert.equal(selected.valid, true)
  assert.deepEqual(selected.payload.additionalSessions, ["business_forum"])

  const marketplace = validateAndMapRegistrationImportRow(
    { ...validRow, AdditionalSessions: "African Energy Market Place" },
    {
      templateType: REC_IMPORT_TEMPLATE_TYPES.STANDARD,
      conferenceDays,
      validCountries: ["Uganda"],
    }
  )
  assert.equal(marketplace.valid, true)
  assert.deepEqual(marketplace.payload.additionalSessions, ["marketplace"])

  const both = validateAndMapRegistrationImportRow(
    { ...validRow, AdditionalSessions: "REC26, UG-EU BF & AEMP" },
    {
      templateType: REC_IMPORT_TEMPLATE_TYPES.STANDARD,
      conferenceDays,
      validCountries: ["Uganda"],
    }
  )
  assert.equal(both.valid, true)
  assert.deepEqual(both.payload.additionalSessions, ["business_forum", "marketplace"])

  const conferenceOnly = validateAndMapRegistrationImportRow(
    { ...validRow, AdditionalSessions: "REC26" },
    {
      templateType: REC_IMPORT_TEMPLATE_TYPES.STANDARD,
      conferenceDays,
      validCountries: ["Uganda"],
    }
  )
  assert.equal(conferenceOnly.valid, true)
  assert.deepEqual(conferenceOnly.payload.additionalSessions, [])
})

test("badge title stays REC26 & Expo and the category sits under the QR as a tag", () => {
  const conference = { year: 2026, title: "Renewable Energy Conference 2026 & Expo", shortName: "REC 2026" }
  assert.equal(getRecBadgeConferenceTitle(conference), "REC26 & Expo")
  assert.equal(
    getRecBadgeConferenceTitle(conference, { additionalSessions: ["marketplace"] }),
    "REC26 & Expo"
  )
  assert.equal(formatRecParticipantCategory({ additionalSessions: [] }, 2026), "REC26 & Expo")
  assert.equal(formatRecParticipantCategory({ additionalSessions: ["business_forum"] }, 2026), "REC26 & UG-EU BF")
  assert.equal(formatRecParticipantCategory({ additionalSessions: ["marketplace"] }, 2026), "REC26 & AEMP")
  assert.equal(
    formatRecParticipantCategory({ additionalSessions: ["business_forum", "marketplace"] }, 2026),
    "REC26, UG-EU BF & AEMP"
  )
  assert.equal(
    formatRecParticipantCategoryTag({ additionalSessions: ["business_forum"] }, 2026),
    "#REC26 & UG-EU BF"
  )
  assert.equal(getRecParticipantCategoryDirection({ additionalSessions: [] }), "Main conference and Expo")
  assert.equal(
    getRecParticipantCategoryDirection({ additionalSessions: ["marketplace"] }),
    "African Energy Market Place"
  )
  assert.deepEqual(normalizeRecOptionalSessions("REC26 & Expo"), [])
  assert.deepEqual(normalizeRecOptionalSessions("REC26 & UG-EU BF"), ["business_forum"])
  assert.deepEqual(normalizeRecOptionalSessions("REC26 & AEMP"), ["marketplace"])
  assert.deepEqual(normalizeRecOptionalSessions("African Energy Market Place"), ["marketplace"])
  assert.deepEqual(
    normalizeRecOptionalSessions("Business Forum / Marketplace"),
    ["business_forum", "marketplace"]
  )
})

test("participant category copy tells people to choose where they will be", () => {
  assert.equal(getRecOptionalSessionCopy().intro, "Choose where you will be.")
})

test("registrations can be filtered by the four participant categories", () => {
  const recOnly = { additionalSessions: [] }
  const forum = { additionalSessions: ["business_forum"] }
  const aemp = { additionalSessions: ["marketplace"] }
  const both = { additionalSessions: ["business_forum", "marketplace"] }
  const missing = { additionalSessions: null }

  assert.equal(registrationMatchesParticipantCategory(recOnly, ""), true)
  assert.equal(registrationMatchesParticipantCategory(recOnly, "rec"), true)
  assert.equal(registrationMatchesParticipantCategory(missing, "rec"), true)
  assert.equal(registrationMatchesParticipantCategory(forum, "ug_eu_bf"), true)
  assert.equal(registrationMatchesParticipantCategory(both, "ug_eu_bf"), false)
  assert.equal(registrationMatchesParticipantCategory(aemp, "aemp"), true)
  assert.equal(registrationMatchesParticipantCategory(both, "ug_eu_bf_aemp"), true)
  assert.equal(registrationMatchesParticipantCategory(forum, "ug_eu_bf_aemp"), false)

  assert.deepEqual(recParticipantCategoryQueryPlan("rec"), {
    isNullAttribute: "additionalSessions",
    contains: [],
    notContains: [],
  })
  assert.deepEqual(recParticipantCategoryQueryPlan("ug_eu_bf").contains, ["business_forum"])
  assert.deepEqual(recParticipantCategoryQueryPlan("ug_eu_bf").notContains, ["marketplace"])
  assert.deepEqual(recParticipantCategoryQueryPlan("aemp").contains, ["marketplace"])
  assert.deepEqual(recParticipantCategoryQueryPlan("aemp").notContains, ["business_forum"])
  assert.deepEqual(recParticipantCategoryQueryPlan("ug_eu_bf_aemp").contains, ["business_forum", "marketplace"])
  assert.deepEqual(recParticipantCategoryQueryPlan("ug_eu_bf_aemp").notContains, [])
  assert.equal(recParticipantCategoryQueryPlan(""), null)

  const queries = []
  applyRecParticipantCategoryQueries({
    contains: (attribute, value) => ["contains", attribute, value],
    notContains: (attribute, value) => ["notContains", attribute, value],
    isNull: (attribute) => ["isNull", attribute],
  }, queries, "ug_eu_bf")
  assert.deepEqual(queries, [
    ["contains", "additionalSessions", "business_forum"],
    ["notContains", "additionalSessions", "marketplace"],
  ])
})
