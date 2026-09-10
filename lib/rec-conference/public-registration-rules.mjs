import {
  REC_IMPORT_SECTORS,
  REC_IMPORT_TITLES,
  buildKampalaAttendanceRange,
  normalizeCouponCode,
  normalizeRegistrationEmail,
  parseConferenceDays,
} from "./registration-import-rules.mjs"
import { normalizeRecOptionalSessions } from "./registration-tracks.mjs"

export const PUBLIC_REGISTRATION_TYPES = Object.freeze(["Attendee", "Exhibitor", "Sponsor"])

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanString(value) {
  return String(value || "").trim()
}

function parseJson(value, fallback) {
  if (!value) return fallback
  if (typeof value === "object") return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function parsePublicConferenceLimits(conference) {
  const maxLimits = parseJson(conference?.maxLimits, conference?.maxLimits) || {
    attendee: 800,
    exhibitor: 150,
    sponsor: 50,
  }
  const currentCounts = parseJson(conference?.currentCounts, conference?.currentCounts) || {
    attendee: 0,
    exhibitor: 0,
    sponsor: 0,
  }
  return { maxLimits, currentCounts }
}

export function getPublicRegistrationAvailability(conference) {
  if (!conference) {
    return {
      closed: true,
      couponRequired: false,
      message: "Registration is not available right now.",
    }
  }

  if (conference.registrationOpen !== true) {
    return {
      closed: true,
      couponRequired: false,
      message: cleanString(conference.regClosedMessage || conference.closedMessage)
        || "Registration for this conference is currently closed.",
    }
  }

  return {
    closed: false,
    couponRequired: conference.couponRequired === true,
    message: "",
  }
}

export function isPublicRegistrationTypeFull(conference, registrationType) {
  const typeKey = cleanString(registrationType).toLowerCase()
  const { maxLimits, currentCounts } = parsePublicConferenceLimits(conference)
  const limit = Number(maxLimits?.[typeKey])
  const current = Number(currentCounts?.[typeKey] || 0)
  return Number.isFinite(limit) && limit > 0 && current >= limit
}

export function validatePublicRegistrationPayload(input = {}, conference = null) {
  const errors = []
  const email = normalizeRegistrationEmail(input.email)
  const title = cleanString(input.title)
  const firstName = cleanString(input.firstName)
  const otherName = cleanString(input.otherName)
  const lastName = cleanString(input.lastName)
  const phone = cleanString(input.phone)
  const otherPhone = cleanString(input.otherPhone)
  const otherEmail = normalizeRegistrationEmail(input.otherEmail)
  const organization = cleanString(input.organization)
  const sectorValue = Array.isArray(input.sector) ? cleanString(input.sector[0]) : cleanString(input.sector)
  const city = cleanString(input.city)
  const stateRegion = cleanString(input.stateRegion)
  const country = cleanString(input.country)
  const registrationType = cleanString(input.registrationType) || "Attendee"
  const exhibitionDetails = cleanString(input.exhibitionDetails)
  const passportNumber = cleanString(input.passportNumber)
  const additionalComments = cleanString(input.additionalComments)
  const couponCode = normalizeCouponCode(input.coupon)
  const visaLetterRequired = input.visaLetterRequired === true || input.visaLetterRequired === "true"
  const additionalSessions = normalizeRecOptionalSessions(input.additionalSessions)
  const conferenceDays = parseConferenceDays(conference?.days)
  const allowedDayLabels = new Set(conferenceDays.map((day) => cleanString(day?.label)).filter(Boolean))
  const daysAttending = (Array.isArray(input.daysAttending) ? input.daysAttending : [])
    .map(cleanString)
    .filter((label) => allowedDayLabels.has(label))

  if (!title || !REC_IMPORT_TITLES.includes(title)) errors.push("Please select your title.")
  if (!firstName) errors.push("Your first name is required.")
  if (!lastName) errors.push("Your last name is required.")
  if (!email || !EMAIL_PATTERN.test(email)) errors.push("A valid email address is required.")
  if (otherEmail && !EMAIL_PATTERN.test(otherEmail)) errors.push("Other email must be a valid email address.")
  if (!phone) errors.push("Your phone number is required.")
  if (!organization) errors.push("Your organization or institution is required.")
  if (!sectorValue || !REC_IMPORT_SECTORS.includes(sectorValue)) errors.push("Please select your sector.")
  if (!city) errors.push("Your city is required.")
  if (!stateRegion) errors.push("Your state or region is required.")
  if (!country) errors.push("Your country is required.")
  if (!PUBLIC_REGISTRATION_TYPES.includes(registrationType)) errors.push("Please select a registration type.")
  if (!daysAttending.length) errors.push("Please select the conference days you will attend.")
  if (registrationType === "Exhibitor" && !exhibitionDetails) {
    errors.push("Please tell us about your exhibition.")
  }
  if (visaLetterRequired && !passportNumber) {
    errors.push("Passport number is required when you need a visa letter.")
  }

  const availability = getPublicRegistrationAvailability(conference)
  if (availability.closed) errors.push(availability.message)
  if (availability.couponRequired && !couponCode) {
    errors.push("A coupon code is required to complete this registration.")
  }
  if (conference && isPublicRegistrationTypeFull(conference, registrationType)) {
    errors.push(`${registrationType} registration is currently full.`)
  }

  const selectedDays = conferenceDays.filter((day) => daysAttending.includes(cleanString(day?.label)))
  const { eventStart, eventEnd } = buildKampalaAttendanceRange(selectedDays)

  return {
    valid: errors.length === 0,
    errors,
    payload: {
      email,
      title,
      firstName,
      otherName: otherName || null,
      lastName,
      phone,
      otherPhone: otherPhone || null,
      otherEmail: otherEmail || null,
      organization,
      sector: sectorValue ? [sectorValue] : [],
      city,
      stateRegion,
      country,
      registrationType,
      daysAttending,
      visaLetterRequired,
      passportNumber: passportNumber || null,
      visaLetterSent: false,
      additionalComments: additionalComments || null,
      exhibitionDetails: registrationType === "Exhibitor" ? exhibitionDetails : null,
      additionalSessions,
      coupon: couponCode || null,
      eventStart,
      eventEnd,
    },
  }
}
