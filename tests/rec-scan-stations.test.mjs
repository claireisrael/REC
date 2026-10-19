import assert from "node:assert/strict"
import test from "node:test"
import {
  buildRecScanAnalytics,
  buildRecScanLogRows,
  buildRecScanRegistrantRows,
  filterRecScansByStation,
  formatRecScanStationName,
  listRecScanStations,
  recScanStationKey,
} from "../lib/rec-conference/scanning-analytics.mjs"

const events = [{ $id: "entry-2", name: "Main Entrance - Day 2", type: "conference_entry", day: 2 }]
const registrations = [{ $id: "r1", firstName: "Ann" }, { $id: "r2", firstName: "Ben" }, { $id: "r3", firstName: "Cy" }]
const eu = { scannedBy: "op-eu", scannerName: "Tera 01272972 · Main Entrance-EU", deviceId: "01272972" }
const gate = { scannedBy: "op-gate", scannerName: "Tera 01273112 · Main Entrance", deviceId: "01273112" }
const scans = [
  { ...eu, eventId: "entry-2", registrationId: "r1", status: "accepted", scannedAt: "2026-10-20T05:00:00Z" },
  { ...eu, eventId: "entry-2", registrationId: "r2", status: "accepted", scannedAt: "2026-10-20T05:01:00Z" },
  { ...eu, eventId: "entry-2", registrationId: "r2", status: "duplicate", scannedAt: "2026-10-20T05:02:00Z" },
  { ...gate, eventId: "entry-2", registrationId: "r3", status: "accepted", scannedAt: "2026-10-20T05:03:00Z" },
  { ...gate, eventId: "entry-2", registrationId: "r1", status: "rejected", scannedAt: "2026-10-20T05:04:00Z" },
]

test("a station is the scanner that recorded the scan", () => {
  assert.equal(recScanStationKey(eu), "op-eu")
  assert.equal(recScanStationKey({ scannerName: "Phone Jane" }), "Phone Jane")
  assert.equal(recScanStationKey({}), "unknown")
  assert.equal(formatRecScanStationName("Tera 01272972 · Main Entrance-EU"), "Main Entrance-EU · Tera 01272972")
  assert.equal(formatRecScanStationName("Jane Doe"), "Jane Doe")
})

test("stations are listed with their participants, Tera units first", () => {
  const stations = listRecScanStations([...scans, { scannedBy: "phone-1", scannerName: "Agaba", status: "accepted", registrationId: "r3" }])
  assert.deepEqual(stations.map((station) => [station.name, station.uniqueRegistrants, station.kind]), [
    ["Main Entrance · Tera 01273112", 1, "tera"],
    ["Main Entrance-EU · Tera 01272972", 2, "tera"],
    ["Agaba", 1, "phone"],
  ])
})

test("the shared entrance event is split by station", () => {
  const { byEventStation, byEvent } = buildRecScanAnalytics({ scans, registrations, events })
  assert.equal(byEvent[0].uniqueRegistrants, 3)
  assert.deepEqual(byEventStation.map((row) => [row.stationName, row.uniqueRegistrants, row.duplicates, row.rejected]), [
    ["Main Entrance · Tera 01273112", 1, 0, 1],
    ["Main Entrance-EU · Tera 01272972", 2, 1, 0],
  ])
})

test("filtering by station shows only who that entrance scanned", () => {
  const euScans = filterRecScansByStation(scans, "op-eu")
  const rows = buildRecScanRegistrantRows({ registrations, scans: euScans, events })
  assert.deepEqual(rows.filter((row) => row.attendanceStatus === "scanned").map((row) => row.name), ["Ann", "Ben"])
  assert.deepEqual(rows.find((row) => row.registrationId === "r1").stations, ["Main Entrance-EU · Tera 01272972"])
  assert.equal(filterRecScansByStation(scans, "").length, scans.length)
  assert.equal(buildRecScanLogRows({ scans: euScans, registrations, events })[0].stationName, "Main Entrance-EU · Tera 01272972")
})
