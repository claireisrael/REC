/**
 * BCCEC Activity Participant Log — field schema aligned to the Kobo form (tgybCdLt).
 * Six collapsible sections; numeric counts and Male/Female matrices.
 */

export const PARTICIPANT_LOG_PROGRAM_LABEL =
  "Behavioral Change Communication for e-Cooking (BCCeC) in Uganda"

export const PARTICIPANT_LOG_ORG_FIELDS = Object.freeze([
  { key: "orgReligious", label: "Religious" },
  { key: "orgPrivateSector", label: "Private Sector" },
  { key: "orgDevelopmentPartner", label: "Development Partner Organization" },
  { key: "orgMDAs", label: "MDAs" },
  { key: "orgHealthFacilities", label: "Health Facilities" },
  { key: "orgPolitical", label: "Political" },
  { key: "orgSecurityForce", label: "Security Force" },
  { key: "orgSchools", label: "Schools" },
  { key: "orgMediaHouses", label: "Media Houses" },
  { key: "orgFinancingInstitutions", label: "Financing Institutions" },
  { key: "orgCultural", label: "Cultural" },
  { key: "orgCSOs", label: "Civil Society Organizations (CSOs)" },
  { key: "orgHouseholds", label: "House holds" },
])

export const PARTICIPANT_LOG_DISABILITY_MATRIX = Object.freeze([
  { key: "disUgandanMale", label: "Ugandan", side: "Male" },
  { key: "disUgandanFemale", label: "Ugandan", side: "Female" },
  { key: "disRefugeeMale", label: "Refugee", side: "Male" },
  { key: "disRefugeeFemale", label: "Refugee", side: "Female" },
  { key: "disForeignerMale", label: "Foreigner", side: "Male" },
  { key: "disForeignerFemale", label: "Foreigner", side: "Female" },
])

export const PARTICIPANT_LOG_GENDER_AGE_MATRIX = Object.freeze([
  { key: "ga18_24Male", row: "18 - 24", side: "Male" },
  { key: "ga18_24Female", row: "18 - 24", side: "Female" },
  { key: "ga25_35Male", row: "25 - 35", side: "Male" },
  { key: "ga25_35Female", row: "25 - 35", side: "Female" },
  { key: "ga36PlusMale", row: "36+", side: "Male" },
  { key: "ga36PlusFemale", row: "36+", side: "Female" },
])

/** Collapsible UI groups — mirrors Kobo SECTION 1–6. */
export const PARTICIPANT_LOG_FORM_GROUPS = Object.freeze([
  {
    id: "activity-details",
    title: "Section 1: Activity Details",
    intro: "Programme context and who led the activity.",
    blocks: [
      {
        type: "radio",
        key: "programProject",
        label: "Program/Project",
        options: [PARTICIPANT_LOG_PROGRAM_LABEL],
        required: true,
        readOnly: true,
      },
      {
        type: "radio",
        key: "thirdPartyEvent",
        label: "Is this a Third Party Event?",
        options: ["Yes", "No"],
        required: true,
      },
      {
        type: "text",
        key: "thirdPartyEventName",
        label: "Name of Third Party Event",
        required: true,
        showWhen: { key: "thirdPartyEvent", equals: "Yes" },
      },
      {
        type: "textarea",
        key: "thirdPartyEventDescription",
        label: "Description of event (Include what NREPs role was in the event)",
        required: true,
        showWhen: { key: "thirdPartyEvent", equals: "Yes" },
      },
      { type: "text", key: "district", label: "District", required: true },
      { type: "date", key: "activityDate", label: "Activity Date", required: true },
      { type: "text", key: "responsiblePerson", label: "Responsible Person", required: true },
    ],
  },
  {
    id: "participant-summary",
    title: "Section 2: Participant Summary",
    intro: "Counts by organisation type and overall gender split.",
    blocks: [
      {
        type: "number",
        key: "totalParticipation",
        label: "A. Total Participation",
        required: false,
        hint: "Overall headcount when you have it — organisation rows below should add up sensibly.",
      },
      {
        type: "subheading",
        label: "Address/Organization/Company",
      },
      {
        type: "subheading",
        label: "Total Number of Participants",
        muted: true,
      },
      {
        type: "number-grid",
        key: "orgTypeCounts",
        fields: PARTICIPANT_LOG_ORG_FIELDS.map((field) => ({
          key: field.key,
          label: field.label,
          required: true,
        })),
      },
      {
        type: "subheading",
        label: "Gender",
      },
      {
        type: "subheading",
        label: "Total Number of Participants",
        muted: true,
      },
      {
        type: "number-grid",
        key: "genderCounts",
        columns: 2,
        fields: [
          { key: "genderMale", label: "Male", required: true },
          { key: "genderFemale", label: "Female", required: true },
        ],
      },
    ],
  },
  {
    id: "age-range",
    title: "Section 3: Age Range",
    intro: "Total number of participants in each age band.",
    blocks: [
      {
        type: "subheading",
        label: "Total number of Participants",
        muted: true,
      },
      { type: "number", key: "age18_24", label: "18 - 24", required: true },
      { type: "number", key: "age25_35", label: "25 - 35", required: true },
      { type: "number", key: "age36Plus", label: "36+", required: true },
    ],
  },
  {
    id: "nationality",
    title: "Section 4: Nationality",
    intro: "Participants by nationality status.",
    blocks: [
      {
        type: "subheading",
        label: "Total Number of Participants",
        muted: true,
      },
      { type: "number", key: "natUgandan", label: "Ugandan", required: true },
      { type: "number", key: "natRefugee", label: "Refugee", required: true },
      { type: "number", key: "natForeigner", label: "Foreigner", required: true },
    ],
  },
  {
    id: "disability",
    title: "Section 5: Disability",
    intro: "Disability status and gender × nationality breakdown.",
    blocks: [
      {
        type: "subheading",
        label: "Total Number of Participants",
        muted: true,
      },
      { type: "number", key: "disYes", label: "Yes", required: true },
      { type: "number", key: "disNo", label: "No", required: true },
      {
        type: "matrix",
        key: "disabilityGenderNationality",
        label: "Gender & Nationality Breakdown",
        columns: ["Male", "Female"],
        rows: [
          { label: "Ugandan", maleKey: "disUgandanMale", femaleKey: "disUgandanFemale" },
          { label: "Refugee", maleKey: "disRefugeeMale", femaleKey: "disRefugeeFemale" },
          { label: "Foreigner", maleKey: "disForeignerMale", femaleKey: "disForeignerFemale" },
        ],
        required: true,
      },
    ],
  },
  {
    id: "gender-age",
    title: "Section 6: Gender & Age Breakdown",
    intro: "Male and female counts within each age band.",
    blocks: [
      {
        type: "matrix",
        key: "genderAgeBreakdown",
        label: "Gender & Age Breakdown",
        columns: ["Male", "Female"],
        rows: [
          { label: "18 - 24", maleKey: "ga18_24Male", femaleKey: "ga18_24Female" },
          { label: "25 - 35", maleKey: "ga25_35Male", femaleKey: "ga25_35Female" },
          { label: "36+", maleKey: "ga36PlusMale", femaleKey: "ga36PlusFemale" },
        ],
        required: true,
      },
    ],
  },
  {
    id: "impact",
    title: "Section 7: Sales & Platform Impact",
    intro: "Appliance sales, prospects, and people onboarded onto FumbaHub or other NREP platforms.",
    blocks: [
      {
        type: "number",
        key: "sales",
        label: "Sales",
        required: true,
        hint: "Number of appliances sold from this activity.",
      },
      {
        type: "number",
        key: "prospects",
        label: "Prospects",
        required: true,
        hint: "Number of prospects / leads generated.",
      },
      {
        type: "number",
        key: "onboardedPlatforms",
        label: "Onboarded on FumbaHub or other NREP platforms",
        required: true,
        hint: "People onboarded onto FumbaHub or other NREP platforms.",
      },
    ],
  },
])

/** Flat keys for seeding, analytics, and Appwrite schema export. */
export function allParticipantLogFieldKeys() {
  const keys = new Set(["logTitle", "activityName"])
  for (const group of PARTICIPANT_LOG_FORM_GROUPS) {
    for (const block of group.blocks) {
      if (block.type === "matrix") {
        for (const row of block.rows || []) {
          if (row.maleKey) keys.add(row.maleKey)
          if (row.femaleKey) keys.add(row.femaleKey)
        }
      } else if (block.type === "number-grid") {
        for (const field of block.fields || []) {
          if (field.key) keys.add(field.key)
        }
      } else if (block.key) {
        keys.add(block.key)
      }
    }
  }
  return [...keys]
}

export function emptyParticipantLogContent() {
  const content = {
    logTitle: "",
    activityName: "",
    programProject: PARTICIPANT_LOG_PROGRAM_LABEL,
    thirdPartyEvent: "No",
  }
  for (const key of allParticipantLogFieldKeys()) {
    if (content[key] === undefined) content[key] = ""
  }
  return content
}

/** Flat sections list for NREP template catalog / Appwrite schema sync. */
export function participantLogCatalogSections() {
  const flat = [
    { key: "logTitle", label: "Log title", type: "text", required: true },
    { key: "activityName", label: "Activity name", type: "text", required: true },
  ]
  for (const group of PARTICIPANT_LOG_FORM_GROUPS) {
    for (const block of group.blocks) {
      if (block.type === "subheading" || block.type === "matrix" || block.type === "number-grid") {
        if (block.type === "number-grid") {
          for (const field of block.fields || []) {
            flat.push({
              key: field.key,
              label: field.label,
              type: "text",
              required: Boolean(field.required),
            })
          }
        }
        continue
      }
      flat.push({
        key: block.key,
        label: block.label,
        type: block.type === "number" || block.type === "textarea" ? "text" : block.type,
        required: Boolean(block.required) && !block.showWhen,
        hint: block.hint || null,
        options: block.options || null,
      })
    }
    for (const block of group.blocks) {
      if (block.type !== "matrix") continue
      for (const row of block.rows || []) {
        if (row.maleKey) {
          flat.push({
            key: row.maleKey,
            label: `${block.label} — ${row.label} (Male)`,
            type: "text",
            required: Boolean(block.required),
          })
        }
        if (row.femaleKey) {
          flat.push({
            key: row.femaleKey,
            label: `${block.label} — ${row.label} (Female)`,
            type: "text",
            required: Boolean(block.required),
          })
        }
      }
    }
  }
  return flat
}

/** Whether a block is visible given current form values (Kobo-style relevance). */
export function isParticipantLogBlockVisible(block, content = {}) {
  if (!block?.showWhen) return true
  const { key, equals } = block.showWhen
  return String(content?.[key] ?? "").trim() === String(equals ?? "").trim()
}

export function participantLogGroupProgress(content = {}) {
  const body = content && typeof content === "object" ? content : {}
  return PARTICIPANT_LOG_FORM_GROUPS.map((group) => {
    let total = 0
    let filled = 0
    for (const block of group.blocks) {
      if (block.type === "subheading") continue
      if (!isParticipantLogBlockVisible(block, body)) continue
      if (block.type === "matrix") {
        for (const row of block.rows || []) {
          for (const key of [row.maleKey, row.femaleKey]) {
            if (!key) continue
            if (block.required) total += 1
            if (String(body[key] ?? "").trim() !== "") filled += 1
          }
        }
        continue
      }
      if (block.type === "number-grid") {
        for (const field of block.fields || []) {
          if (field.required) total += 1
          if (String(body[field.key] ?? "").trim() !== "") filled += 1
        }
        continue
      }
      if (block.required) total += 1
      if (String(body[block.key] ?? "").trim() !== "") filled += 1
    }
    return {
      id: group.id,
      title: group.title,
      filled,
      total,
      complete: total > 0 && filled >= total,
      started: filled > 0,
    }
  })
}
