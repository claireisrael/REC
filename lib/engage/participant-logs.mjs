/**
 * BCCEC Activity Participant Log — Kobo-aligned summary form (not a name register).
 */

import {
  PARTICIPANT_LOG_DISABILITY_MATRIX,
  PARTICIPANT_LOG_GENDER_AGE_MATRIX,
  PARTICIPANT_LOG_ORG_FIELDS,
  PARTICIPANT_LOG_PROGRAM_LABEL,
  emptyParticipantLogContent,
  participantLogGroupProgress,
} from "./participant-log-sections.mjs"

const GENDER_AGE_ROWS = Object.freeze(["18 - 24", "25 - 35", "36+"])
const DISABILITY_MATRIX_LABELS = Object.freeze(["Ugandan", "Refugee", "Foreigner"])

function emptyGenderAgeBreakdown() {
  return GENDER_AGE_ROWS.map((row) => ({ row, male: 0, female: 0, total: 0 }))
}

function emptyDisabilityMatrix() {
  return DISABILITY_MATRIX_LABELS.map((label) => ({
    label,
    male: 0,
    female: 0,
    total: 0,
  }))
}

function rollGenderAgeFromBody(body = {}) {
  const map = new Map(emptyGenderAgeBreakdown().map((row) => [row.row, { ...row }]))
  for (const field of PARTICIPANT_LOG_GENDER_AGE_MATRIX) {
    const target = map.get(field.row)
    if (!target) continue
    const value = parseCount(body[field.key])
    if (field.side === "Male") target.male += value
    else target.female += value
    target.total = target.male + target.female
  }
  return [...map.values()]
}

function rollDisabilityMatrixFromBody(body = {}) {
  const map = new Map(emptyDisabilityMatrix().map((row) => [row.label, { ...row }]))
  for (const field of PARTICIPANT_LOG_DISABILITY_MATRIX) {
    const target = map.get(field.label)
    if (!target) continue
    const value = parseCount(body[field.key])
    if (field.side === "Male") target.male += value
    else target.female += value
    target.total = target.male + target.female
  }
  return [...map.values()]
}

export const PARTICIPANT_LOG_TEMPLATE_ID = "tpl-activity-participant-log"
export const PARTICIPANT_LOG_CLUSTER = "bccec:participant-log"
export const PARTICIPANT_LOG_TITLE_SUFFIX = "ACTIVITY PARTICIPANT LOG"

export { emptyParticipantLogContent, participantLogGroupProgress }

/** Participant logs are a sectioned form — they never produce Word `_documentHtml`. */
export function usesParticipantLogDocument(template = null, content = null) {
  return isParticipantLogTemplate(template) || isParticipantLogReport({ templateId: template?.id }, content)
}

export function hasSaveableEngageDocument(content = {}, template = null) {
  if (usesParticipantLogDocument(template, content)) return true
  return Boolean(String(content?._documentHtml || content?._documentFileId || "").trim())
}

export function participantLogSubmitGate(content = {}) {
  const progress = participantLogGroupProgress(content)
  const incomplete = progress.filter((row) => !row.complete)
  if (!incomplete.length) return { ok: true, message: "" }
  const labels = incomplete.map((row) => String(row.title || row.id).replace(/^Section \d+:\s*/i, ""))
  return {
    ok: false,
    message: `Finish these sections before sending: ${labels.join(", ")}.`,
    missing: incomplete.map((row) => row.id),
  }
}

export function isParticipantLogTemplate(template = null) {
  return String(template?.id || "").trim() === PARTICIPANT_LOG_TEMPLATE_ID
}

export function isParticipantLogReport(report = {}, content = null) {
  const body = content && typeof content === "object" ? content : report?.content || {}
  const templateId = String(report?.templateId || body?._templateKey || body?._templateId || "").trim()
  if (templateId === PARTICIPANT_LOG_TEMPLATE_ID) return true
  const hay = [
    body?._templateName,
    body?._templateShortName,
    body?._docTypeName,
    report?.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return hay.includes("participant log") || hay.includes("activity participant")
}

export function isParticipantLogRepositoryItem(item = {}) {
  const cluster = String(item?.clusterKey || item?.cluster || "").trim().toLowerCase()
  if (cluster === PARTICIPANT_LOG_CLUSTER || cluster.endsWith(":participant-log")) return true
  const hay = `${item?.title || ""} ${(item?.tags || []).join(" ")} ${item?.templateId || ""}`.toLowerCase()
  return hay.includes("participant log") || hay.includes("tpl-activity-participant-log")
}

/** Report ids whose form counts should feed M&E / repository analytics. */
export function collectParticipantLogReportIds({ reports = [], repositoryItems = [] } = {}) {
  const ids = new Set()
  for (const item of Array.isArray(repositoryItems) ? repositoryItems : []) {
    if (!isParticipantLogRepositoryItem(item)) continue
    const reportId = String(item?.reportId || "").trim()
    if (reportId && !reportId.startsWith("upload:")) ids.add(reportId)
  }
  for (const report of Array.isArray(reports) ? reports : []) {
    if (!isParticipantLogReport(report, report?.content)) continue
    const id = String(report?.id || report?.$id || "").trim()
    if (!id) continue
    if (ids.size) {
      if (ids.has(id)) continue
      // Keep published logs even if the list payload was slimmed.
    }
    if (String(report?.status || "").toLowerCase() === "published") ids.add(id)
  }
  return [...ids]
}

function parseCount(value) {
  const n = Number.parseInt(String(value ?? "").replace(/[^\d]/g, ""), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function buildParticipantLogTitle(activityName = "") {
  const name = String(activityName || "")
    .replace(/\s+/g, " ")
    .replace(new RegExp(`\\s*${PARTICIPANT_LOG_TITLE_SUFFIX}\\s*$`, "i"), "")
    .trim()
  if (!name) return PARTICIPANT_LOG_TITLE_SUFFIX
  return `${name} ${PARTICIPANT_LOG_TITLE_SUFFIX}`
}

export function applyParticipantLogActivitySeed(content = {}, activity = {}, actor = {}) {
  const next = { ...emptyParticipantLogContent(), ...(content && typeof content === "object" ? content : {}) }
  const activityName = String(activity?.title || activity?.name || "").trim()
  const district = String(activity?.location || activity?.venue || "")
    .replace(/^—$/, "")
    .trim()
  const dateValue = activity?.startDate || activity?.endDate || ""
  let activityDate = String(next.activityDate || "").trim()
  if (!activityDate && dateValue) {
    try {
      const parsed = new Date(dateValue)
      activityDate = Number.isNaN(parsed.getTime())
        ? String(dateValue).slice(0, 10)
        : parsed.toISOString().slice(0, 10)
    } catch {
      activityDate = String(dateValue).slice(0, 10)
    }
  }

  if (activityName && !String(next.activityName || "").trim()) next.activityName = activityName
  if (district && !String(next.district || "").trim()) next.district = district
  if (activityDate && !String(next.activityDate || "").trim()) next.activityDate = activityDate
  if (!String(next.programProject || "").trim()) next.programProject = PARTICIPANT_LOG_PROGRAM_LABEL
  if (!String(next.thirdPartyEvent || "").trim()) next.thirdPartyEvent = "No"

  const actorName = String(actor?.name || actor?.userName || "").trim()
  if (actorName && !String(next.responsiblePerson || "").trim()) next.responsiblePerson = actorName

  const seededName = String(next.activityName || activityName).trim()
  if (seededName && !String(next.logTitle || "").trim()) {
    next.logTitle = buildParticipantLogTitle(seededName)
  }
  return next
}

export function summarizeParticipantLog(report = {}, content = null) {
  const body =
    content && typeof content === "object"
      ? content
      : report?.content && typeof report.content === "object"
        ? report.content
        : {}

  const orgCounts = PARTICIPANT_LOG_ORG_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    count: parseCount(body[field.key]),
  }))

  const male = parseCount(body.genderMale)
  const female = parseCount(body.genderFemale)
  const totalParticipation = parseCount(body.totalParticipation)
  const genderTotal = male + female
  const people =
    totalParticipation ||
    genderTotal ||
    parseCount(body.age18_24) + parseCount(body.age25_35) + parseCount(body.age36Plus) ||
    parseCount(body.natUgandan) + parseCount(body.natRefugee) + parseCount(body.natForeigner)

  const activityName = String(body.activityName || "").trim()
  const title = String(report?.title || body.logTitle || "").trim()

  return {
    id: String(report?.id || report?.$id || "").trim(),
    activityId: String(report?.activityId || body.activityId || "").trim(),
    title: title || buildParticipantLogTitle(activityName),
    activityName: activityName || title.replace(new RegExp(`\\s*${PARTICIPANT_LOG_TITLE_SUFFIX}\\s*$`, "i"), "").trim(),
    district: String(body.district || "").trim(),
    activityDate: String(body.activityDate || report?.publishedAt || "").trim(),
    thirdPartyEvent: String(body.thirdPartyEvent || "").trim(),
    thirdPartyEventName: String(body.thirdPartyEventName || "").trim(),
    thirdPartyEventDescription: String(body.thirdPartyEventDescription || "").trim(),
    responsiblePerson: String(body.responsiblePerson || "").trim(),
    people,
    totalParticipation,
    male,
    female,
    unspecifiedSex: Math.max(0, people - male - female),
    orgCounts,
    orgBreakdown: orgCounts.filter((row) => row.count > 0),
    age: {
      under25: parseCount(body.age18_24),
      mid: parseCount(body.age25_35),
      senior: parseCount(body.age36Plus),
    },
    nationality: {
      ugandan: parseCount(body.natUgandan),
      refugee: parseCount(body.natRefugee),
      foreigner: parseCount(body.natForeigner),
    },
    disability: {
      yes: parseCount(body.disYes),
      no: parseCount(body.disNo),
    },
    genderAge: rollGenderAgeFromBody(body),
    disabilityMatrix: rollDisabilityMatrixFromBody(body),
    sales: parseCount(body.sales),
    prospects: parseCount(body.prospects),
    onboardedPlatforms: parseCount(body.onboardedPlatforms ?? body.onboarded),
  }
}

export function participantLogActivityKey(log = {}) {
  const id = String(log.activityId || "").trim()
  if (id) return `id:${id}`
  const name = String(log.activityName || log.title || "").trim() || "Untitled activity"
  return `name:${name.toLowerCase()}`
}

export function listParticipantLogActivityChoices(logs = []) {
  const map = new Map()
  for (const log of Array.isArray(logs) ? logs : []) {
    const key = participantLogActivityKey(log)
    const name = String(log.activityName || log.title || "Untitled activity").trim()
    const prev = map.get(key)
    if (!prev) {
      map.set(key, {
        key,
        activityId: String(log.activityId || "").trim(),
        activityName: name,
        district: String(log.district || "").trim(),
        activityDate: String(log.activityDate || "").trim(),
        logCount: 1,
        people: Number(log.people) || 0,
      })
    } else {
      prev.logCount += 1
      prev.people += Number(log.people) || 0
      if (!prev.district && log.district) prev.district = String(log.district).trim()
    }
  }
  return [...map.values()].sort((a, b) => a.activityName.localeCompare(b.activityName))
}

export function filterParticipantLogsForActivity(logs = [], activityKey = "") {
  const key = String(activityKey || "").trim()
  if (!key) return []
  return (Array.isArray(logs) ? logs : []).filter((log) => participantLogActivityKey(log) === key)
}

export function aggregateParticipantLogSummaries(summaries = []) {
  const rows = Array.isArray(summaries) ? summaries : []
  const people = rows.reduce((sum, row) => sum + (Number(row.people) || 0), 0)
  const female = rows.reduce((sum, row) => sum + (Number(row.female) || 0), 0)
  const male = rows.reduce((sum, row) => sum + (Number(row.male) || 0), 0)
  const districts = new Set(rows.map((row) => String(row.district || "").trim()).filter(Boolean))

  const byActivityMap = new Map()
  for (const log of rows) {
    const key = log.activityName || log.title || "Untitled activity"
    const prev = byActivityMap.get(key) || { activity: key, people: 0, female: 0, male: 0, logs: 0 }
    prev.people += Number(log.people) || 0
    prev.female += Number(log.female) || 0
    prev.male += Number(log.male) || 0
    prev.logs += 1
    byActivityMap.set(key, prev)
  }

  const orgTotals = new Map()
  for (const field of PARTICIPANT_LOG_ORG_FIELDS) {
    orgTotals.set(field.label, 0)
  }
  for (const log of rows) {
    for (const row of log.orgCounts || log.orgBreakdown || []) {
      orgTotals.set(row.label, (orgTotals.get(row.label) || 0) + (Number(row.count) || 0))
    }
  }

  const age = { under25: 0, mid: 0, senior: 0 }
  for (const log of rows) {
    age.under25 += Number(log.age?.under25) || 0
    age.mid += Number(log.age?.mid) || 0
    age.senior += Number(log.age?.senior) || 0
  }

  const nationality = { ugandan: 0, refugee: 0, foreigner: 0 }
  for (const log of rows) {
    nationality.ugandan += Number(log.nationality?.ugandan) || 0
    nationality.refugee += Number(log.nationality?.refugee) || 0
    nationality.foreigner += Number(log.nationality?.foreigner) || 0
  }

  const disability = { yes: 0, no: 0 }
  for (const log of rows) {
    disability.yes += Number(log.disability?.yes) || 0
    disability.no += Number(log.disability?.no) || 0
  }

  const genderAgeMap = new Map(emptyGenderAgeBreakdown().map((row) => [row.row, { ...row }]))
  for (const log of rows) {
    for (const band of Array.isArray(log.genderAge) ? log.genderAge : []) {
      const target = genderAgeMap.get(band.row)
      if (!target) continue
      target.male += Number(band.male) || 0
      target.female += Number(band.female) || 0
      target.total = target.male + target.female
    }
  }
  const byGenderAge = [...genderAgeMap.values()]

  const disabilityMatrixMap = new Map(emptyDisabilityMatrix().map((row) => [row.label, { ...row }]))
  for (const log of rows) {
    for (const band of Array.isArray(log.disabilityMatrix) ? log.disabilityMatrix : []) {
      const target = disabilityMatrixMap.get(band.label)
      if (!target) continue
      target.male += Number(band.male) || 0
      target.female += Number(band.female) || 0
      target.total = target.male + target.female
    }
  }
  const byDisabilityMatrix = [...disabilityMatrixMap.values()]

  const sales = rows.reduce((sum, row) => sum + (Number(row.sales) || 0), 0)
  const prospects = rows.reduce((sum, row) => sum + (Number(row.prospects) || 0), 0)
  const onboardedPlatforms = rows.reduce(
    (sum, row) => sum + (Number(row.onboardedPlatforms) || 0),
    0
  )

  const thirdPartyLogs = rows.filter((row) => String(row.thirdPartyEvent || "").toLowerCase() === "yes")
  const first = rows[0] || null
  const activityChoices = listParticipantLogActivityChoices(rows)
  const orgRows = PARTICIPANT_LOG_ORG_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    value: orgTotals.get(field.label) || 0,
  }))
  const byOrgType = [...orgTotals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const topOrgTypes = byOrgType.filter((row) => row.value > 0).slice(0, 5)
  const byImpact = [
    { name: "Sales", value: sales, fill: "#176F91" },
    { name: "Prospects", value: prospects, fill: "#EFA74F" },
    { name: "Onboarded", value: onboardedPlatforms, fill: "#18794E" },
  ]

  return {
    logCount: rows.length,
    people,
    female,
    male,
    unspecifiedSex: Math.max(0, people - female - male),
    femalePct: people ? Math.round((female / people) * 100) : 0,
    malePct: people ? Math.round((male / people) * 100) : 0,
    districtCount: districts.size,
    districts: [...districts].sort((a, b) => a.localeCompare(b)),
    activityCount: activityChoices.length,
    thirdPartyCount: thirdPartyLogs.length,
    sales,
    prospects,
    onboardedPlatforms,
    byImpact,
    topOrgTypes,
    activityName: first?.activityName || "",
    district: first?.district || "",
    activityDate: first?.activityDate || "",
    responsiblePerson: first?.responsiblePerson || "",
    thirdPartyEvent: first?.thirdPartyEvent || "",
    thirdPartyEventName: first?.thirdPartyEventName || "",
    byActivity: [...byActivityMap.values()].sort((a, b) => b.people - a.people || a.activity.localeCompare(b.activity)),
    byOrgType,
    orgRows,
    bySex: [
      { name: "Female", value: female, fill: "#EFA74F" },
      { name: "Male", value: male, fill: "#176F91" },
      { name: "Unspecified", value: Math.max(0, people - female - male), fill: "#0B5E78" },
    ].filter((row) => row.value > 0),
    byAge: [
      { name: "18 - 24", value: age.under25, fill: "#EFA74F" },
      { name: "25 - 35", value: age.mid, fill: "#176F91" },
      { name: "36+", value: age.senior, fill: "#0B5E78" },
    ],
    byNationality: [
      { name: "Ugandan", value: nationality.ugandan, fill: "#176F91" },
      { name: "Refugee", value: nationality.refugee, fill: "#EFA74F" },
      { name: "Foreigner", value: nationality.foreigner, fill: "#2E9ECC" },
    ],
    byDisability: [
      { name: "Yes", value: disability.yes, fill: "#B42318" },
      { name: "No", value: disability.no, fill: "#18794E" },
    ],
    byGenderAge,
    byDisabilityMatrix,
    logs: rows,
    activities: activityChoices,
  }
}

export function aggregatePublishedParticipantLogs({ reports = [], repositoryItems = [] } = {}) {
  const repoLogIds = new Set(
    (Array.isArray(repositoryItems) ? repositoryItems : [])
      .filter((item) => isParticipantLogRepositoryItem(item))
      .map((item) => String(item?.reportId || "").trim())
      .filter(Boolean)
  )
  const logs = (Array.isArray(reports) ? reports : []).filter((report) => {
    if (!isParticipantLogReport(report, report?.content)) return false
    const id = String(report?.id || report?.$id || "").trim()
    if (repoLogIds.size && id) return repoLogIds.has(id)
    return String(report?.status || "").toLowerCase() === "published"
  })

  const summaries = logs.map((report) => summarizeParticipantLog(report, report?.content))
  return aggregateParticipantLogSummaries(summaries)
}

export function participantLogsToCsv(logs = []) {
  const header = [
    "Activity",
    "Date",
    "District",
    "Responsible person",
    "Third party event",
    "Third party event name",
    "Third party event description",
    "Total participation",
    "Male",
    "Female",
    "18-24",
    "25-35",
    "36+",
    "Ugandan",
    "Refugee",
    "Foreigner",
    "Disability yes",
    "Disability no",
    "Dis Ugandan Male",
    "Dis Ugandan Female",
    "Dis Refugee Male",
    "Dis Refugee Female",
    "Dis Foreigner Male",
    "Dis Foreigner Female",
    "18-24 Male",
    "18-24 Female",
    "25-35 Male",
    "25-35 Female",
    "36+ Male",
    "36+ Female",
    "Sales",
    "Prospects",
    "Onboarded platforms",
  ]
  const escape = (value) => {
    const text = String(value ?? "")
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }
  const genderAgeValue = (log, rowLabel, side) => {
    const band = (Array.isArray(log.genderAge) ? log.genderAge : []).find((row) => row.row === rowLabel)
    if (!band) return 0
    return side === "Male" ? band.male : band.female
  }
  const disabilityMatrixValue = (log, label, side) => {
    const band = (Array.isArray(log.disabilityMatrix) ? log.disabilityMatrix : []).find(
      (row) => row.label === label
    )
    if (!band) return 0
    return side === "Male" ? band.male : band.female
  }
  const lines = [header.join(",")]
  for (const log of logs) {
    lines.push(
      [
        log.activityName,
        log.activityDate ? String(log.activityDate).slice(0, 10) : "",
        log.district,
        log.responsiblePerson,
        log.thirdPartyEvent,
        log.thirdPartyEventName,
        log.thirdPartyEventDescription,
        log.totalParticipation,
        log.male,
        log.female,
        log.age?.under25,
        log.age?.mid,
        log.age?.senior,
        log.nationality?.ugandan,
        log.nationality?.refugee,
        log.nationality?.foreigner,
        log.disability?.yes,
        log.disability?.no,
        disabilityMatrixValue(log, "Ugandan", "Male"),
        disabilityMatrixValue(log, "Ugandan", "Female"),
        disabilityMatrixValue(log, "Refugee", "Male"),
        disabilityMatrixValue(log, "Refugee", "Female"),
        disabilityMatrixValue(log, "Foreigner", "Male"),
        disabilityMatrixValue(log, "Foreigner", "Female"),
        genderAgeValue(log, "18 - 24", "Male"),
        genderAgeValue(log, "18 - 24", "Female"),
        genderAgeValue(log, "25 - 35", "Male"),
        genderAgeValue(log, "25 - 35", "Female"),
        genderAgeValue(log, "36+", "Male"),
        genderAgeValue(log, "36+", "Female"),
        log.sales,
        log.prospects,
        log.onboardedPlatforms,
      ]
        .map(escape)
        .join(",")
    )
  }
  return lines.join("\n")
}
