import assert from "node:assert/strict"
import test from "node:test"
import {
  REC_TERA_HW0009_SERIALS,
  isOperatorAssignedToTera,
  isTeraOperatorLoginRequired,
  isTeraStationDeviceId,
  isTeraStationOtpIdFor,
  maskEmailAddress,
  normalizeTeraSerialAssignments,
  parseTeraStationDeviceId,
  teraOperatorEmail,
  teraStationDeviceId,
  teraStationOtpHashInput,
  teraStationOtpId,
} from "../lib/rec-conference/scanning-rules.mjs"

const [GATE, HALL] = REC_TERA_HW0009_SERIALS

test("only known Tera serials can be assigned, once each", () => {
  assert.deepEqual(normalizeTeraSerialAssignments([GATE, ` ${GATE} `, "99999999", "", HALL]), [GATE, HALL])
  assert.deepEqual(normalizeTeraSerialAssignments(`${HALL},nope`), [HALL])
  assert.deepEqual(normalizeTeraSerialAssignments(undefined), [])
})

test("an operator unlocks only the units assigned to them", () => {
  const person = { email: "jane@example.org", teraSerials: [GATE] }
  assert.equal(isOperatorAssignedToTera(person, GATE), true)
  assert.equal(isOperatorAssignedToTera(person, HALL), false)
  assert.equal(isOperatorAssignedToTera({ email: "x@example.org" }, GATE), false)
  assert.equal(isOperatorAssignedToTera(null, GATE), false)
  assert.equal(isOperatorAssignedToTera(person, ""), false)
})

test("a station's own placeholder operator can never unlock a unit", () => {
  const placeholder = { email: teraOperatorEmail(GATE), teraSerials: [GATE] }
  assert.equal(isOperatorAssignedToTera(placeholder, GATE), false)
  const byOrganization = { email: "ops@example.org", organization: "Tera HW0009", teraSerials: [GATE] }
  assert.equal(isOperatorAssignedToTera(byOrganization, GATE), false)
})

test("station sessions are marked so a phone cannot pose as a unit", () => {
  assert.equal(teraStationDeviceId(GATE), `tera:${GATE}`)
  assert.equal(parseTeraStationDeviceId(`tera:${GATE}`), GATE)
  assert.equal(parseTeraStationDeviceId(GATE), "")
  assert.equal(isTeraStationDeviceId(`tera:${GATE}`), true)
  assert.equal(isTeraStationDeviceId("a1b2c3-phone"), false)
  assert.equal(teraStationDeviceId(""), "")
})

test("a station code is bound to its unit", () => {
  const otpId = teraStationOtpId(GATE, "uuid-1")
  assert.equal(isTeraStationOtpIdFor(otpId, GATE), true)
  assert.equal(isTeraStationOtpIdFor(otpId, HALL), false)
  assert.equal(isTeraStationOtpIdFor("6c1e-phone-otp", GATE), false)
  assert.notEqual(teraStationOtpHashInput(GATE, "123456"), teraStationOtpHashInput(HALL, "123456"))
  assert.notEqual(teraStationOtpHashInput(GATE, "123456"), "123456")
})

test("operator sign-in is on unless explicitly switched off", () => {
  for (const value of [undefined, "", "on", "true", "1", "yes"]) assert.equal(isTeraOperatorLoginRequired(value), true, String(value))
  for (const value of ["off", "OFF", "false", "0", "no", "disabled", " off "]) assert.equal(isTeraOperatorLoginRequired(value), false, value)
})

test("emails are masked on the station screen", () => {
  assert.equal(maskEmailAddress("jane.doe@nrep.ug"), "ja••••••@nrep.ug")
  assert.equal(maskEmailAddress("ab@x.org"), "a•@x.org")
  assert.equal(maskEmailAddress("not-an-email"), "")
})
