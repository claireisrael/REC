import test from "node:test"
import assert from "node:assert/strict"
import {
  compareRecReports,
  isConferenceFinished,
  isHttpsUrl,
  normalizeRecReportType,
  REC_REPORT_TYPES,
  selectPreviousConferenceReport,
} from "../lib/rec-conference/report-rules.mjs"

test("conference reports become eligible after the conference end date", () => {
  const conference = { endDate: "2025-10-22T00:00:00.000Z" }
  assert.equal(isConferenceFinished(conference, new Date("2025-10-22T20:00:00.000Z")), false)
  assert.equal(isConferenceFinished(conference, new Date("2025-10-23T00:00:00.000Z")), true)
})

test("upcoming and malformed conferences are not eligible for reports", () => {
  assert.equal(isConferenceFinished({ endDate: "2027-10-22" }, new Date("2026-07-22")), false)
  assert.equal(isConferenceFinished({ endDate: "not-a-date" }, new Date("2026-07-22")), false)
})

test("report links require HTTPS and unknown types use the conference report type", () => {
  assert.equal(isHttpsUrl("https://example.org/report.pdf"), true)
  assert.equal(isHttpsUrl("http://example.org/report.pdf"), false)
  assert.equal(isHttpsUrl("javascript:alert(1)"), false)
  assert.equal(normalizeRecReportType("proceedings"), REC_REPORT_TYPES.PROCEEDINGS)
  assert.equal(normalizeRecReportType("unsupported"), REC_REPORT_TYPES.CONFERENCE_REPORT)
})

test("featured reports are preferred within the same conference", () => {
  const reports = [
    { title: "Later order", displayOrder: 1, isFeatured: false },
    { title: "Featured", displayOrder: 20, isFeatured: true },
  ]
  assert.equal([...reports].sort(compareRecReports)[0].title, "Featured")
})

test("program CTA selects the latest completed conference before the current edition", () => {
  const conferences = [
    { $id: "rec-2024", year: 2024, startDate: "2024-10-20", endDate: "2024-10-22" },
    { $id: "rec-2025", year: 2025, startDate: "2025-10-20", endDate: "2025-10-22" },
    { $id: "rec-2026", year: 2026, startDate: "2026-10-19", endDate: "2026-10-22" },
  ]
  const reports = [
    { $id: "report-2024", conferenceId: "rec-2024", title: "REC 2024", isPublished: true },
    { $id: "draft-2025", conferenceId: "rec-2025", title: "Draft", isPublished: false, isFeatured: true },
    { $id: "report-2025", conferenceId: "rec-2025", title: "REC 2025", isPublished: true },
    { $id: "current", conferenceId: "rec-2026", title: "REC 2026", isPublished: true },
  ]

  const selected = selectPreviousConferenceReport({
    reports,
    conferences,
    currentConference: conferences[2],
    now: new Date("2026-07-22T00:00:00.000Z"),
  })

  assert.equal(selected?.conference.$id, "rec-2025")
  assert.equal(selected?.report.$id, "report-2025")
})
