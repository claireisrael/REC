export const REC_REPORT_TYPES = Object.freeze({
  CONFERENCE_REPORT: "conference_report",
  PROCEEDINGS: "proceedings",
  OUTCOMES: "outcomes",
  COMMUNIQUE: "communique",
  OTHER: "other",
})

export const REC_REPORT_TYPE_LABELS = Object.freeze({
  [REC_REPORT_TYPES.CONFERENCE_REPORT]: "Conference report",
  [REC_REPORT_TYPES.PROCEEDINGS]: "Conference proceedings",
  [REC_REPORT_TYPES.OUTCOMES]: "Outcomes document",
  [REC_REPORT_TYPES.COMMUNIQUE]: "Conference communique",
  [REC_REPORT_TYPES.OTHER]: "Other publication",
})

const DAY_MS = 24 * 60 * 60 * 1000

function timestamp(value) {
  const parsed = Date.parse(value || "")
  return Number.isFinite(parsed) ? parsed : null
}

export function getConferenceFinishedAt(conference) {
  const endTimestamp = timestamp(conference?.endDate)
  return endTimestamp === null ? null : endTimestamp + DAY_MS
}

export function isConferenceFinished(conference, now = new Date()) {
  const finishedAt = getConferenceFinishedAt(conference)
  const nowTimestamp = now instanceof Date ? now.getTime() : timestamp(now)
  return finishedAt !== null && nowTimestamp !== null && finishedAt <= nowTimestamp
}

export function normalizeRecReportType(value) {
  const normalized = String(value || "").trim().toLowerCase()
  return Object.values(REC_REPORT_TYPES).includes(normalized)
    ? normalized
    : REC_REPORT_TYPES.CONFERENCE_REPORT
}

export function isHttpsUrl(value) {
  try {
    return new URL(String(value || "").trim()).protocol === "https:"
  } catch {
    return false
  }
}

export function getConferenceSortValue(conference) {
  const year = Number(conference?.year)
  if (Number.isFinite(year)) return year * 10_000_000_000
  return timestamp(conference?.endDate || conference?.startDate) || 0
}

function reportSortValue(report) {
  return timestamp(report?.publicationDate || report?.updatedAt || report?.createdAt) || 0
}

export function compareRecReports(a, b) {
  if (a?.isFeatured === true && b?.isFeatured !== true) return -1
  if (b?.isFeatured === true && a?.isFeatured !== true) return 1

  const orderDifference = Number(a?.displayOrder || 0) - Number(b?.displayOrder || 0)
  if (orderDifference !== 0) return orderDifference

  const dateDifference = reportSortValue(b) - reportSortValue(a)
  if (dateDifference !== 0) return dateDifference

  return String(a?.title || "").localeCompare(String(b?.title || ""))
}

export function selectPreviousConferenceReport({
  reports = [],
  conferences = [],
  currentConference = null,
  now = new Date(),
} = {}) {
  const conferenceById = new Map(conferences.map((conference) => [conference.$id, conference]))
  const currentStart = timestamp(currentConference?.startDate)

  const candidates = reports
    .filter((report) => report?.isPublished === true)
    .map((report) => ({ report, conference: conferenceById.get(report.conferenceId) }))
    .filter(({ report, conference }) => {
      if (!conference || !isConferenceFinished(conference, now)) return false
      if (currentConference?.$id && report.conferenceId === currentConference.$id) return false
      if (currentStart === null) return true
      const finishedAt = getConferenceFinishedAt(conference)
      return finishedAt !== null && finishedAt <= currentStart
    })
    .sort((a, b) => {
      const conferenceDifference = getConferenceSortValue(b.conference) - getConferenceSortValue(a.conference)
      return conferenceDifference || compareRecReports(a.report, b.report)
    })

  return candidates[0] || null
}
