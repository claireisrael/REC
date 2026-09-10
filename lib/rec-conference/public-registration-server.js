import { Query } from "node-appwrite"
import { config } from "@/lib/appwrite/config"
import {
  createRestDocument,
  getRestDocument,
  listRestDocuments,
  updateRestDocument,
} from "@/lib/appwrite/appwrite-rest-server"
import { sendRecRegistrationConfirmationEmail } from "@/lib/rec-conference/registration-email"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import { parseConferenceDays, getCouponImportValidationErrors } from "@/lib/rec-conference/registration-import-rules.mjs"
import {
  getPublicRegistrationAvailability,
  parsePublicConferenceLimits,
  validatePublicRegistrationPayload,
} from "@/lib/rec-conference/public-registration-rules.mjs"

export class RecPublicRegistrationError extends Error {
  constructor(status, code, message, details = {}) {
    super(message)
    this.name = "RecPublicRegistrationError"
    this.status = status
    this.code = code
    this.details = details
  }
}

function publicError(status, code, message, details = {}) {
  return new RecPublicRegistrationError(status, code, message, details)
}

function parseJson(value, fallback = null) {
  if (!value) return fallback
  if (typeof value === "object") return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function compactData(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  )
}

function serializePublicConference(document) {
  if (!document) return null
  const availability = getPublicRegistrationAvailability({
    ...document,
    closedMessage: document.regClosedMessage,
  })
  return {
    year: document.year,
    title: document.title,
    shortName: document.shortName || "",
    startDate: document.startDate || "",
    endDate: document.endDate || "",
    location: document.location || "",
    venue: document.venue || "",
    days: parseConferenceDays(document.days),
    registrationOpen: document.registrationOpen === true,
    couponRequired: document.couponRequired === true,
    closed: availability.closed,
    closedMessage: availability.message,
    sponsorshipPackageUrl: document.sponsorshipPackageUrl || "",
  }
}

async function getActiveConferenceDocument() {
  const result = await listRestDocuments(config.recConferencesCollectionId, [
    Query.equal("isActive", true),
    Query.orderDesc("year"),
    Query.limit(1),
  ])
  return result.documents?.[0] || null
}

export async function getPublicRegistrationConference() {
  const conference = await getActiveConferenceDocument()
  if (!conference) {
    throw publicError(404, "no_active_conference", "Registration is not available right now.")
  }
  return serializePublicConference(conference)
}

async function findRegistrationByEmail(email) {
  const result = await listRestDocuments(config.recRegistrationsCollectionId, [
    Query.equal("email", email),
    Query.limit(10),
  ])
  return (result.documents || []).find((registration) => (
    String(registration.email || "").trim().toLowerCase() === email
  )) || null
}

async function findCoupon(couponCode) {
  if (!couponCode) return null
  const result = await listRestDocuments(config.recCouponsCollectionId, [
    Query.equal("coupon", couponCode),
    Query.limit(1),
  ])
  return result.documents?.[0] || null
}

function sponsorshipFromCoupon(coupon) {
  if (!coupon) {
    return {
      sponsorOrganization: null,
      sponsorSector: null,
      sponsorCouponId: null,
    }
  }
  return {
    sponsorOrganization: String(coupon.organization || "").trim() || null,
    sponsorSector: String(coupon.sector || "").trim() || null,
    sponsorCouponId: coupon.$id,
  }
}

function mergedConferenceYears(existing, conferenceYear) {
  return Array.from(new Set([
    ...(Array.isArray(existing?.conferenceYears) ? existing.conferenceYears.map(Number) : []),
    Number(conferenceYear),
  ])).filter(Number.isFinite).sort((left, right) => left - right)
}

function alreadyRegisteredForYear(existing, conferenceYear) {
  return Array.isArray(existing?.conferenceYears)
    && existing.conferenceYears.map(Number).includes(Number(conferenceYear))
}

async function incrementConferenceCount(conference, registrationType) {
  const typeKey = String(registrationType || "").toLowerCase()
  const { currentCounts } = parsePublicConferenceLimits(conference)
  currentCounts[typeKey] = Number(currentCounts[typeKey] || 0) + 1
  await updateRestDocument(config.recConferencesCollectionId, conference.$id, {
    currentCounts: JSON.stringify(currentCounts),
  })
}

async function decrementCoupon(coupon, conferenceYear, registrationType) {
  const errors = getCouponImportValidationErrors(coupon, {
    couponCode: coupon?.coupon,
    conferenceYear,
    requiredSeats: 1,
  }).filter((message) => !message.includes("attendee coupon"))

  if (!coupon) {
    throw publicError(409, "coupon_unavailable", "That coupon code was not found.")
  }
  if (String(coupon.type || "").toLowerCase() !== String(registrationType || "").toLowerCase()) {
    errors.unshift(`That coupon is only valid for ${coupon.type} registration.`)
  }
  if (errors.length) {
    throw publicError(409, "coupon_unavailable", errors.join(" "))
  }
  const usersLeft = Number(coupon.usersLeft || 0)
  await updateRestDocument(config.recCouponsCollectionId, coupon.$id, {
    usersLeft: usersLeft - 1,
    isActive: usersLeft - 1 > 0,
  })
}

async function restoreCoupon(coupon) {
  if (!coupon) return
  try {
    const current = await getRestDocument(config.recCouponsCollectionId, coupon.$id)
    await updateRestDocument(config.recCouponsCollectionId, coupon.$id, {
      usersLeft: Number(current.usersLeft || 0) + 1,
      isActive: true,
    })
  } catch (error) {
    console.error("Public registration coupon rollback failed", error)
  }
}

export async function submitPublicRegistration(input = {}) {
  const conference = await getActiveConferenceDocument()
  if (!conference) {
    throw publicError(404, "no_active_conference", "Registration is not available right now.")
  }

  const parsedConference = {
    ...conference,
    days: parseConferenceDays(conference.days),
    maxLimits: parseJson(conference.maxLimits, conference.maxLimits),
    currentCounts: parseJson(conference.currentCounts, conference.currentCounts),
    closedMessage: conference.regClosedMessage,
  }

  const validated = validatePublicRegistrationPayload(input, parsedConference)
  if (!validated.valid) {
    throw publicError(422, "invalid_registration", validated.errors[0], { errors: validated.errors })
  }

  const existing = await findRegistrationByEmail(validated.payload.email)
  if (alreadyRegisteredForYear(existing, conference.year)) {
    throw publicError(
      409,
      "already_registered",
      `You have already registered for ${formatRecEdition(conference.year)}. Contact the organizers if you need to change your details.`
    )
  }

  let coupon = null
  let couponDecremented = false
  if (validated.payload.coupon) {
    coupon = await findCoupon(validated.payload.coupon)
    await decrementCoupon(coupon, conference.year, validated.payload.registrationType)
    couponDecremented = true
  }

  const registrationData = compactData({
    ...validated.payload,
    conferenceYears: mergedConferenceYears(existing, conference.year),
    ...sponsorshipFromCoupon(coupon),
    usedCoupon: null,
  })

  try {
    const registration = existing
      ? await updateRestDocument(config.recRegistrationsCollectionId, existing.$id, registrationData)
      : await createRestDocument(config.recRegistrationsCollectionId, registrationData)

    await incrementConferenceCount(conference, validated.payload.registrationType)

    let emailSent = false
    try {
      await sendRecRegistrationConfirmationEmail(registrationData, {
        year: conference.year,
        sponsorshipPackageUrl: conference.sponsorshipPackageUrl,
        administrativeInvite: false,
      })
      emailSent = true
    } catch (error) {
      console.error("Public registration confirmation email failed", error)
    }

    return {
      emailSent,
      conference: serializePublicConference(conference),
      registration: {
        email: registration.email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        registrationType: registration.registrationType,
        daysAttending: registration.daysAttending || [],
        additionalSessions: registration.additionalSessions || [],
      },
    }
  } catch (error) {
    if (couponDecremented) await restoreCoupon(coupon)
    throw error
  }
}

export function recPublicRegistrationErrorResponse(error, fallbackMessage = "Registration could not be completed") {
  if (error instanceof RecPublicRegistrationError) {
    return {
      status: error.status || 400,
      body: {
        error: error.message,
        code: error.code,
        details: error.details || {},
      },
    }
  }

  console.error(fallbackMessage, error)
  return {
    status: 500,
    body: { error: fallbackMessage },
  }
}
