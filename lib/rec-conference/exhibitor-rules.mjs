import crypto from "node:crypto"
import Papa from "papaparse"

export class ExhibitorError extends Error {
  constructor(message, status = 400, fields = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}
export const EXHIBITOR_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "waitlisted",
  "approved",
  "confirmed",
  "rejected",
  "withdrawn",
  "cancelled"
]
export const RESERVED_STATUSES = ["approved", "confirmed"]
export const exhibitorId = (...parts) =>
  `ex_${crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 30)}`
export const normalizedEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
export const companyKey = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
export const parseExhibitorJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value || "")
  } catch {
    return fallback
  }
}
export const DEFAULT_EXHIBITION_SETTINGS = {
  enabled: false,
  applicationsOpen: false,
  couponRequired: false,
  opensAt: "",
  closesAt: "",
  capacity: 100,
  maxRepresentatives: 4,
  confirmationDays: 14,
  sectors: [
    "Public",
    "Private",
    "Civil Society",
    "Academia",
    "Cultural",
    "Religious",
    "Development Agency",
    "Financial Institution",
    "Other"
  ],
  categories: [
    "Solar systems",
    "Clean Cooking systems",
    "Productive use of Energy systems",
    "Agricultural products",
    "Energy innovations",
    "Energy services",
    "Other"
  ],
  consentVersion: "1",
  consentText:
    "I confirm that the information supplied is accurate and that I am authorized to submit this application and the representative details on behalf of this organization. I understand that submission does not guarantee exhibition space."
}
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function exhibitionSettings(input = {}, existing = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ExhibitorError("Provide exhibition settings as an object.")
  const result = { ...DEFAULT_EXHIBITION_SETTINGS, ...existing }
  for (const key of ["enabled", "applicationsOpen", "couponRequired"])
    if (Object.hasOwn(input, key)) result[key] = input[key] === true
  for (const [key, min, max] of [
    ["capacity", 1, 100000],
    ["maxRepresentatives", 1, 20],
    ["confirmationDays", 1, 90]
  ]) {
    if (Object.hasOwn(input, key)) result[key] = Number(input[key])
    if (
      !Number.isInteger(result[key]) ||
      result[key] < min ||
      result[key] > max
    )
      throw new ExhibitorError(`Invalid ${key}.`, 400, {
        [key]: `Use a whole number between ${min} and ${max}.`
      })
  }
  for (const key of ["opensAt", "closesAt"]) {
    if (Object.hasOwn(input, key)) {
      if (input[key] && !Number.isFinite(Date.parse(input[key])))
        throw new ExhibitorError(`Provide a valid ${key}.`, 400, {
          [key]: "Invalid date and time."
        })
      result[key] = input[key] ? new Date(input[key]).toISOString() : ""
    }
  }
  if (result.opensAt && result.closesAt && result.opensAt >= result.closesAt)
    throw new ExhibitorError("The closing time must follow the opening time.")
  for (const key of ["sectors", "categories"]) {
    if (Object.hasOwn(input, key))
      result[key] = [
        ...new Set(
          (Array.isArray(input[key]) ? input[key] : [])
            .map((x) => String(x).trim())
            .filter(Boolean)
        )
      ]
    if (
      !result[key].length ||
      result[key].length > 50 ||
      result[key].some((x) => x.length > 100)
    )
      throw new ExhibitorError(
        `Configure 1-50 ${key}, each no longer than 100 characters.`
      )
  }
  for (const [key, max] of [
    ["consentVersion", 40],
    ["consentText", 8000]
  ]) {
    if (Object.hasOwn(input, key)) result[key] = String(input[key] || "").trim()
    if (!result[key] || result[key].length > max)
      throw new ExhibitorError(`Provide ${key} (maximum ${max} characters).`)
  }
  if (
    existing.consentText &&
    existing.consentText !== result.consentText &&
    existing.consentVersion === result.consentVersion
  )
    throw new ExhibitorError(
      "Change the consent version when changing its text."
    )
  if (JSON.stringify(result).length > 16000)
    throw new ExhibitorError(
      "The combined settings exceed 16,000 characters. Shorten the option lists or declaration."
    )
  return result
}
export function applicationWindowOpen(settings, now = new Date()) {
  return (
    settings.enabled &&
    settings.applicationsOpen &&
    (!settings.opensAt || Date.parse(settings.opensAt) <= +now) &&
    (!settings.closesAt || Date.parse(settings.closesAt) >= +now)
  )
}
export function normalizeExhibitorApplication(
  input = {},
  settings = DEFAULT_EXHIBITION_SETTINGS,
  { draft = false, allowMissingPassport = false, conferenceDays, existingRepresentatives } = {}
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ExhibitorError("Provide the company application details.")
  const fields = {},
    data = {}
  const text = (target, key, value, max, required = false, path = key) => {
    const valueText = typeof value === "string" ? value.trim() : ""
    target[key] = valueText
    if (valueText.length > max)
      fields[path] = `Use no more than ${max} characters.`
    if (required && !draft && !valueText)
      fields[path] = "This field is required."
  }
  for (const [key, max, required] of [
    ["companyName", 250, true],
    ["companyEmail", 320, true],
    ["companyPhone", 30, true],
    ["country", 70],
    ["city", 49],
    ["stateRegion", 60],
    ["sector", 100, true],
    ["category", 100, true],
    ["proposal", 10000, true],
    ["requirements", 4000],
    ["website", 1000],
    ["association", 250]
  ])
    text(data, key, input[key], max, required)
  data.companyEmail = normalizedEmail(data.companyEmail)
  if (data.companyEmail && !emailPattern.test(data.companyEmail))
    fields.companyEmail = "Enter a valid company email address."
  if (data.website) {
    try {
      if (new URL(data.website).protocol !== "https:") throw Error()
    } catch {
      fields.website = "Use a full HTTPS website address."
    }
  }
  for (const [key, choices] of [
    ["sector", settings.sectors],
    ["category", settings.categories]
  ])
    if (data[key] && !choices.includes(data[key]))
      fields[key] = "Select a configured option."
  data.associationMember = input.associationMember === true
  if (data.associationMember && !data.association && !draft)
    fields.association = "Provide the association name."
  if (!data.associationMember) data.association = ""
  data.consentAccepted = input.consentAccepted === true
  data.visaSupportUnassigned = input.visaSupportUnassigned === true
  if (!draft && !data.consentAccepted)
    fields.consentAccepted =
      "Consent must be confirmed; it cannot be inferred from an import."
  data.representatives = (
    Array.isArray(input.representatives) ? input.representatives : []
  )
    .slice(0, 21)
    .map((value, index) => {
      const r = value && typeof value === "object" ? value : {}
      const representative = {
        id: /^[a-zA-Z0-9_-]{1,36}$/.test(r.id || "")
          ? r.id
          : crypto.randomUUID()
      }
      for (const [key, max, required] of [
        ["fullName", 180, true],
        ["title", 49],
        ["firstName", 49],
        ["lastName", 49],
        ["email", 320, true],
        ["phone", 25, true],
        ["passportNumber", 15]
      ])
        text(
          representative,
          key,
          r[key],
          max,
          required,
          `representatives.${index}.${key}`
        )
      representative.email = normalizedEmail(representative.email)
      if (representative.email && !emailPattern.test(representative.email))
        fields[`representatives.${index}.email`] =
          "Enter a valid email address."
      representative.visaSupport = r.visaSupport === true
      if (r.visaSupport !== undefined && typeof r.visaSupport !== "boolean") fields[`representatives.${index}.visaSupport`] = "Choose Yes or No for visa support."
      if (representative.visaSupport && !representative.passportNumber && !draft && !allowMissingPassport)
        fields[`representatives.${index}.passportNumber`] = "Provide this representative's passport number for visa support."
      representative.days = [
        ...new Set((Array.isArray(r.days) ? r.days : []).map(String))
      ]
      if (conferenceDays !== undefined) {
        const configured = typeof conferenceDays === "string" ? JSON.parse(conferenceDays || "[]") : conferenceDays
        const allowed = (configured || []).filter(day => day?.label && day?.date).map(day => day.label)
        const previous = existingRepresentatives?.find(rep => rep.id === representative.id)
        if (r.days === undefined && previous) representative.days = previous.days || []
        if (!representative.days.length && !previous) representative.days = allowed
        if (!allowed.length || !representative.days.length || representative.days.some(day => !allowed.includes(day)))
          fields[`representatives.${index}.days`] = "Select valid configured attendance days."
      }
      if (
        representative.days.length > 30 ||
        representative.days.some((d) => d.length > 200)
      )
        fields[`representatives.${index}.days`] =
          "Select valid conference days."
      return representative
    })
  if (!draft && !data.representatives.length)
    fields.representatives = "Add at least one representative."
  if (data.representatives.length > settings.maxRepresentatives)
    fields.representatives = `A maximum of ${settings.maxRepresentatives} representatives is permitted.`
  if (
    new Set(data.representatives.map((r) => r.id)).size !==
    data.representatives.length
  )
    fields.representatives = "Representative identifiers must be unique."
  const warnings = []
  if (data.visaSupportUnassigned) warnings.push("Clarify which representatives require visa support.")
  for (const representative of data.representatives)
    if (representative.visaSupport && !representative.passportNumber)
      warnings.push(`${representative.fullName || "Representative"}: passport required before visa processing.`)
  if (
    new Set(data.representatives.map((r) => r.email)).size !==
    data.representatives.length
  )
    warnings.push(
      "Representatives share an email address. Resolve their identities before badge activation."
    )
  if (!data.country || !data.city || !data.stateRegion)
    warnings.push(
      "Complete the company location before activating new representative registrations."
    )
  return { data, fields, warnings, valid: !Object.keys(fields).length }
}

export const representativeEmails = (data) => [...new Set((data.representatives || []).map(r => normalizedEmail(r.email)).filter(Boolean))]
export const materialExhibitionFields = ["companyName", "sector", "category", "proposal", "requirements"]
export function exhibitorChanges(before, after) {
  const changes = []
  const compare = (a, b, prefix = "") => {
    for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      if (key === "representatives" || key === "consentAccepted") continue
      if (JSON.stringify(a?.[key] ?? "") === JSON.stringify(b?.[key] ?? "")) continue
      changes.push({ field: `${prefix}${key}`, ...(key === "passportNumber" ? { redacted: true } : { before: a?.[key] ?? "", after: b?.[key] ?? "" }) })
    }
  }
  compare(before, after)
  const previous = new Map((before.representatives || []).map(r => [r.id, r]))
  const next = new Map((after.representatives || []).map(r => [r.id, r]))
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    if (!previous.has(id) || !next.has(id)) changes.push({ field: `representatives.${id}`, before: previous.has(id) ? "Present" : "Absent", after: next.has(id) ? "Present" : "Removed" })
    else compare(previous.get(id), next.get(id), `representatives.${id}.`)
  }
  return changes
}
const transitions = {
  draft: ["submitted", "withdrawn"],
  submitted: [
    "under_review",
    "changes_requested",
    "waitlisted",
    "approved",
    "rejected",
    "withdrawn"
  ],
  under_review: [
    "changes_requested",
    "waitlisted",
    "approved",
    "rejected",
    "withdrawn"
  ],
  changes_requested: ["submitted", "withdrawn", "rejected"],
  waitlisted: ["under_review", "approved", "rejected", "withdrawn"],
  approved: ["confirmed", "cancelled", "withdrawn", "changes_requested"],
  confirmed: ["cancelled", "withdrawn", "changes_requested"],
  rejected: ["under_review"],
  cancelled: ["under_review"],
  withdrawn: ["under_review"]
}
export function assertExhibitorTransition(from, to, actor, reason = "") {
  if (!transitions[from]?.includes(to))
    throw new ExhibitorError(`Cannot change ${from} to ${to}.`, 409)
  if (
    actor.kind === "applicant" &&
    !["submitted", "confirmed", "withdrawn"].includes(to)
  )
    throw new ExhibitorError("This action requires REC management access.", 403)
  if (
    actor.kind !== "applicant" &&
    !actor.manage &&
    !["under_review", "changes_requested"].includes(to)
  )
    throw new ExhibitorError("This decision requires REC manage access.", 403)
  if (
    ["changes_requested", "rejected", "cancelled", "withdrawn"].includes(to) &&
    !String(reason).trim()
  )
    throw new ExhibitorError("Provide a reason for this change.", 400, {
      reason: "A reason is required."
    })
}
export function allowedExhibitorActions(status, actor) {
  if (actor.kind !== "applicant" && !actor.edit) return []
  return (transitions[status] || []).filter((to) =>
    actor.kind === "applicant"
      ? ["submitted", "confirmed", "withdrawn"].includes(to)
      : actor.manage || ["under_review", "changes_requested"].includes(to)
  )
}
export function allowedExhibitorOverrideActions(status, actor) {
  if (actor?.kind !== "staff" || !actor.edit || !actor.manage || !EXHIBITOR_STATUSES.includes(status) || status === "confirmed") return []
  return status === "approved" ? ["confirmed"] : ["approved", "confirmed"]
}
export function assertExhibitorOverride(input, actor) {
  if (actor?.kind !== "staff" || !actor.edit || !actor.manage)
    throw new ExhibitorError("REC manage access is required for an administrative override.", 403)
  const reason = typeof input.overrideReason === "string" ? input.overrideReason.trim() : ""
  const fields = {}
  if (reason.length < 10 || reason.length > 2000)
    fields.overrideReason = "Explain the override in 10-2,000 characters."
  if (input.acknowledgeOverride !== true)
    fields.acknowledgeOverride = "Acknowledge the risk of approving incomplete or incorrect information."
  if (Object.keys(fields).length)
    throw new ExhibitorError("Provide an override reason and acknowledge the risks before continuing.", 400, fields)
  return reason
}
export const EXHIBITOR_CSV_HEADERS = [
  "CompanyName",
  "CompanyEmail",
  "CompanyPhone",
  "Sector",
  "Category",
  "Proposal",
  "Country",
  "City",
  "StateRegion",
  "Website",
  "Requirements",
  "AssociationMember",
  "Association",
  "ConsentAccepted",
  "Representative1Name",
  "Representative1Email",
  "Representative1Phone",
  "Representative2Name",
  "Representative2Email",
  "Representative2Phone",
  "Representative1VisaSupport",
  "Representative1PassportNumber",
  "Representative1Days",
  "Representative2VisaSupport",
  "Representative2PassportNumber",
  "Representative2Days",
  "Representative1Title", "Representative1FirstName", "Representative1LastName",
  "Representative2Title", "Representative2FirstName", "Representative2LastName", "CouponCode"
]
export function exhibitorCsvTemplate() {
  return Papa.unparse({
    fields: EXHIBITOR_CSV_HEADERS,
    data: [
      [
        "Example Solar Ltd",
        "company@example.com",
        "+256700000001",
        "Private",
        "Solar systems",
        "Demonstration of solar water pumping",
        "Uganda",
        "Kampala",
        "Central",
        "https://example.com",
        "One electrical outlet",
        "No",
        "",
        "",
        "Alex Example",
        "alex@example.com",
        "+256700000002",
        "Sam Example",
        "sam@example.com",
        "+256700000003", "No", "", "All", "Yes", "SAMPLE12345", "All",
        "", "Alex", "Example", "", "Sam", "Example", ""
      ]
    ]
  })
}
export function parseExhibitorCsv(csv, optionLabels = {}) {
  const parsed = Papa.parse(String(csv), { skipEmptyLines: "greedy" })
  if (parsed.errors.length || parsed.data.length < 2)
    throw new ExhibitorError(
      "Provide a valid CSV containing a heading row and applications."
    )
  const [headings, ...rows] = parsed.data
  if (rows.length > 500)
    throw new ExhibitorError("Import a maximum of 500 companies at a time.")
  const legacy = headings.includes("Company name")
  const required = legacy
    ? ["Company name", "Company Email", "What do you intend to exhibit?"]
    : ["CompanyName", "CompanyEmail", "Proposal"]
  if (required.some((x) => !headings.includes(x)))
    throw new ExhibitorError(
      "The CSV does not match the exhibitor template or NREP expression-of-interest export."
    )
  return rows.map((row, index) => {
    const get = (name, occurrence = 0) =>
      String(
        row[
          headings.map((h, i) => (h === name ? i : -1)).filter((i) => i >= 0)[
            occurrence
          ]
        ] || ""
      ).trim()
    const label = (value) =>
      (optionLabels[value] || value) === "Others"
        ? "Other"
        : optionLabels[value] || value
    const representatives = [1, 2]
      .map((n) => ({
        title: get(`Representative${n}Title`),
        firstName: get(`Representative${n}FirstName`),
        lastName: get(`Representative${n}LastName`),
        fullName: get(
          legacy ? `Representative ${n}` : `Representative${n}Name`
        ),
        email: get(
          legacy ? "Email" : `Representative${n}Email`,
          legacy ? n - 1 : 0
        ),
        phone: get(
          legacy ? "Phone Number" : `Representative${n}Phone`,
          legacy ? n - 1 : 0
        ),
        visaSupport: /^(yes|no)?$/i.test(get(`Representative${n}VisaSupport`)) ? /^yes$/i.test(get(`Representative${n}VisaSupport`)) : get(`Representative${n}VisaSupport`),
        passportNumber: get(`Representative${n}PassportNumber`),
        days: !get(`Representative${n}Days`) || /^all(?: days)?$/i.test(get(`Representative${n}Days`)) ? [] : get(`Representative${n}Days`).split(/[|;]/).map(day => day.trim()).filter(Boolean)
      }))
      .filter((r) => r.fullName || r.email || r.phone)
    return {
      rowNumber: index + 2,
      sourceReference: get("Submission Number"),
      submittedAt: get("Submitted At"),
      couponCode: get("CouponCode").toUpperCase(),
      data: {
        visaSupportUnassigned: legacy && /^yes$/i.test(get("Do you require a Visa?")),
        companyName: get(legacy ? "Company name" : "CompanyName"),
        companyEmail: get(legacy ? "Company Email" : "CompanyEmail"),
        companyPhone: get(legacy ? "Company Phone Number" : "CompanyPhone"),
        sector: label(get(legacy ? "Organisation Sector" : "Sector")),
        category: label(get(legacy ? "Service Exhibit" : "Category")),
        proposal: get(legacy ? "What do you intend to exhibit?" : "Proposal"),
        country: get("Country"),
        city: get("City"),
        stateRegion: get("StateRegion"),
        website: get("Website"),
        requirements:
          get("Requirements") ||
          (legacy && get("Do you require a Visa?") === "Yes"
            ? "Visa support requested in the original application; confirm which representative requires assistance."
            : ""),
        associationMember:
          get(
            legacy
              ? "Are you a member of an umbrella organisation/association?"
              : "AssociationMember"
          ).toLowerCase() === "yes",
        association: get(
          legacy ? "If Yes, specify the association" : "Association"
        ),
        consentAccepted:
          get(legacy ? "Consent" : "ConsentAccepted").toLowerCase() === "yes",
        representatives
      }
    }
  })
}
export function safeCsv(rows) {
  return Papa.unparse(rows, { escapeFormulae: true })
}
