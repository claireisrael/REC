"use client"

import { useEffect, useMemo, useState } from "react"
import { Alert, Button, Card, Col, Form, Row } from "@/components/ui/portal-kit"
import PhoneInput from "react-phone-input-2"
import "react-phone-input-2/lib/style.css"
import countries from "world-countries"
import { validateEmail } from "@/lib/utils/validation"
import { formatAppwriteDate } from "@/lib/utils"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import { formatRecParticipantCategory, normalizeRecOptionalSessions } from "@/lib/rec-conference/registration-tracks.mjs"
import RecOptionalSessionsFields from "@/components/rec-registration/RecOptionalSessionsFields"
import RecRegistrationStepper, {
  REC_REGISTRATION_STEPS,
  RecRegistrationReviewList,
} from "@/components/rec-registration/RecRegistrationStepper"

const titleOptions = ["Dr.", "Mr.", "Ms.", "Mrs.", "Rev.", "Prof.", "Eng.", "Prof.Eng."]
const sectorOptions = ["Public", "Private", "Civil Society Organization", "Academia", "Other"]
const registrationTypes = ["Attendee", "Exhibitor", "Sponsor"]
const lastStep = REC_REGISTRATION_STEPS.length - 1

const countryOptions = countries
  .map(country => country.name.common)
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
  sponsorOrganization: "",
  sponsorSector: "",
  sponsorCouponId: "",
  usedCoupon: null
}

const buildFormData = (source = {}, { includeSponsorship = true } = {}) => ({
  email: source.email || "",
  title: source.title || "",
  firstName: source.firstName || "",
  lastName: source.lastName || "",
  otherName: source.otherName || "",
  phone: source.phone || "",
  otherPhone: source.otherPhone || "",
  otherEmail: source.otherEmail || "",
  organization: source.organization || "",
  sector: Array.isArray(source.sector) ? source.sector : [],
  city: source.city || "",
  stateRegion: source.stateRegion || "",
  country: source.country || "",
  registrationType: source.registrationType || "Attendee",
  daysAttending: Array.isArray(source.daysAttending) ? source.daysAttending : [],
  visaLetterRequired: source.visaLetterRequired === true,
  passportNumber: source.passportNumber || "",
  additionalComments: source.additionalComments || "",
  exhibitionDetails: source.exhibitionDetails || "",
  additionalSessions: normalizeRecOptionalSessions(source.additionalSessions),
  coupon: includeSponsorship ? source.coupon || "" : "",
  sponsorOrganization: includeSponsorship ? source.sponsorOrganization || "" : "",
  sponsorSector: includeSponsorship ? source.sponsorSector || "" : "",
  sponsorCouponId: includeSponsorship ? source.sponsorCouponId || "" : "",
  usedCoupon: source.usedCoupon || null
})

export default function AdminRegistrationForm({
  mode = "create",
  conference,
  initialData = null,
  isSaving = false,
  onEmailLookup = null,
  onSubmit,
  onCancel
}) {
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState(emptyFormData)
  const [sendConfirmation, setSendConfirmation] = useState(mode === "create")
  const [error, setError] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  const daysOptions = useMemo(() => {
    if (conference?.days?.length) {
      return conference.days.map(day => ({
        label: day.label,
        date: day.date || null
      }))
    }

    return []
  }, [conference])

  useEffect(() => {
    if (!initialData) {
      setFormData(emptyFormData)
      setSendConfirmation(mode === "create")
      setStep(0)
      return
    }

    setFormData(buildFormData(initialData))
    setSendConfirmation(false)
    setStep(0)
  }, [initialData, mode])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSectorChange = (sector) => {
    setFormData(prev => ({ ...prev, sector: [sector] }))
  }

  const goToStep = (nextStep) => {
    setError(null)
    setStep(nextStep)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleLookupExisting = async () => {
    setError(null)

    if (!validateEmail(formData.email)) {
      setError("Enter a valid email address before loading existing registration details.")
      return
    }

    if (!onEmailLookup) return

    setLookupLoading(true)
    try {
      const existing = await onEmailLookup(formData.email)
      if (!existing) {
        setError("No existing registration was found for that email.")
        return
      }

      const alreadyRegisteredForConference = Array.isArray(existing.conferenceYears)
        && existing.conferenceYears.includes(Number(conference?.year))
      setFormData(buildFormData(existing, {
        includeSponsorship: alreadyRegisteredForConference
      }))
    } catch (err) {
      console.error("Registration lookup error:", err)
      setError("Could not load existing registration details.")
    } finally {
      setLookupLoading(false)
    }
  }

  const handleDaysChange = (label) => {
    setFormData(prev => {
      const daysAttending = prev.daysAttending.includes(label)
        ? prev.daysAttending.filter(day => day !== label)
        : [...prev.daysAttending, label]

      return { ...prev, daysAttending }
    })
  }

  const buildEventDates = () => {
    const selectedDates = formData.daysAttending
      .map(label => daysOptions.find(day => day.label === label)?.date)
      .filter(Boolean)
      .sort()

    if (!selectedDates.length) {
      return { eventStart: null, eventEnd: null }
    }

    const makeLocalDate = (dateStr, hour) => {
      const [year, month, day] = dateStr.split("-").map(Number)
      return new Date(year, month - 1, day, hour, 0, 0)
    }

    return {
      eventStart: makeLocalDate(selectedDates[0], 8),
      eventEnd: makeLocalDate(selectedDates[selectedDates.length - 1], 18)
    }
  }

  const validateStep = (currentStep) => {
    const errors = []

    if (currentStep === 0) {
      if (!validateEmail(formData.email)) errors.push("A valid email address is required")
      if (!formData.firstName?.trim()) errors.push("First name is required")
      if (!formData.lastName?.trim()) errors.push("Last name is required")
      if (!formData.phone?.trim()) errors.push("Phone number is required")
    }

    if (currentStep === 1) {
      if (!formData.organization?.trim()) errors.push("Organization / Institution is required")
      if (!formData.sector?.length) errors.push("Sector is required")
      if (!formData.city?.trim()) errors.push("City is required")
      if (!formData.stateRegion?.trim()) errors.push("State / Region is required")
      if (!formData.country?.trim()) errors.push("Country is required")
    }

    if (currentStep === 2) {
      if (!formData.registrationType?.trim()) errors.push("Registration type is required")
      if (!formData.daysAttending?.length) errors.push("At least one conference day is required")
      if (formData.registrationType === "Exhibitor" && !formData.exhibitionDetails?.trim()) {
        errors.push("Exhibition details are required for exhibitor registrations")
      }
      if (formData.visaLetterRequired && !formData.passportNumber?.trim()) {
        errors.push("Passport number is required when a visa letter is needed")
      }
    }

    return errors
  }

  const submitRegistration = () => {
    const validationErrors = [0, 1, 2].flatMap((index) => validateStep(index))
    if (validationErrors.length > 0) {
      setError(`Please fix the following:\n- ${validationErrors.join("\n- ")}`)
      return
    }

    const { eventStart, eventEnd } = buildEventDates()
    if (!eventStart || !eventEnd) {
      setError("Selected conference days must have configured dates.")
      return
    }

    onSubmit({
      ...formData,
      eventStart,
      eventEnd
    }, {
      sendConfirmation
    })
  }

  const handleSubmit = (event) => {
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

    submitRegistration()
  }

  const fullName = [formData.title, formData.firstName, formData.otherName, formData.lastName]
    .filter(Boolean)
    .join(" ")
  const location = [formData.city, formData.stateRegion, formData.country].filter(Boolean).join(", ")

  return (
    <Form onSubmit={handleSubmit}>
      <Card className="border-0 shadow-sm mb-4">
        <Card.Body className="p-4">
          <div className="d-flex justify-content-between align-items-start gap-3">
            <div>
              <h5 className="mb-1">Conference</h5>
              {conference ? (
                <p className="text-muted mb-0">
                  {formatRecEdition(conference.year)} - {conference.title}
                </p>
              ) : (
                <p className="text-muted mb-0">No conference selected.</p>
              )}
            </div>
            {conference && (
              <div className="text-end small text-muted">
                {formatAppwriteDate(conference.startDate)} to {formatAppwriteDate(conference.endDate)}
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      <RecRegistrationStepper current={step} onSelect={goToStep} />

      {step === 0 && (
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body className="p-4">
            <h5 className="mb-3">Personal Information</h5>
            <Row>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Title</Form.Label>
                  <Form.Select value={formData.title || ""} onChange={(e) => handleInputChange("title", e.target.value)}>
                    <option value="">Select title</option>
                    {titleOptions.map(title => <option key={title} value={title}>{title}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={5}>
                <Form.Group className="mb-3">
                  <Form.Label>First Name *</Form.Label>
                  <Form.Control value={formData.firstName || ""} onChange={(e) => handleInputChange("firstName", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Last Name *</Form.Label>
                  <Form.Control value={formData.lastName || ""} onChange={(e) => handleInputChange("lastName", e.target.value)} />
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Other Name</Form.Label>
                  <Form.Control value={formData.otherName || ""} onChange={(e) => handleInputChange("otherName", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Email *</Form.Label>
                  <div className="d-flex gap-2">
                    <Form.Control
                      type="email"
                      value={formData.email || ""}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      disabled={mode === "edit"}
                    />
                    {mode === "create" && onEmailLookup && (
                      <Button
                        type="button"
                        variant="outline-secondary"
                        onClick={handleLookupExisting}
                        disabled={lookupLoading}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {lookupLoading ? "Loading..." : "Load Existing"}
                      </Button>
                    )}
                  </div>
                  {mode === "edit" && (
                    <Form.Text className="text-muted">Email identifies the existing registration row.</Form.Text>
                  )}
                </Form.Group>
              </Col>
            </Row>

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Other Email</Form.Label>
                  <Form.Control type="email" value={formData.otherEmail || ""} onChange={(e) => handleInputChange("otherEmail", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Phone *</Form.Label>
                  <PhoneInput country="ug" value={formData.phone || ""} onChange={(value) => handleInputChange("phone", value)} inputStyle={{ width: "100%" }} />
                </Form.Group>
              </Col>
              <Col md={3}>
                <Form.Group className="mb-3">
                  <Form.Label>Other Phone</Form.Label>
                  <PhoneInput country="ug" value={formData.otherPhone || ""} onChange={(value) => handleInputChange("otherPhone", value)} inputStyle={{ width: "100%" }} />
                </Form.Group>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      {step === 1 && (
        <Card className="border-0 shadow-sm mb-4">
          <Card.Body className="p-4">
            <h5 className="mb-3">Organization & Location</h5>
            {formData.sponsorOrganization && (
              <Alert variant="info">
                <div className="fw-semibold">Coupon sponsorship</div>
                <div>
                  Sponsored by {formData.sponsorOrganization}
                  {formData.sponsorSector ? ` (${formData.sponsorSector})` : ""}
                </div>
                {formData.coupon && (
                  <div className="small mt-1">Coupon: {formData.coupon}</div>
                )}
                <div className="small mt-1">
                  Sponsorship is derived from the validated coupon and cannot be edited here.
                </div>
              </Alert>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Registrant Organization / Institution *</Form.Label>
              <Form.Control value={formData.organization || ""} onChange={(e) => handleInputChange("organization", e.target.value)} />
              <Form.Text className="text-muted">
                The organization represented by the registrant, which may differ from the coupon sponsor.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Registrant Organization Sector *</Form.Label>
              <div className="d-flex flex-wrap gap-3">
                {sectorOptions.map(sector => (
                  <Form.Check
                    key={sector}
                    type="radio"
                    id={`admin-sector-${sector}`}
                    name="sector"
                    label={sector}
                    checked={formData.sector.includes(sector)}
                    onChange={() => handleSectorChange(sector)}
                  />
                ))}
              </div>
            </Form.Group>

            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>City *</Form.Label>
                  <Form.Control value={formData.city || ""} onChange={(e) => handleInputChange("city", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>State / Region *</Form.Label>
                  <Form.Control value={formData.stateRegion || ""} onChange={(e) => handleInputChange("stateRegion", e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Country *</Form.Label>
                  <Form.Select value={formData.country || ""} onChange={(e) => handleInputChange("country", e.target.value)}>
                    <option value="">Select country</option>
                    {countryOptions.map(country => <option key={country} value={country}>{country}</option>)}
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
            <h5 className="mb-3">Registration Details</h5>
            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Registration Type *</Form.Label>
                  <Form.Select value={formData.registrationType || ""} onChange={(e) => handleInputChange("registrationType", e.target.value)}>
                    {registrationTypes.map(type => <option key={type} value={type}>{type}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {formData.registrationType === "Exhibitor" && (
              <Form.Group className="mb-3">
                <Form.Label>Exhibition Details *</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={formData.exhibitionDetails || ""}
                  onChange={(e) => handleInputChange("exhibitionDetails", e.target.value)}
                />
              </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Day(s) to Attend *</Form.Label>
              {daysOptions.length > 0 ? (
                <div className="d-flex flex-column gap-2">
                  {daysOptions.map(day => (
                    <Form.Check
                      key={`${day.label}-${day.date}`}
                      type="checkbox"
                      id={`admin-day-${day.label}`}
                      label={day.label}
                      checked={formData.daysAttending.includes(day.label)}
                      onChange={() => handleDaysChange(day.label)}
                    />
                  ))}
                </div>
              ) : (
                <Alert variant="warning" className="mb-0">
                  This conference does not have days configured yet.
                </Alert>
              )}
            </Form.Group>

            <RecOptionalSessionsFields
              year={conference?.year}
              selected={formData.additionalSessions}
              onChange={(sessions) => handleInputChange("additionalSessions", sessions)}
              idPrefix="admin-participant-category"
            />

            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <Form.Label>Visa Letter Required</Form.Label>
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
                    <Form.Label>Passport Number *</Form.Label>
                    <Form.Control value={formData.passportNumber || ""} onChange={(e) => handleInputChange("passportNumber", e.target.value)} />
                  </Form.Group>
                </Col>
              )}
            </Row>

            <Form.Group className="mb-0">
              <Form.Label>Additional Comments / Requirements</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={formData.additionalComments || ""}
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
                { label: "Registration type", value: formData.registrationType },
                { label: "Days attending", value: formData.daysAttending.join(", ") },
                { label: "Participant category", value: formatRecParticipantCategory(formData.additionalSessions, conference?.year) },
                { label: "Visa letter", value: formData.visaLetterRequired ? `Yes${formData.passportNumber ? ` (${formData.passportNumber})` : ""}` : "No" },
                { label: "Comments", value: formData.additionalComments },
              ]}
            />
            <Form.Check
              className="mt-4"
              type="checkbox"
              id="send-confirmation-email"
              label="Send confirmation email"
              checked={sendConfirmation}
              onChange={(e) => setSendConfirmation(e.target.checked)}
            />
          </Card.Body>
        </Card>
      )}

      {error && <Alert variant="danger" style={{ whiteSpace: "pre-line" }}>{error}</Alert>}

      <div className="rec-reg-step-actions">
        <Button type="button" variant="outline-secondary" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <div className="rec-reg-step-actions-end">
          {step > 0 && (
            <Button type="button" variant="outline-secondary" onClick={() => goToStep(step - 1)} disabled={isSaving}>
              Back
            </Button>
          )}
          <Button type="submit" style={{ backgroundColor: "#2E9ECC", borderColor: "#2E9ECC" }} disabled={isSaving || !conference}>
            {step < lastStep
              ? "Next"
              : isSaving
                ? "Saving..."
                : mode === "edit"
                  ? "Update Registration"
                  : "Create Registration"}
          </Button>
        </div>
      </div>
    </Form>
  )
}
