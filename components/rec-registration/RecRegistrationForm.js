"use client"

import { useEffect, useMemo, useState } from "react"
import { Alert, Button, Card, Col, Form, Row, Spinner } from "@/components/ui/portal-kit"
import PhoneInput from "react-phone-input-2"
import "react-phone-input-2/lib/style.css"
import countries from "world-countries"
import RecOptionalSessionsFields from "@/components/rec-registration/RecOptionalSessionsFields"
import RecRegistrationStepper, {
  REC_REGISTRATION_STEPS,
  RecRegistrationReviewList,
} from "@/components/rec-registration/RecRegistrationStepper"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import { formatRecParticipantCategory, normalizeRecOptionalSessions } from "@/lib/rec-conference/registration-tracks.mjs"
import { validateEmail } from "@/lib/utils/validation"

const titleOptions = ["Dr.", "Mr.", "Ms.", "Mrs.", "Rev.", "Prof.", "Eng.", "Prof.Eng."]
const sectorOptions = ["Public", "Private", "Civil Society Organization", "Academia", "Other"]
const registrationTypes = ["Attendee", "Exhibitor", "Sponsor"]
const lastStep = REC_REGISTRATION_STEPS.length - 1

const countryOptions = countries
  .map((country) => country.name.common)
  .sort((a, b) => a.localeCompare(b))

const emptyFormData = {
  email: "",
  title: "",
  firstName: "",
  lastName: "",
  otherName: "",
  phone: "",
  otherPhone: "",
  otherEmail: "",
  organization: "",
  sector: [],
  city: "",
  stateRegion: "",
  country: "",
  registrationType: "Attendee",
  daysAttending: [],
  visaLetterRequired: false,
  passportNumber: "",
  additionalComments: "",
  exhibitionDetails: "",
  additionalSessions: [],
  coupon: "",
}

export default function RecRegistrationForm() {
  const [step, setStep] = useState(0)
  const [conference, setConference] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [formData, setFormData] = useState(emptyFormData)

  const daysOptions = useMemo(() => {
    if (!conference?.days?.length) return []
    return conference.days.map((day) => ({
      label: day.label,
      date: day.date || null,
    }))
  }, [conference])

  useEffect(() => {
    const loadConference = async () => {
      try {
        const response = await fetch("/api/v1/rec/registrations/conference")
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || "Registration is not available right now.")
        }
        setConference(payload.conference)
      } catch (err) {
        setError(err.message || "Registration is not available right now.")
      } finally {
        setLoading(false)
      }
    }

    loadConference()
  }, [])

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleToggle = (field, value) => {
    setFormData((prev) => {
      const current = prev[field]
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      return { ...prev, [field]: next }
    })
  }

  const goToStep = (nextStep) => {
    setError(null)
    setStep(nextStep)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const validateStep = (currentStep) => {
    const errors = []

    if (currentStep === 0) {
      if (!formData.title?.trim()) errors.push("Please select your title.")
      if (!formData.firstName?.trim()) errors.push("Your first name is required.")
      if (!formData.lastName?.trim()) errors.push("Your last name is required.")
      if (!validateEmail(formData.email)) errors.push("A valid email address is required.")
      if (formData.otherEmail && !validateEmail(formData.otherEmail)) {
        errors.push("Other email must be a valid email address.")
      }
      if (!formData.phone?.trim()) errors.push("Your phone number is required.")
    }

    if (currentStep === 1) {
      if (!formData.organization?.trim()) errors.push("Your organization or institution is required.")
      if (!formData.sector?.length) errors.push("Please select your sector.")
      if (!formData.city?.trim()) errors.push("Your city is required.")
      if (!formData.stateRegion?.trim()) errors.push("Your state or region is required.")
      if (!formData.country?.trim()) errors.push("Your country is required.")
    }

    if (currentStep === 2) {
      if (!formData.registrationType?.trim()) errors.push("Please select a registration type.")
      if (!formData.daysAttending?.length) errors.push("Please select the conference days you will attend.")
      if (formData.registrationType === "Exhibitor" && !formData.exhibitionDetails?.trim()) {
        errors.push("Please tell us about your exhibition.")
      }
      if (formData.visaLetterRequired && !formData.passportNumber?.trim()) {
        errors.push("Passport number is required when you need a visa letter.")
      }
      if (conference?.couponRequired && !formData.coupon?.trim()) {
        errors.push("A coupon code is required to complete this registration.")
      }
    }

    return errors
  }

  const submitRegistration = async () => {
    setIsSaving(true)

    try {
      const response = await fetch("/api/v1/rec/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          additionalSessions: normalizeRecOptionalSessions(formData.additionalSessions),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const details = Array.isArray(payload?.details?.errors) ? payload.details.errors : []
        throw new Error(details.length ? details.join("\n") : (payload.error || "Registration could not be completed."))
      }
      setSuccess(payload)
    } catch (err) {
      setError(err.message || "Registration could not be completed.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)

    if (step < lastStep) {
      const validationErrors = validateStep(step)
      if (validationErrors.length > 0) {
        setError(`Please fix the following:\n- ${validationErrors.join("\n- ")}`)
        return
      }
      goToStep(step + 1)
      return
    }

    const validationErrors = [0, 1, 2].flatMap((index) => validateStep(index))
    if (validationErrors.length > 0) {
      setError(`Please fix the following:\n- ${validationErrors.join("\n- ")}`)
      return
    }

    await submitRegistration()
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner animation="border" style={{ color: "#2E9ECC" }} />
      </div>
    )
  }

  if (success) {
    return (
      <Card className="border-0 shadow-sm">
        <Card.Body className="p-4">
          <h2 className="h4 mb-2">You are registered</h2>
          <p className="text-muted mb-3">
            Thank you, {success.registration?.firstName}. Your registration for {formatRecEdition(success.conference?.year)} has been received.
            {success.emailSent
              ? " A confirmation email has been sent to you."
              : " We saved your registration. If you do not see a confirmation email, check your spam folder or contact the organizers."}
          </p>
          <Button
            type="button"
            style={{ backgroundColor: "#2E9ECC", borderColor: "#2E9ECC" }}
            onClick={() => {
              setSuccess(null)
              setFormData(emptyFormData)
              setStep(0)
            }}
          >
            Start a new registration
          </Button>
        </Card.Body>
      </Card>
    )
  }

  if (!conference || conference.closed) {
    return (
      <Alert variant="warning" className="mb-0">
        {error || conference?.closedMessage || "Registration for this conference is currently closed."}
      </Alert>
    )
  }

  const fullName = [formData.title, formData.firstName, formData.otherName, formData.lastName]
    .filter(Boolean)
    .join(" ")
  const location = [formData.city, formData.stateRegion, formData.country].filter(Boolean).join(", ")

  return (
    <Form onSubmit={handleSubmit}>
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body className="p-4">
          <h2 className="h4 mb-1">{conference.title || formatRecEdition(conference.year)}</h2>
          <p className="text-muted mb-0">
            Register yourself for the conference. Complete each step, then review before you submit.
          </p>
        </Card.Body>
      </Card>

      <RecRegistrationStepper current={step} onSelect={goToStep} />

      {step === 0 && (
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body className="p-4">
            <h5 className="mb-3">About you</h5>
            <Row>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Title *</Form.Label>
                  <Form.Select value={formData.title} onChange={(e) => handleInputChange("title", e.target.value)}>
                    <option value="">Select title</option>
                    {titleOptions.map((title) => <option key={title} value={title}>{title}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={5}>
                <Form.Group className="mb-3">
                  <Form.Label>First name *</Form.Label>
                  <Form.Control value={formData.firstName} onChange={(e) => handleInputChange("firstName", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Last name *</Form.Label>
                  <Form.Control value={formData.lastName} onChange={(e) => handleInputChange("lastName", e.target.value)} />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Other name</Form.Label>
                  <Form.Control value={formData.otherName} onChange={(e) => handleInputChange("otherName", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Email *</Form.Label>
                  <Form.Control type="email" value={formData.email} onChange={(e) => handleInputChange("email", e.target.value)} />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Other email</Form.Label>
                  <Form.Control type="email" value={formData.otherEmail} onChange={(e) => handleInputChange("otherEmail", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Phone *</Form.Label>
                  <PhoneInput country="ug" value={formData.phone} onChange={(value) => handleInputChange("phone", value)} inputStyle={{ width: "100%" }} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Other phone</Form.Label>
                  <PhoneInput country="ug" value={formData.otherPhone} onChange={(value) => handleInputChange("otherPhone", value)} inputStyle={{ width: "100%" }} />
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      {step === 1 && (
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body className="p-4">
            <h5 className="mb-3">Your organization</h5>
            <Form.Group className="mb-3">
              <Form.Label>Organization / Institution *</Form.Label>
              <Form.Control value={formData.organization} onChange={(e) => handleInputChange("organization", e.target.value)} />
              <Form.Text className="text-muted">The organization you represent.</Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Sector *</Form.Label>
              <div className="d-flex flex-wrap gap-3">
                {sectorOptions.map((sector) => (
                  <Form.Check
                    key={sector}
                    type="radio"
                    id={`public-sector-${sector}`}
                    name="sector"
                    label={sector}
                    checked={formData.sector.includes(sector)}
                    onChange={() => handleInputChange("sector", [sector])}
                  />
                ))}
              </div>
            </Form.Group>

            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>City *</Form.Label>
                  <Form.Control value={formData.city} onChange={(e) => handleInputChange("city", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>State / Region *</Form.Label>
                  <Form.Control value={formData.stateRegion} onChange={(e) => handleInputChange("stateRegion", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Country *</Form.Label>
                  <Form.Select value={formData.country} onChange={(e) => handleInputChange("country", e.target.value)}>
                    <option value="">Select country</option>
                    {countryOptions.map((country) => <option key={country} value={country}>{country}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body className="p-4">
            <h5 className="mb-3">Your attendance</h5>
            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>I am registering as *</Form.Label>
                  <Form.Select value={formData.registrationType} onChange={(e) => handleInputChange("registrationType", e.target.value)}>
                    {registrationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={8}>
                <Form.Group className="mb-3">
                  <Form.Label>{conference.couponRequired ? "Coupon code *" : "Coupon code"}</Form.Label>
                  <Form.Control
                    value={formData.coupon}
                    onChange={(e) => handleInputChange("coupon", e.target.value)}
                    placeholder={conference.couponRequired ? "Enter the coupon given to you" : "Optional, if you were given one"}
                  />
                </Form.Group>
              </Col>
            </Row>

            {formData.registrationType === "Exhibitor" && (
              <Form.Group className="mb-3">
                <Form.Label>Exhibition details *</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={formData.exhibitionDetails}
                  onChange={(e) => handleInputChange("exhibitionDetails", e.target.value)}
                />
              </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Which conference days will you attend? *</Form.Label>
              {daysOptions.length > 0 ? (
                <div className="d-flex flex-column gap-2">
                  {daysOptions.map((day) => (
                    <Form.Check
                      key={`${day.label}-${day.date}`}
                      type="checkbox"
                      id={`public-day-${day.label}`}
                      label={day.label}
                      checked={formData.daysAttending.includes(day.label)}
                      onChange={() => handleToggle("daysAttending", day.label)}
                    />
                  ))}
                </div>
              ) : (
                <Alert variant="warning" className="mb-0">
                  Conference days have not been published yet.
                </Alert>
              )}
            </Form.Group>

            <RecOptionalSessionsFields
              year={conference?.year}
              selected={formData.additionalSessions}
              onChange={(sessions) => handleInputChange("additionalSessions", sessions)}
              idPrefix="public-participant-category"
            />

            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Do you need a visa letter?</Form.Label>
                  <Form.Select
                    value={formData.visaLetterRequired ? "true" : "false"}
                    onChange={(e) => handleInputChange("visaLetterRequired", e.target.value === "true")}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              {formData.visaLetterRequired && (
                <Col md={8}>
                  <Form.Group className="mb-3">
                    <Form.Label>Passport number *</Form.Label>
                    <Form.Control value={formData.passportNumber} onChange={(e) => handleInputChange("passportNumber", e.target.value)} />
                  </Form.Group>
                </Col>
              )}
            </Row>

            <Form.Group className="mb-0">
              <Form.Label>Anything else we should know?</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={formData.additionalComments}
                onChange={(e) => handleInputChange("additionalComments", e.target.value)}
              />
            </Form.Group>
          </Card.Body>
        </Card>
      )}

      {step === 3 && (
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body className="p-4">
            <h5 className="mb-3">Review</h5>
            <RecRegistrationReviewList
              items={[
                { label: "Name", value: fullName },
                { label: "Email", value: formData.email },
                { label: "Phone", value: formData.phone },
                { label: "Organization", value: formData.organization },
                { label: "Sector", value: formData.sector.join(", ") },
                { label: "Location", value: location },
                { label: "Registering as", value: formData.registrationType },
                { label: "Days attending", value: formData.daysAttending.join(", ") },
                { label: "Participant category", value: formatRecParticipantCategory(formData.additionalSessions, conference?.year) },
                { label: "Coupon", value: formData.coupon },
                { label: "Visa letter", value: formData.visaLetterRequired ? `Yes${formData.passportNumber ? ` (${formData.passportNumber})` : ""}` : "No" },
                { label: "Comments", value: formData.additionalComments },
              ]}
            />
          </Card.Body>
        </Card>
      )}

      {error && <Alert variant="danger" style={{ whiteSpace: "pre-line" }}>{error}</Alert>}

      <div className="rec-reg-step-actions">
        {step > 0 ? (
          <Button type="button" variant="outline-secondary" onClick={() => goToStep(step - 1)} disabled={isSaving}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <div className="rec-reg-step-actions-end">
          <Button type="submit" style={{ backgroundColor: "#2E9ECC", borderColor: "#2E9ECC" }} disabled={isSaving}>
            {step < lastStep ? "Next" : isSaving ? "Submitting..." : "Submit my registration"}
          </Button>
        </div>
      </div>
    </Form>
  )
}
