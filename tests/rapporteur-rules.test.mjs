import assert from "node:assert/strict"
import test from "node:test"
import {
  canEditReport,
  emptyReportContent,
  clockTime,
  hallsMatch,
  parseReportContent,
  renderReportHtml,
  reportContentReady,
  reportFileName,
  sanitizeReportContent,
  rapporteurConferenceDay,
  rapporteurDayClusterKey,
  rapporteurFolderDay,
  sessionDateLabel,
  sessionOrderKey,
  speakersToComposition,
} from "../lib/rec-conference/rapporteur-rules.mjs"

test("hall names match the template spelling", () => {
  assert.equal(hallsMatch("E-Cooking Pavillion", "E-Cooking Pavilion"), true)
  assert.equal(hallsMatch("achwa", "Achwa"), true)
  assert.equal(hallsMatch("Achwa Hall", "Achwa"), true)
  assert.equal(hallsMatch("Victoria Hall (Main Auditorium)", "Victoria"), true)
  assert.equal(hallsMatch("Nile Hall", "Nile"), true)
  assert.equal(hallsMatch("Nile", "Victoria"), false)
  assert.match(clockTime("2026-10-19T05:30:00.000+00:00"), /^8:30/i)
  assert.equal(clockTime("09:00"), "09:00")
})

test("sessions sort from the first start time to the last", () => {
  const morning = sessionOrderKey({ startTime: "2026-10-19T05:30:00.000+00:00" })
  const midday = sessionOrderKey({ startTime: "2026-10-19T10:00:00.000+00:00" })
  const nextDay = sessionOrderKey({ startTime: "2026-10-20T05:30:00.000+00:00" })
  assert.ok(morning < midday)
  assert.ok(midday < nextDay)
  const sameDay = ["8:30 am", "11:00 am", "1:00 pm", "2:30 pm"].map((startTime) => (
    sessionOrderKey({ sessionDate: "19th October 2026", startTime })
  ))
  assert.ok(sameDay[0] < sameDay[1] && sameDay[1] < sameDay[2] && sameDay[2] < sameDay[3])
})

test("session dates follow the conference start", () => {
  assert.equal(sessionDateLabel({ day: 1 }, "2026-10-19"), "19th October 2026")
  assert.equal(sessionDateLabel({ day: 4 }, "2026-10-19"), "22nd October 2026")
})

test("approved reports file into the conference day folder", () => {
  assert.equal(rapporteurConferenceDay("19th October 2026", "2026-10-19"), 1)
  assert.equal(rapporteurConferenceDay("22nd October 2026", "2026-10-19"), 4)
  assert.equal(rapporteurConferenceDay("22 Oct", "2026-10-19"), 4)
  assert.equal(rapporteurConferenceDay("2026-10-21", "2026-10-19"), 3)
  assert.equal(rapporteurConferenceDay("18th October 2026", "2026-10-19"), 0)
  assert.equal(rapporteurDayClusterKey(2), "rec26:day-2")
  assert.equal(rapporteurDayClusterKey(0), "rec26:rapporteur")
  assert.equal(rapporteurConferenceDay("2026-10-18T21:30:00.000Z", "2026-10-19"), 1)
  assert.equal(rapporteurConferenceDay("2026-10-22T20:30:00.000Z", "2026-10-19"), 4)
  assert.equal(rapporteurFolderDay({ day: 1, sessionDate: "2026-10-22", conferenceStart: "2026-10-19" }), 1)
  assert.equal(rapporteurFolderDay({ day: 4, sessionDate: "19th October 2026", conferenceStart: "2026-10-19" }), 4)
  assert.equal(rapporteurFolderDay({ sessionDate: "21st October 2026", conferenceStart: "2026-10-19" }), 3)
  assert.equal(rapporteurFolderDay({ day: 9, sessionDate: "20 Oct", conferenceStart: "2026-10-19" }), 2)
})

test("template content keeps the rapporteur sections and drops unknown fields", () => {
  const content = sanitizeReportContent({
    purpose: "  Scale the grid  ",
    notes: "not a section",
    composition: [{ fullName: "Ada Okello", role: "Chair", extra: "no" }],
    qa: [{ question: "How?", status: "Maybe" }],
  })
  assert.equal(content.purpose, "Scale the grid")
  assert.equal(content.notes, undefined)
  assert.deepEqual(content.composition, [{
    title: "",
    fullName: "Ada Okello",
    designation: "",
    organisation: "",
    role: "Chair",
  }])
  assert.equal(content.qa[0].status, "")
  assert.equal(reportContentReady(emptyReportContent()), false)
  assert.equal(reportContentReady(content), true)
})

test("a returned report can be edited and a submitted one cannot", () => {
  assert.equal(canEditReport("draft"), true)
  assert.equal(canEditReport("returned"), true)
  assert.equal(canEditReport("submitted"), false)
  assert.equal(canEditReport("approved"), false)
})

test("programme speakers prefill the composition table", () => {
  const rows = speakersToComposition(JSON.stringify([{ name: "Jane Kato", organization: "NREP", sessionRole: "Presenter" }]))
  assert.equal(rows[0].fullName, "Jane Kato")
  assert.equal(rows[0].organisation, "NREP")
  assert.equal(rows[0].role, "Presenter")
})

test("the filed copy uses the template headings and stays a downloadable document", () => {
  const html = renderReportHtml({
    title: "Storage",
    hall: "Nile",
    sessionDate: "20th October 2026",
    authorName: "Amina",
    content: parseReportContent({ purpose: "Storage", challenges: "Cost" }),
    mediaLinks: [{ label: "Slides", url: "https://rec.nrep.ug/slides" }],
  })
  assert.match(html, /nrep-mark\.png/)
  assert.match(html, /32\.5mm/)
  assert.match(html, /8\.5in 11in/)
  assert.doesNotMatch(html, /word-break|table-layout:\s*fixed/)
  assert.match(html, /REC26 &amp; EXPO RAPPORTEURS TEMPLATE/)
  assert.match(html, /Purpose of the Session/)
  assert.match(html, /Agreed Outcomes and Decisions/)
  assert.match(html, /https:\/\/rec.nrep.ug\/slides/)
  assert.doesNotMatch(html, /decision:revision/)
  assert.match(reportFileName("Storage & scale"), /^REC26 Rapporteur - Storage scale\.doc$/)
})
