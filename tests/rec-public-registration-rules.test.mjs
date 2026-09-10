import assert from "node:assert/strict"
import test from "node:test"
import {
  getPublicRegistrationAvailability,
  isPublicRegistrationTypeFull,
  validatePublicRegistrationPayload,
} from "../lib/rec-conference/public-registration-rules.mjs"

const conference = {
  year: 2026,
  title: "Renewable Energy Conference & Expo 2026",
  registrationOpen: true,
  couponRequired: false,
  days: [
    { label: "Day 1", date: "2026-10-19" },
    { label: "Day 2", date: "2026-10-20" },
  ],
  maxLimits: { attendee: 800, exhibitor: 150, sponsor: 50 },
  currentCounts: { attendee: 10, exhibitor: 0, sponsor: 0 },
}

const validInput = {
  title: "Ms.",
  firstName: "Amina",
  lastName: "Nabirye",
  email: "amina@example.com",
  phone: "+256700000001",
  organization: "Example Energy",
  sector: ["Private"],
  city: "Kampala",
  stateRegion: "Central",
  country: "Uganda",
  registrationType: "Attendee",
  daysAttending: ["Day 1"],
  additionalSessions: ["marketplace"],
}

test("people can register themselves when public registration is open", () => {
  const result = validatePublicRegistrationPayload(validInput, conference)
  assert.equal(result.valid, true)
  assert.equal(result.payload.email, "amina@example.com")
  assert.deepEqual(result.payload.additionalSessions, ["marketplace"])
  assert.equal(getPublicRegistrationAvailability(conference).closed, false)
})

test("public registration stays closed to the public when admins close it", () => {
  const availability = getPublicRegistrationAvailability({
    ...conference,
    registrationOpen: false,
    regClosedMessage: "Online registration is closed.",
  })
  assert.equal(availability.closed, true)
  assert.match(availability.message, /Online registration is closed/)

  const result = validatePublicRegistrationPayload(validInput, {
    ...conference,
    registrationOpen: false,
  })
  assert.equal(result.valid, false)
})

test("a required coupon blocks public self-registration until one is provided", () => {
  const result = validatePublicRegistrationPayload(validInput, {
    ...conference,
    couponRequired: true,
  })
  assert.equal(result.valid, false)
  assert.match(result.errors.join(" "), /coupon code/i)
})

test("public registration stops when the selected type is full", () => {
  assert.equal(
    isPublicRegistrationTypeFull({
      ...conference,
      currentCounts: { attendee: 800, exhibitor: 0, sponsor: 0 },
    }, "Attendee"),
    true
  )
})
