import assert from "node:assert/strict"
import test from "node:test"
import {
  REC_SCAN_EVENT_DELETE_CONFIRMATION,
  HID_SCAN_CODES,
  HID_SCAN_TYPES,
  REC_2026_SCANNER_HALLS,
  REC_TERA_HW0009_DEPLOYMENTS,
  REC_TERA_HW0009_SERIALS,
  evaluateHidScanRules,
  getRecScanAttendanceEligibility,
  getRecScanEventBulkDeleteValidationError,
  getRecScanEventRequiredAttendanceDays,
  getRecScanEventWindowError,
  getRecScanEventWindowStatus,
  getRecScannerOperatorValidationError,
  isSessionHopperScan,
  isTeraHardwareSerial,
  normalizeRecScanEventIds,
  parseHidQrParticipantId,
  getTeraStationEventTypes,
  hidScanTypeToEventType,
  eventMatchesOperatorRestrictions,
  isTeraScannerOperator,
  selectTeraScanEvent,
  teraOperatorEmail,
  shouldRevokeRecScannerCredentials,
  getDefaultScannerAccessWindow,
  resolveTeraOperatorAccess,
} from "../lib/rec-conference/scanning-rules.mjs"

test("scan events are closed before their start time", () => {
  const status = getRecScanEventWindowStatus(
    {
      startTime: "2026-10-19T08:00:00+03:00",
      endTime: "2026-10-19T10:00:00+03:00",
    },
    "2026-10-19T07:59:59+03:00"
  )

  assert.equal(status.ok, false)
  assert.equal(status.code, "event_not_started")
})

test("scan events are open within the configured time period", () => {
  const status = getRecScanEventWindowStatus(
    {
      startTime: "2026-10-19T08:00:00+03:00",
      endTime: "2026-10-19T10:00:00+03:00",
    },
    "2026-10-19T09:00:00+03:00"
  )

  assert.equal(status.ok, true)
  assert.equal(status.code, "event_open")
})

test("scan events are closed after their end time", () => {
  const status = getRecScanEventWindowStatus(
    {
      startTime: "2026-10-19T08:00:00+03:00",
      endTime: "2026-10-19T10:00:00+03:00",
    },
    "2026-10-19T10:00:01+03:00"
  )

  assert.equal(status.ok, false)
  assert.equal(status.code, "event_ended")
})

test("scan event setup rejects an end time before the start time", () => {
  const error = getRecScanEventWindowError({
    startTime: "2026-10-19T10:00:00+03:00",
    endTime: "2026-10-19T08:00:00+03:00",
  })

  assert.equal(error.code, "invalid_event_time_window")
})

test("bulk scan event deletion normalizes selection and protects destructive retries", () => {
  assert.deepEqual(normalizeRecScanEventIds([" event-1 ", "event-2", "event-1", ""]), [
    "event-1",
    "event-2",
  ])

  assert.equal(getRecScanEventBulkDeleteValidationError({
    conferenceId: "conference-1",
    eventIds: ["event-1"],
  }), null)

  assert.equal(getRecScanEventBulkDeleteValidationError({
    conferenceId: "conference-1",
    eventIds: ["event-1"],
    deleteScanData: true,
  }).code, "scan_data_confirmation_required")

  assert.equal(getRecScanEventBulkDeleteValidationError({
    conferenceId: "conference-1",
    eventIds: ["event-1"],
    deleteScanData: true,
    confirmation: REC_SCAN_EVENT_DELETE_CONFIRMATION,
  }), null)

  assert.equal(getRecScanEventBulkDeleteValidationError({
    conferenceId: "conference-1",
    eventIds: Array.from({ length: 101 }, (_, index) => `event-${index}`),
  }).code, "too_many_events")
})

test("scanner operator setup validates identity, status, and access window", () => {
  assert.equal(getRecScannerOperatorValidationError({
    name: "REC Entrance Team",
    email: "scanner@nrep.ug",
    status: "active",
    accessStartsAt: "2026-10-19T07:00:00+03:00",
    accessEndsAt: "2026-10-19T18:00:00+03:00",
  }), null)

  assert.equal(getRecScannerOperatorValidationError({
    name: "REC Entrance Team",
    email: "not-an-email",
    status: "active",
  }).code, "invalid_email")

  assert.equal(getRecScannerOperatorValidationError({
    name: "REC Entrance Team",
    email: "scanner@nrep.ug",
    status: "active",
    accessStartsAt: "2026-10-19T18:00:00+03:00",
    accessEndsAt: "2026-10-19T07:00:00+03:00",
  }).code, "invalid_access_window")
})

test("operator identity and access changes revoke existing scanner credentials", () => {
  const current = {
    email: "scanner@nrep.ug",
    status: "active",
    accessStartsAt: "2026-10-19T07:00:00+03:00",
    accessEndsAt: "2026-10-19T18:00:00+03:00",
  }

  assert.equal(shouldRevokeRecScannerCredentials(current, { ...current, name: "Updated Name" }), false)
  assert.equal(shouldRevokeRecScannerCredentials(current, {
    ...current,
    accessStartsAt: "2026-10-19T04:00:00.000Z",
    accessEndsAt: "2026-10-19T15:00:00.000Z",
  }), false)
  assert.equal(shouldRevokeRecScannerCredentials(current, { ...current, email: "new-scanner@nrep.ug" }), true)
  assert.equal(shouldRevokeRecScannerCredentials(current, { ...current, status: "suspended" }), true)
  assert.equal(shouldRevokeRecScannerCredentials(current, { ...current, accessEndsAt: "2026-10-19T17:00:00+03:00" }), true)
})

test("scan event attendance days can be inferred from conference day number", () => {
  const requiredDays = getRecScanEventRequiredAttendanceDays(
    { day: 2, allowedDaysAttending: [] },
    { days: [{ label: "Day 1" }, { label: "Day 2" }] }
  )

  assert.deepEqual(requiredDays, ["Day 2"])
})

test("scan event attendance days can be inferred from day labels with numbers", () => {
  const requiredDays = getRecScanEventRequiredAttendanceDays(
    { day: "Day 2", allowedDaysAttending: [] },
    { days: [{ label: "Opening Day" }, { label: "Expo Day" }] }
  )

  assert.deepEqual(requiredDays, ["Expo Day"])
})

test("scan attendance eligibility accepts matching registered days", () => {
  const eligibility = getRecScanAttendanceEligibility(
    { daysAttending: ["Day 1", "Day 3"] },
    { day: 3, allowedDaysAttending: [] },
    { days: [{ label: "Day 1" }, { label: "Day 2" }, { label: "Day 3" }] }
  )

  assert.equal(eligibility.ok, true)
  assert.deepEqual(eligibility.matchedDays, ["Day 3"])
})

test("scan attendance eligibility rejects a wrong conference day", () => {
  const eligibility = getRecScanAttendanceEligibility(
    { daysAttending: ["Day 2"] },
    { day: 1, allowedDaysAttending: [] },
    { days: [{ label: "Day 1" }, { label: "Day 2" }] }
  )

  assert.equal(eligibility.ok, false)
  assert.equal(eligibility.reason, "registration_day_not_allowed")
  assert.deepEqual(eligibility.requiredDays, ["Day 1"])
  assert.deepEqual(eligibility.registeredDays, ["Day 2"])
})

test("Tera HW0009 fleet contains the ten registered serials", () => {
  assert.deepEqual(REC_TERA_HW0009_SERIALS, [
    "01273102",
    "01050742",
    "01272982",
    "01273052",
    "01273072",
    "01050792",
    "01272972",
    "01273062",
    "01273112",
    "01273082",
  ])
  assert.equal(isTeraHardwareSerial("01273102"), true)
  assert.equal(isTeraHardwareSerial("99999999"), false)
})

test("Tera units are assigned to eight halls plus two main-entrance scanners", () => {
  const halls = REC_TERA_HW0009_DEPLOYMENTS.filter((unit) => unit.assignedRole === "Hall Steward")
  const entrances = REC_TERA_HW0009_DEPLOYMENTS.filter((unit) => unit.assignedRole === "Main Gate")
  assert.equal(REC_2026_SCANNER_HALLS.length, 8)
  assert.equal(halls.length, 8)
  assert.equal(new Set(halls.map((unit) => unit.deployedLocation)).size, 8)
  assert.equal(entrances.length, 2)
  assert.equal(entrances.every((unit) => unit.deployedLocation === "Main Entrance"), true)
  assert.equal(REC_TERA_HW0009_DEPLOYMENTS.length, 10)
  assert.equal(
    REC_TERA_HW0009_DEPLOYMENTS.some((unit) => /dining|food court|exhibition/i.test(`${unit.assignedRole} ${unit.deployedLocation}`)),
    false
  )
  for (const unit of halls) {
    const types = getTeraStationEventTypes(unit.assignedRole, unit.deployedLocation)
    assert.deepEqual(types, ["session_entry", "lunch"])
  }
  for (const unit of entrances) {
    const types = getTeraStationEventTypes(unit.assignedRole, unit.deployedLocation)
    assert.deepEqual(types, ["conference_entry", "lunch"])
  }
})

test("exhibitor row devices cannot scan outside an exhibition hall", () => {
  const result = evaluateHidScanRules({
    assignedRole: "Exhibition Row 1",
    deployedLocation: "Session Hall A",
    now: "2026-10-19T09:00:00+03:00",
  })

  assert.equal(result.ok, false)
  assert.equal(result.code, HID_SCAN_CODES.EXHIBITOR_DEVICE_RESTRICTED)
})

test("exhibitor row devices can scan inside an exhibition hall during entrance hours", () => {
  const result = evaluateHidScanRules({
    assignedRole: "Exhibition Row 2",
    deployedLocation: "Exhibition Row 2",
    now: "2026-10-19T09:00:00+03:00",
  })

  assert.equal(result.ok, true)
  assert.equal(result.scanType, HID_SCAN_TYPES.ENTRANCE_ACCESS)
})

test("morning scans resolve to entrance access", () => {
  const result = evaluateHidScanRules({
    assignedRole: "Main Gate",
    deployedLocation: "Main Entrance",
    now: "2026-10-19T07:30:00+03:00",
  })

  assert.equal(result.ok, true)
  assert.equal(result.scanType, HID_SCAN_TYPES.ENTRANCE_ACCESS)
})

test("lunch window defaults to lunch check-in", () => {
  const result = evaluateHidScanRules({
    assignedRole: "Hall Steward",
    deployedLocation: "Nile Hall",
    now: "2026-10-19T13:30:00+03:00",
  })

  assert.equal(result.ok, true)
  assert.equal(result.scanType, HID_SCAN_TYPES.LUNCH_CHECKIN)
})

test("session hall lunch scans override to session attendance when a breakout is live", () => {
  const result = evaluateHidScanRules({
    assignedRole: "Hall Steward",
    deployedLocation: "Addis Hall",
    now: "2026-10-19T13:15:00+03:00",
    isBreakoutSessionActive: true,
  })

  assert.equal(result.ok, true)
  assert.equal(result.scanType, HID_SCAN_TYPES.SESSION_ATTENDANCE)
})

test("session hall lunch scans stay lunch check-in when no breakout is running", () => {
  const result = evaluateHidScanRules({
    assignedRole: "Hall Steward",
    deployedLocation: "Addis Hall",
    now: "2026-10-19T13:15:00+03:00",
    isBreakoutSessionActive: false,
  })

  assert.equal(result.ok, true)
  assert.equal(result.scanType, HID_SCAN_TYPES.LUNCH_CHECKIN)
})

test("afternoon scans resolve to late arrival access", () => {
  const result = evaluateHidScanRules({
    assignedRole: "Main Gate",
    deployedLocation: "Main Entrance",
    now: "2026-10-19T14:00:00+03:00",
  })

  assert.equal(result.ok, true)
  assert.equal(result.scanType, HID_SCAN_TYPES.LATE_ARRIVAL_ACCESS)
})

test("scans outside the defined time gates are rejected", () => {
  const noonGap = evaluateHidScanRules({
    assignedRole: "Main Gate",
    deployedLocation: "Main Entrance",
    now: "2026-10-19T12:30:00+03:00",
  })
  const afterClose = evaluateHidScanRules({
    assignedRole: "Main Gate",
    deployedLocation: "Main Entrance",
    now: "2026-10-19T16:01:00+03:00",
  })

  assert.equal(noonGap.code, HID_SCAN_CODES.OUT_OF_WINDOW)
  assert.equal(afterClose.code, HID_SCAN_CODES.OUT_OF_WINDOW)
})

test("Tera stations map onto the previous scan-event types", () => {
  assert.deepEqual(getTeraStationEventTypes("Hall Steward", "Achwa Hall"), ["session_entry", "lunch"])
  assert.deepEqual(getTeraStationEventTypes("Main Gate", "Main Entrance"), ["conference_entry", "lunch"])
  assert.equal(hidScanTypeToEventType(HID_SCAN_TYPES.ENTRANCE_ACCESS), "conference_entry")
  assert.equal(hidScanTypeToEventType(HID_SCAN_TYPES.LUNCH_CHECKIN), "lunch")
  assert.equal(hidScanTypeToEventType(HID_SCAN_TYPES.SESSION_ATTENDANCE), "session_entry")
})

test("Tera barcode scanners are registered as operators with a stable device email", () => {
  assert.equal(teraOperatorEmail("01273102"), "sn01273102@tera.rec.local")
  assert.equal(isTeraScannerOperator({ email: "sn01273102@tera.rec.local" }), true)
  assert.equal(isTeraScannerOperator({ email: "gate@example.com" }), false)
  assert.equal(
    eventMatchesOperatorRestrictions(
      { $id: "lunch-1", type: "lunch", venue: "Dining Hall", day: 1 },
      { allowedEventTypes: ["lunch"], allowedEventIds: ["lunch-1"] }
    ),
    true
  )
  assert.equal(
    eventMatchesOperatorRestrictions(
      { $id: "entry-1", type: "conference_entry", venue: "Main Entrance", day: 1 },
      { allowedEventTypes: ["lunch"] }
    ),
    false
  )
})

test("Tera scanners inherit the same default access window as phone operators", () => {
  const conference = {
    startDate: "2026-09-08",
    endDate: "2026-09-10",
    days: [
      { date: "2026-09-08", label: "Day 1" },
      { date: "2026-09-09", label: "Day 2" },
      { date: "2026-09-10", label: "Day 3" },
    ],
  }

  assert.deepEqual(getDefaultScannerAccessWindow(conference), {
    accessStartsAt: "2026-09-08T08:00:00+03:00",
    accessEndsAt: "2026-09-10T18:00:00+03:00",
    allowedDays: ["1", "2", "3"],
  })

  const created = resolveTeraOperatorAccess(null, conference, {})
  assert.equal(created.accessStartsAt, "2026-09-08T08:00:00+03:00")
  assert.equal(created.accessEndsAt, "2026-09-10T18:00:00+03:00")
  assert.deepEqual(created.allowedDays, ["1", "2", "3"])

  const preserved = resolveTeraOperatorAccess({
    accessStartsAt: "2026-09-08T09:56:00+03:00",
    accessEndsAt: "2026-09-08T17:56:00+03:00",
    allowedDays: ["1", "2"],
  }, conference, {})
  assert.equal(preserved.accessStartsAt, "2026-09-08T09:56:00+03:00")
  assert.deepEqual(preserved.allowedDays, ["1", "2"])

  const assigned = resolveTeraOperatorAccess(preserved, conference, {
    accessStartsAt: "2026-09-08T08:00:00+03:00",
    accessEndsAt: "2026-09-08T17:00:00+03:00",
    allowedDays: ["1", "2", "3"],
  })
  assert.equal(assigned.accessStartsAt, "2026-09-08T08:00:00+03:00")
  assert.equal(assigned.accessEndsAt, "2026-09-08T17:00:00+03:00")
  assert.deepEqual(assigned.allowedDays, ["1", "2", "3"])
})

test("Tera stations pick the open matching scan event by type and venue", () => {
  const events = [
    {
      $id: "session",
      type: "session_entry",
      name: "Nile session",
      venue: "Nile Hall",
      isActive: true,
      startTime: "2026-10-19T08:00:00+03:00",
      endTime: "2026-10-19T12:00:00+03:00",
      sortOrder: 1,
    },
    {
      $id: "lunch",
      type: "lunch",
      name: "Lunch Day 1",
      venue: "",
      isActive: true,
      startTime: "2026-10-19T13:00:00+03:00",
      endTime: "2026-10-19T14:00:00+03:00",
      sortOrder: 2,
    },
  ]

  const morning = selectTeraScanEvent(events, {
    assignedRole: "Hall Steward",
    deployedLocation: "Nile Hall",
    now: "2026-10-19T09:00:00+03:00",
    preferredEventType: "session_entry",
  })
  const lunch = selectTeraScanEvent(events, {
    assignedRole: "Hall Steward",
    deployedLocation: "Nile Hall",
    now: "2026-10-19T13:15:00+03:00",
    preferredEventType: "lunch",
  })

  assert.equal(morning.$id, "session")
  assert.equal(lunch.$id, "lunch")
})

test("HID QR payloads extract a participant id from raw, JSON, and URL values", () => {
  assert.equal(parseHidQrParticipantId("reg_123"), "reg_123")
  assert.equal(parseHidQrParticipantId('{"participantId":"abc-9"}'), "abc-9")
  assert.equal(parseHidQrParticipantId("https://rec.nrep.ug/badges/token-77"), "token-77")
})

test("session hopper detection flags a hall change inside the trailing window", () => {
  assert.equal(
    isSessionHopperScan({ deployedLocation: "Session Hall A" }, "Session Hall B"),
    true
  )
  assert.equal(
    isSessionHopperScan({ deployedLocation: "Session Hall A" }, "Session Hall A"),
    false
  )
})
