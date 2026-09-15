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
  assert.equal(formatRecBadgeDateRange("2026-10-19", "2026-10-22", 2026), "19TH - 22ND OCT. 2026")
  assert.equal(formatRecBadgeDateRange("", "", 2026), "19TH - 22ND OCT. 2026")
  assert.equal(formatRecBadgeVenue({ venue: "Kampala Serena Hotel" }), "Kampala Serena Hotel")
  assert.equal(formatRecBadgeVenue({}), "Kampala Serena Hotel")
  assert.equal(
    formatRecBadgeTheme({ theme: "From Systems to Scale: Powering Uganda's Green Economy" }),
    "From Systems to Scale: Powering Uganda's Green Economy"
  )
  assert.equal(
    formatRecBadgeTheme({}),
    "From Systems to Scale: Powering Uganda's Green Economy"
  )
  assert.equal(formatRecBadgeEditionLine(2026), "2026 & Expo")
  assert.equal(formatRecBadgeHashtag(2026), "#REC26&EXPO")
})

test("the badge prints \"Delegate\" for attendee registrations, other types unchanged", () => {
  // Display-only: the badge wording changes, but registrationType itself
  // (used for scan eligibility, admin lists, exports) is untouched elsewhere.
  assert.equal(formatRecBadgeRoleLabel("Attendee"), "Delegate")
  assert.equal(formatRecBadgeRoleLabel("attendee"), "Delegate")
  assert.equal(formatRecBadgeRoleLabel("Exhibitor"), "Exhibitor")
  assert.equal(formatRecBadgeRoleLabel("Sponsor"), "Sponsor")
  assert.equal(formatRecBadgeRoleLabel(""), "")
  assert.equal(formatRecBadgeRoleLabel(null), "")
})
