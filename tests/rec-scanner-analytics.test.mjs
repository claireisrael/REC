import assert from "node:assert/strict"
import test from "node:test"
import {
  buildRecScanAlerts,
  buildRecScanAnalytics,
  buildRecScanLogRows,
  buildRecScannerLeaderboard,
  buildRecScanRegistrantRows,
  filterRecScanLogRows,
  filterRecScanRegistrantRows,
  formatRecScanAlert,
  getRecScannerRankInfo,
  paginateRecAnalyticsRows,
  rowsToRecAnalyticsCsv,
} from "../lib/rec-conference/scanning-analytics.mjs"

const conference = {
  year: 2026,
  days: [
    { label: "Day 1", date: "2026-10-19" },
    { label: "Day 2", date: "2026-10-20" },
  ],
}

const events = [
  {
    $id: "entry-day-1",
    name: "Main Entrance - Day 1",
    type: "conference_entry",
    day: 1,
    isActive: true,
    allowedRegistrationTypes: [],
    allowedDaysAttending: [],
  },
  {
    $id: "lunch-day-2",
    name: "Lunch - Day 2",
    type: "lunch",
    day: 2,
    isActive: true,
    allowedRegistrationTypes: ["Delegate"],
    allowedDaysAttending: ["Day 2"],
  },
]

const registrations = [
  {
    $id: "reg-1",
    title: "Dr",
    firstName: "Amina",
    lastName: "Nabirye",
    email: "amina@example.test",
    organization: "NREP",
    registrationType: "Delegate",
    country: "Uganda",
    daysAttending: ["Day 1", "Day 2"],
    additionalSessions: ["business_forum"],
  },
  {
    $id: "reg-2",
    firstName: "Peter",
    lastName: "Okello",
    email: "peter@example.test",
    organization: "Solar Co",
    registrationType: "Exhibitor",
    country: "Kenya",
    daysAttending: ["Day 1"],
    additionalSessions: [],
  },
]

const scans = [
  {
    $id: "scan-1",
    registrationId: "reg-1",
    registrationEmail: "amina@example.test",
    eventId: "entry-day-1",
    scanType: "conference_entry",
    status: "accepted",
    resultReason: "ok",
    scannedBy: "scanner:one",
    scannerName: "Entrance Team",
    scannedAt: "2026-10-19T05:30:00.000Z",
    registrationDaysAttending: ["Day 1", "Day 2"],
    matchedAttendanceDays: ["Day 1"],
  },
  {
    $id: "scan-2",
    registrationId: "reg-1",
    registrationEmail: "amina@example.test",
    eventId: "lunch-day-2",
    scanType: "lunch",
    status: "accepted",
    resultReason: "ok",
    scannedBy: "scanner:two",
    scannerName: "Lunch Team",
    scannedAt: "2026-10-20T09:00:00.000Z",
    registrationDaysAttending: ["Day 1", "Day 2"],
    matchedAttendanceDays: ["Day 2"],
  },
  {
    $id: "scan-3",
    registrationId: "reg-2",
    registrationEmail: "peter@example.test",
    eventId: "lunch-day-2",
    scanType: "lunch",
    status: "rejected",
    resultReason: "registration_day_not_allowed",
    scannedBy: "scanner:two",
    scannerName: "Lunch Team",
    scannedAt: "2026-10-20T09:05:00.000Z",
    registrationDaysAttending: ["Day 1"],
    matchedAttendanceDays: [],
  },
  {
    $id: "scan-4",
    registrationId: "reg-1",
    registrationEmail: "amina@example.test",
    eventId: "entry-day-1",
    scanType: "conference_entry",
    status: "accepted",
    resultReason: "ok",
    scannedBy: "tera-operator-1",
    scannerName: "Tera 01050742 · Katonga Hall",
    deviceId: "01050742",
    deviceLabel: "Tera HW0009 · Katonga Hall",
    scannedAt: "2026-10-19T05:45:00.000Z",
    registrationDaysAttending: ["Day 1", "Day 2"],
    matchedAttendanceDays: ["Day 1"],
  },
]

test("scanner analytics report exact coverage, event eligibility, operators, and rejection reasons", () => {
  const analytics = buildRecScanAnalytics({ scans, registrations, events, conference })

  assert.deepEqual(analytics.summary, {
    totalScanRecords: 4,
    acceptedScans: 3,
    rejectedScans: 1,
    duplicateScans: 0,
    uniqueAttendees: 1,
    registeredAttendees: 2,
    notYetScanned: 1,
    attendanceRate: 50,
    acceptanceRate: 75,
    configuredEvents: 2,
    activeEvents: 2,
  })
  assert.equal(analytics.byEvent.find((event) => event.eventId === "lunch-day-2").eligibleRegistrants, 1)
  assert.equal(analytics.byEvent.find((event) => event.eventId === "lunch-day-2").attendanceRate, 100)
  assert.equal(analytics.byScanner.find((scanner) => scanner.key === "scanner:two").total, 2)
  assert.equal(analytics.byScanner.find((scanner) => scanner.key === "tera-operator-1").accepted, 1)
  assert.equal(analytics.rejectionReasons[0].key, "registration_day_not_allowed")
  assert.equal(analytics.timeline.length, 2)
})

test("registrant attendance rows are searchable and filterable", () => {
  const rows = buildRecScanRegistrantRows({ registrations, scans, events })
  const amina = rows.find((row) => row.registrationId === "reg-1")
  assert.equal(amina.name, "Dr Amina Nabirye")
  assert.equal(amina.eventCount, 2)
  assert.equal(amina.acceptedScans, 3)
  assert.equal(amina.lastScanAt, "2026-10-20T09:00:00.000Z")
  assert.equal(amina.lastScanEventName, "Lunch - Day 2")
  assert.equal(amina.eventsAttended[0].name, "Lunch - Day 2")
  assert.equal(amina.eventsAttended[1].name, "Main Entrance - Day 1")
  assert.deepEqual(filterRecScanRegistrantRows(rows, { attendance: "not_scanned" }).map((row) => row.registrationId), ["reg-2"])
  assert.deepEqual(filterRecScanRegistrantRows(rows, { search: "solar" }).map((row) => row.registrationId), ["reg-2"])
  assert.deepEqual(filterRecScanRegistrantRows(rows, { participantCategory: "ug_eu_bf" }).map((row) => row.registrationId), ["reg-1"])
  assert.deepEqual(filterRecScanRegistrantRows(rows, { participantCategory: "rec" }).map((row) => row.registrationId), ["reg-2"])
})

test("scan log rows resolve registrant and event names and support filters", () => {
  const rows = buildRecScanLogRows({ scans, registrations, events })
  assert.equal(rows[0].scanId, "scan-3")
  assert.equal(rows[0].registrantName, "Peter Okello")
  assert.equal(rows[0].eventName, "Lunch - Day 2")
  assert.equal(filterRecScanLogRows(rows, { status: "rejected" }).length, 1)
  assert.equal(filterRecScanLogRows(rows, { scanner: "scanner:one" }).length, 1)

  const teraRow = rows.find((row) => row.scanId === "scan-4")
  assert.equal(teraRow.registrantName, "Dr Amina Nabirye")
  assert.equal(teraRow.eventName, "Main Entrance - Day 1")
  assert.equal(teraRow.scannerKind, "tera")
  assert.equal(teraRow.deviceLabel, "Tera HW0009 · Katonga Hall")
  assert.equal(filterRecScanLogRows(rows, { search: "katonga" }).length, 1)
})

test("analytics CSV output neutralizes spreadsheet formulas", () => {
  const csv = rowsToRecAnalyticsCsv(
    [{ key: "name", label: "Name" }, { key: "organization", label: "Organization" }],
    [{ name: "=HYPERLINK(\"bad\")", organization: "NREP, Uganda" }]
  )
  assert.match(csv, /^Name,Organization\r\n"'/)
  assert.match(csv, /"NREP, Uganda"/)
})

test("scanner leaderboard ranks by accepted scans and a scanner can find their own place", () => {
  const leaderboard = buildRecScannerLeaderboard(scans)
  assert.deepEqual(leaderboard.map((item) => item.key), ["scanner:one", "scanner:two", "tera-operator-1"])
  assert.equal(leaderboard.find((item) => item.key === "scanner:two").total, 2)
  assert.equal(leaderboard.find((item) => item.key === "scanner:two").accepted, 1)

  const mine = getRecScannerRankInfo(leaderboard, "tera-operator-1")
  assert.equal(mine.rank, 3)
  assert.equal(mine.totalScanners, 3)
  assert.equal(mine.mine.accepted, 1)
  // Only this scanner's own row comes back - the response never carries anyone else's row.
  assert.equal(Object.keys(mine).includes("leaderboard"), false)

  const unknown = getRecScannerRankInfo(leaderboard, "someone-else")
  assert.equal(unknown.mine, null)
  assert.equal(unknown.rank, null)
  assert.equal(unknown.totalScanners, 3)
})

test("scan alerts never expose attendee-identifying fields", () => {
  const scan = {
    $id: "scan-dup-1",
    status: "duplicate",
    conferenceId: "conf-1",
    eventId: "entry-day-1",
    registrationId: "reg-1",
    registrationEmail: "amina@example.com",
    venue: "Main Gate",
    scanType: "conference_entry",
    day: 1,
    scannedAt: "2026-10-19T09:05:00.000Z",
  }

  const alert = formatRecScanAlert(scan, events[0])
  assert.deepEqual(alert, {
    id: "scan-dup-1",
    eventId: "entry-day-1",
    eventName: "Main Entrance - Day 1",
    venue: "Main Gate",
    scanType: "conference_entry",
    day: 1,
    scannedAt: "2026-10-19T09:05:00.000Z",
  })
  assert.equal(Object.hasOwn(alert, "registrationId"), false)
  assert.equal(Object.hasOwn(alert, "registrationEmail"), false)
  assert.equal(Object.hasOwn(alert, "name"), false)
})

test("scan alerts fall back to the raw scan venue and type when the event is gone, and sort newest first", () => {
  const alert = formatRecScanAlert({
    $id: "scan-dup-2",
    status: "duplicate",
    venue: "Lunch Hall",
    scanType: "lunch",
    scannedAt: "2026-10-20T12:05:00.000Z",
  }, null)
  assert.equal(alert.eventName, "")
  assert.equal(alert.venue, "Lunch Hall")
  assert.equal(alert.scanType, "lunch")

  const alerts = buildRecScanAlerts([
    { $id: "a", status: "accepted", eventId: "entry-day-1", scannedAt: "2026-10-19T09:00:00.000Z" },
    { $id: "b", status: "duplicate", eventId: "entry-day-1", scannedAt: "2026-10-19T09:05:00.000Z" },
    { $id: "c", status: "duplicate", eventId: "lunch-day-2", scannedAt: "2026-10-19T09:10:00.000Z" },
  ], events)

  assert.deepEqual(alerts.map((item) => item.id), ["c", "b"])
  assert.equal(alerts[0].eventName, "Lunch - Day 2")
})

test("analytics pagination bounds pages and preserves report totals", () => {
  const rows = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }))

  const secondPage = paginateRecAnalyticsRows(rows, 2, 10)
  assert.deepEqual(secondPage.documents.map((row) => row.id), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
  assert.equal(secondPage.total, 23)
  assert.equal(secondPage.totalPages, 3)

  const boundedPage = paginateRecAnalyticsRows(rows, 99, 10)
  assert.equal(boundedPage.page, 3)
  assert.deepEqual(boundedPage.documents.map((row) => row.id), [21, 22, 23])
})
