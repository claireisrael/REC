import assert from "node:assert/strict"
import test from "node:test"
import {
  formatRecBadgeDateRange,
  formatRecBadgeDisplayName,
  formatRecBadgeEditionLine,
  formatRecBadgeHashtag,
  formatRecBadgeHonorific,
  formatRecBadgeRoleLabel,
  formatRecBadgeTheme,
  formatRecBadgeVenue,
  formatDelegateSerial,
  formatRecBadgeCardCopy,
  formatRecBadgeDayTag,
  formatRecBadgeDaysTag,
  formatRecWalkInBadgeName,
  readDelegateSerial,
  resolveRecBadgeRole,
} from "../lib/rec-conference/rec-badge-display.mjs"

test("badge names keep selected titles such as Ms. and Mr.", () => {
  assert.equal(formatRecBadgeHonorific("Ms"), "Ms.")
  assert.equal(formatRecBadgeHonorific("mr."), "Mr.")
  assert.equal(
    formatRecBadgeDisplayName({
      title: "Ms.",
      firstName: "Claire",
      otherName: "Israel",
      lastName: "Namagala",
    }),
    "Ms. Claire Israel Namagala"
  )
  assert.equal(
    formatRecBadgeDisplayName({ title: "Mr.", name: "Derrick Locha Mayiku" }),
    "Mr. Derrick Locha Mayiku"
  )
  assert.equal(
    formatRecBadgeDisplayName({ title: "Ms.", name: "Ms. Claire Namagala" }),
    "Ms. Claire Namagala"
  )
})

test("REC26 badge copy uses the 2026 dates, venue, theme, and edition line", () => {
  assert.equal(formatRecBadgeDateRange("2026-10-19", "2026-10-22", 2026), "19 - 22 OCTOBER, 2026")
  assert.equal(formatRecBadgeDateRange("", "", 2026), "19 - 22 OCTOBER, 2026")
  assert.equal(formatRecBadgeVenue({ venue: "Kampala Serena Hotel" }), "Kampala Serena Hotel")
  assert.equal(formatRecBadgeVenue({}), "Kampala Serena Hotel")
  assert.equal(
    formatRecBadgeTheme({ theme: "From Systems to Scale: Powering Uganda's Green Economy" }),
    "From Systems to Scale: Powering Uganda's Green Economy"
  )
  assert.equal(
    formatRecBadgeTheme({}),
    "From Systems to Scale: Transforming Uganda’s Green Economy"
  )
  assert.equal(formatRecBadgeEditionLine(2026), "2026 & Expo")
  assert.equal(formatRecBadgeHashtag(2026), "#REC26 & EXPO")
})

test("the badge prints \"Delegate\" for attendee registrations, other types unchanged", () => {
  // Display-only: the badge wording changes, but registrationType itself
  // (used for scan eligibility, admin lists, exports) is untouched elsewhere.
  assert.equal(formatRecBadgeRoleLabel("Attendee"), "Delegate")
  assert.equal(formatRecBadgeRoleLabel("attendee"), "Delegate")
  assert.equal(formatRecBadgeRoleLabel("Unregistered"), "Delegate")
  assert.equal(formatRecWalkInBadgeName({ registrationType: "Unregistered", firstName: "Unregistered", lastName: "REC26-000008" }), "Delegate REC26-000008")
  assert.equal(formatDelegateSerial(1), "D-001")
  assert.equal(formatDelegateSerial(12), "D-012")
  assert.equal(formatDelegateSerial(1000), "D-1000")
  assert.equal(readDelegateSerial("d-007"), 7)
  assert.deepEqual(
    formatRecBadgeCardCopy({ registrationType: "Unregistered", name: "Delegate REC26-000008", organization: "D-001" }),
    { name: "Delegate", underName: "D-001" }
  )
  assert.deepEqual(
    formatRecBadgeCardCopy({ registrationType: "Unregistered", organization: "Not registered" }),
    { name: "Delegate", underName: "" }
  )
  assert.deepEqual(
    formatRecBadgeCardCopy({ registrationType: "Attendee", name: "Tess Talemwa", organization: "Not provided" }),
    { name: "Tess Talemwa", underName: "" }
  )
  assert.deepEqual(
    formatRecBadgeCardCopy({ registrationType: "Attendee", name: "Ritah Isiko", organization: "LocalMotion Safaris" }),
    { name: "Ritah Isiko", underName: "LocalMotion Safaris" }
  )
  assert.deepEqual(
    formatRecBadgeCardCopy({
      registrationType: "Unregistered",
      organization: "D-121",
      badgeRole: "press",
      daysAttending: ["19th October – Day 1"],
    }),
    { name: "Press", underName: "D-121 · 19 OCT" }
  )
  assert.deepEqual(
    formatRecBadgeCardCopy({
      registrationType: "Unregistered",
      organization: "D-002",
      daysAttending: ["19th October – Day 1", "22nd October - Day 4"],
    }),
    { name: "Delegate", underName: "D-002 · 19 & 22 OCT" }
  )
  assert.equal(formatRecWalkInBadgeName({ registrationType: "Unregistered", badgeRole: "Press", lastName: "REC26-000009" }), "Press REC26-000009")
  assert.equal(formatRecBadgeDayTag("22nd October - Day 4"), "22 OCT")
  assert.equal(formatRecBadgeDayTag("Day 4"), "")
  assert.equal(formatRecBadgeDaysTag(["20th October – Day 2", "21st October – Day 3"]), "20 & 21 OCT")
  assert.equal(formatRecBadgeDaysTag(["19th October – Day 1"]), "19 OCT")
  assert.equal(formatRecBadgeDaysTag(["19th October – Day 1", "20th October – Day 2", "21st October – Day 3", "22nd October - Day 4"]), "")
  assert.deepEqual(
    formatRecBadgeCardCopy({
      registrationType: "Unregistered",
      organization: "D-101",
      daysAttending: ["21st October – Day 3", "22nd October - Day 4"],
    }),
    { name: "Delegate", underName: "D-101 · 21 & 22 OCT" }
  )
  assert.deepEqual(
    formatRecBadgeCardCopy({ registrationType: "Attendee", name: "Claire Namagala", organization: "NREP" }),
    { name: "Claire Namagala", underName: "NREP" }
  )
  assert.equal(formatRecBadgeRoleLabel("Exhibitor"), "Exhibitor")
  assert.equal(formatRecBadgeRoleLabel("Sponsor"), "Sponsor")
  assert.equal(formatRecBadgeRoleLabel(""), "")
  assert.equal(formatRecBadgeRoleLabel(null), "")
})

test("badge role uses the chosen role, otherwise follows the registration type", () => {
  assert.equal(resolveRecBadgeRole({ registrationType: "Attendee", badgeRole: "Official" }), "Official")
  assert.equal(resolveRecBadgeRole({ registrationType: "Attendee", badgeRole: "crew" }), "Crew")
  assert.equal(resolveRecBadgeRole({ registrationType: "Attendee" }), "Delegate")
  assert.equal(resolveRecBadgeRole({ registrationType: "Sponsor" }), "Delegate")
  assert.equal(resolveRecBadgeRole({ registrationType: "Exhibitor" }), "Exhibitor")
  assert.equal(resolveRecBadgeRole({ registrationType: "Attendee", badgeRole: "speaker" }), "Speaker")
  assert.equal(resolveRecBadgeRole({ registrationType: "Attendee", badgeRole: "Organiser" }), "Organiser")
  assert.equal(resolveRecBadgeRole({ registrationType: "Attendee", badgeRole: "eu-exhibitor" }), "EU-Exhibitor")
  assert.equal(resolveRecBadgeRole({ registrationType: "Attendee", badgeRole: "Press" }), "Press")
  assert.equal(resolveRecBadgeRole({ registrationType: "Attendee", badgeRole: "Sponsor" }), "Delegate")
  assert.equal(resolveRecBadgeRole({ registrationType: "Unregistered" }), "")
})
