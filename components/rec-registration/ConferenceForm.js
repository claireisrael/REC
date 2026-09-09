"use client"

import { useState, useEffect } from "react"
import { Form, Row, Col, Button } from "@/components/ui/portal-kit"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faCalendarDays,
  faCircleInfo,
  faClipboardCheck,
  faGlobe,
  faHandshake,
  faPalette,
  faPlus,
  faSave,
  faTicket,
  faTrash
} from "@fortawesome/free-solid-svg-icons"
import SponsorSetupEditor from "./SponsorSetupEditor"

const EDITOR_SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    description: "Core identity, dates, and venue",
    icon: faCircleInfo
  },
  {
    id: "days",
    label: "Conference Days",
    description: "Public schedule day labels",
    icon: faCalendarDays
  },
  {
    id: "registration",
    label: "Registration",
    description: "Fees, limits, coupons, and package",
    icon: faTicket
  },
  {
    id: "branding",
    label: "Branding",
    description: "Organization identity and colors",
    icon: faPalette
  },
  {
    id: "sponsors",
    label: "Sponsors",
    description: "Sponsor tiers, partners, and logos",
    icon: faHandshake
  },
  {
    id: "publicSite",
    label: "Public Site",
    description: "Hero, contact, copy, and website JSON",
    icon: faGlobe
  },
  {
    id: "review",
    label: "Review",
    description: "Check the configuration before saving",
    icon: faClipboardCheck
  }
]

const DEFAULT_REPORTS_SITE_CONFIG = {
  programCtaEnabled: true,
  pageTitle: "Previous conference reports",
  pageDescription: "Read official reports, proceedings, and outcomes from earlier REC editions.",
  ctaEyebrow: "From the previous edition",
  ctaTitle: "Continue with the conference report",
  ctaDescription: "Review the outcomes, recommendations, and highlights from the previous REC edition.",
  ctaButtonLabel: "View conference report"
}

const parseWebsiteConfig = (value) => {
  if (value && typeof value === "object") return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === "object") return parsed
    } catch {
      return { socials: {}, features: [], googleMapsUrl: "" }
    }
  }
  return { socials: {}, features: [], googleMapsUrl: "" }
}

const getDefaultFormData = () => ({
  year: new Date().getFullYear() + 1,
  title: "",
  theme: "",
  description: "",
  startDate: "",
  endDate: "",
  location: "Kampala, Uganda",
  venue: "",
  isActive: false,
  registrationOpen: true,
  couponRequired: false,
  maxAttendees: 1000,
  maxLimits: {
    attendee: 800,
    exhibitor: 150,
    sponsor: 50
  },
  currentCounts: {
    attendee: 0,
    exhibitor: 0,
    sponsor: 0
  },
  registrationFee: {
    attendee: 0,
    exhibitor: 500000,
    sponsor: 2000000
  },
  sponsorshipPackageUrl: null,
  days: [{ date: "", label: "", theme: "" }],
  shortName: "",
  fullName: "",
  logoUrl: "",
  mainWebsiteUrl: "",
  accentColor: "#2E9ECC",
  heroTagline: "",
  heroImageUrl: "",
  contactEmail: "",
  contactPhone: "",
  regClosedMessage: "",
  successMessage: "",
  socialsJson: {
    socials: { facebook: "", twitter: "", linkedin: "", instagram: "" },
    features: [],
    googleMapsUrl: "",
    reports: { ...DEFAULT_REPORTS_SITE_CONFIG }
  }
})

export default function ConferenceForm({
  initialData,
  initialSponsorCategories,
  initialSponsors,
  onSubmit,
  onCancel,
  isSaving
}) {
  const [formData, setFormData] = useState(getDefaultFormData)
  const [activeSection, setActiveSection] = useState("overview")
  const [formError, setFormError] = useState("")
  const [sponsorshipPackageFile, setSponsorshipPackageFile] = useState(null)
  const [sponsorCategories, setSponsorCategories] = useState(() => initialSponsorCategories || [])
  const [sponsors, setSponsors] = useState(() => initialSponsors || [])
  const [sponsorLogoFiles, setSponsorLogoFiles] = useState({})

  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({
        ...prev,
        ...initialData,
        days: initialData.days && initialData.days.length > 0
          ? initialData.days
          : [{ date: "", label: "", theme: "" }]
      }))
    }
  }, [initialData])

  useEffect(() => {
    if (initialSponsorCategories) {
      setSponsorCategories(initialSponsorCategories)
    }
  }, [initialSponsorCategories])

  useEffect(() => {
    if (initialSponsors) {
      setSponsors(initialSponsors)
    }
  }, [initialSponsors])

  const handleInputChange = (field, value) => {
    if (formError) {
      setFormError("")
    }

    if (field.includes(".")) {
      const [parent, child] = field.split(".")
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...(prev[parent] || {}),
          [child]: value
        }
      }))
      return
    }

    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleDayChange = (index, field, value) => {
    if (formError) {
      setFormError("")
    }

    setFormData(prev => ({
      ...prev,
      days: prev.days.map((day, i) =>
        i === index ? { ...day, [field]: value } : day
      )
    }))
  }

  const handleReportsSiteConfigChange = (field, value) => {
    if (formError) setFormError("")
    setFormData(prev => {
      const websiteConfig = parseWebsiteConfig(prev.socialsJson)
      return {
        ...prev,
        socialsJson: {
          ...websiteConfig,
          reports: {
            ...DEFAULT_REPORTS_SITE_CONFIG,
            ...(websiteConfig.reports || {}),
            [field]: value
          }
        }
      }
    })
  }

  const handleAddDay = () => {
    setFormData(prev => ({
      ...prev,
      days: [...prev.days, { date: "", label: "", theme: "" }]
    }))
  }

  const handleRemoveDay = (index) => {
    setFormData(prev => ({
      ...prev,
      days: prev.days.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!formData.year || !formData.startDate || !formData.endDate) {
      setFormError("Year, start date, and end date are required before saving.")
      setActiveSection("overview")
      return
    }

    let websiteConfig = formData.socialsJson
    if (typeof websiteConfig === "string") {
      try {
        websiteConfig = JSON.parse(websiteConfig)
      } catch {
        setFormError("Website configuration must be valid JSON before saving.")
        setActiveSection("publicSite")
        return
      }
    }
    if (JSON.stringify(websiteConfig || {}).length > 2000) {
      setFormError("Website configuration is too large. Shorten the public-site copy or remove unused feature data.")
      setActiveSection("publicSite")
      return
    }

    const cleanDays = formData.days.filter(day => day.date || day.label || day.theme)

    onSubmit(
      { ...formData, socialsJson: websiteConfig, days: cleanDays },
      sponsorshipPackageFile,
      {
        categories: sponsorCategories,
        sponsors,
        logoFiles: sponsorLogoFiles
      }
    )
  }

  const activeIndex = EDITOR_SECTIONS.findIndex(section => section.id === activeSection)
  const activeSectionMeta = EDITOR_SECTIONS[activeIndex] || EDITOR_SECTIONS[0]
  const previousSection = EDITOR_SECTIONS[activeIndex - 1]
  const nextSection = EDITOR_SECTIONS[activeIndex + 1]
  const filledDays = formData.days.filter(day => day.date || day.label || day.theme).length
  const visibleSponsorCategories = sponsorCategories.filter(category =>
    !category._delete && category.isActive !== false && category.name
  ).length
  const visibleSponsors = sponsors.filter(sponsor =>
    !sponsor._delete && sponsor.isActive !== false && sponsor.name
  ).length
  const registrationMode = !formData.registrationOpen
    ? "Closed"
    : formData.couponRequired
      ? "Coupon holders only"
      : "Open to public"
  const reportsSiteConfig = {
    ...DEFAULT_REPORTS_SITE_CONFIG,
    ...(parseWebsiteConfig(formData.socialsJson).reports || {})
  }

  const renderSectionHeader = () => (
    <div className="rec-editor-section-header">
      <div>
        <div className="rec-editor-section-kicker">
          Step {activeIndex + 1} of {EDITOR_SECTIONS.length}
        </div>
        <h2>{activeSectionMeta.label}</h2>
        <p>{activeSectionMeta.description}</p>
      </div>
      <div className="rec-editor-section-icon">
        <FontAwesomeIcon icon={activeSectionMeta.icon} />
      </div>
    </div>
  )

  const renderOverviewSection = () => (
    <>
      <Row>
        <Col lg={4}>
          <Form.Group className="mb-3">
            <Form.Label>Year *</Form.Label>
            <Form.Control
              type="number"
              value={formData.year}
              onChange={(e) => handleInputChange("year", parseInt(e.target.value) || new Date().getFullYear())}
              required
            />
          </Form.Group>
        </Col>
        <Col lg={8}>
          <Form.Group className="mb-3">
            <Form.Label>Overall Conference Theme</Form.Label>
            <Form.Control
              type="text"
              value={formData.theme || ""}
              onChange={(e) => handleInputChange("theme", e.target.value)}
              placeholder="e.g. Advancing Renewable Energy in Africa"
            />
          </Form.Group>
        </Col>
      </Row>

      <Form.Group className="mb-3">
        <Form.Label>Title</Form.Label>
        <Form.Control
          type="text"
          value={formData.title}
          onChange={(e) => handleInputChange("title", e.target.value)}
          placeholder={`Renewable Energy Conference & Expo ${formData.year}`}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>Description</Form.Label>
        <Form.Control
          as="textarea"
          rows={4}
          value={formData.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          placeholder={`Uganda's premier renewable energy conference for ${formData.year}`}
        />
      </Form.Group>

      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Start Date *</Form.Label>
            <Form.Control
              type="date"
              value={formData.startDate}
              onChange={(e) => handleInputChange("startDate", e.target.value)}
              required
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>End Date *</Form.Label>
            <Form.Control
              type="date"
              value={formData.endDate}
              onChange={(e) => handleInputChange("endDate", e.target.value)}
              required
            />
          </Form.Group>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Location</Form.Label>
            <Form.Control
              type="text"
              value={formData.location}
              onChange={(e) => handleInputChange("location", e.target.value)}
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Venue</Form.Label>
            <Form.Control
              type="text"
              value={formData.venue}
              onChange={(e) => handleInputChange("venue", e.target.value)}
            />
          </Form.Group>
        </Col>
      </Row>
    </>
  )

  const renderDaysSection = () => (
    <>
      <div className="rec-editor-note">
        Add the specific days for the conference. These labels are used by the public schedule and program setup.
      </div>

      {formData.days.map((day, index) => (
        <div key={index} className="rec-editor-repeatable">
          <div className="rec-editor-repeatable-header">
            <strong>Day {index + 1}</strong>
            {formData.days.length > 1 && (
              <Button variant="outline-danger" size="sm" onClick={() => handleRemoveDay(index)}>
                <FontAwesomeIcon icon={faTrash} className="me-1" /> Remove
              </Button>
            )}
          </div>
          <Row>
            <Col md={3}>
              <Form.Group className="mb-3 mb-md-0">
                <Form.Label className="small text-muted">Date</Form.Label>
                <Form.Control
                  type="date"
                  value={day.date}
                  onChange={(e) => handleDayChange(index, "date", e.target.value)}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3 mb-md-0">
                <Form.Label className="small text-muted">Label</Form.Label>
                <Form.Control
                  type="text"
                  value={day.label}
                  onChange={(e) => handleDayChange(index, "label", e.target.value)}
                  placeholder="e.g. 20th October - Day 1"
                />
              </Form.Group>
            </Col>
            <Col md={5}>
              <Form.Group className="mb-0">
                <Form.Label className="small text-muted">Daily Theme</Form.Label>
                <Form.Control
                  type="text"
                  value={day.theme}
                  onChange={(e) => handleDayChange(index, "theme", e.target.value)}
                  placeholder="e.g. Technology & Innovation"
                />
              </Form.Group>
            </Col>
          </Row>
        </div>
      ))}

      <Button variant="outline-primary" size="sm" onClick={handleAddDay} className="mt-2">
        <FontAwesomeIcon icon={faPlus} className="me-2" />
        Add Another Day
      </Button>
    </>
  )

  const renderRegistrationSection = () => (
    <>
      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Attendee Fee (UGX)</Form.Label>
            <Form.Control
              type="number"
              value={formData.registrationFee.attendee}
              onChange={(e) => handleInputChange("registrationFee.attendee", parseInt(e.target.value) || 0)}
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Exhibitor Fee (UGX)</Form.Label>
            <Form.Control
              type="number"
              value={formData.registrationFee.exhibitor}
              onChange={(e) => handleInputChange("registrationFee.exhibitor", parseInt(e.target.value) || 0)}
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Sponsor Fee (UGX)</Form.Label>
            <Form.Control
              type="number"
              value={formData.registrationFee.sponsor}
              onChange={(e) => handleInputChange("registrationFee.sponsor", parseInt(e.target.value) || 0)}
            />
          </Form.Group>
        </Col>
      </Row>

      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Attendee Limit</Form.Label>
            <Form.Control
              type="number"
              value={formData.maxLimits?.attendee || 800}
              onChange={(e) => handleInputChange("maxLimits.attendee", parseInt(e.target.value) || 0)}
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Exhibitor Limit</Form.Label>
            <Form.Control
              type="number"
              value={formData.maxLimits?.exhibitor || 150}
              onChange={(e) => handleInputChange("maxLimits.exhibitor", parseInt(e.target.value) || 0)}
            />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Sponsor Limit</Form.Label>
            <Form.Control
              type="number"
              value={formData.maxLimits?.sponsor || 50}
              onChange={(e) => handleInputChange("maxLimits.sponsor", parseInt(e.target.value) || 0)}
            />
          </Form.Group>
        </Col>
      </Row>

      <Form.Group className="mb-3">
        <Form.Label>Sponsorship Package Document (Optional)</Form.Label>
        <Form.Control
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => setSponsorshipPackageFile(e.target.files[0])}
        />
        <Form.Text className="text-muted">
          Upload a PDF or Word document containing sponsorship details. This will be shared with potential sponsors.
        </Form.Text>
        {formData.sponsorshipPackageUrl && (
          <div className="mt-2 p-2 bg-light rounded border">
            <small className="text-success fw-bold me-2">Current package attached:</small>
            <a href={formData.sponsorshipPackageUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-decoration-none">
              View Document
            </a>
          </div>
        )}
      </Form.Group>

      <div className="rec-editor-switch-grid">
        <Form.Check
          type="switch"
          id="registration-open-switch"
          label="Registration Open"
          checked={formData.registrationOpen}
          onChange={(e) => handleInputChange("registrationOpen", e.target.checked)}
        />
        <Form.Check
          type="switch"
          id="coupon-required-switch"
          label="Coupon Required"
          checked={formData.couponRequired}
          onChange={(e) => handleInputChange("couponRequired", e.target.checked)}
        />
        <Form.Check
          type="switch"
          id="active-conference-switch"
          label="Set as Active Conference"
          checked={formData.isActive}
          onChange={(e) => handleInputChange("isActive", e.target.checked)}
        />
      </div>
    </>
  )

  const renderBrandingSection = () => (
    <>
      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Short Name</Form.Label>
            <Form.Control
              type="text"
              value={formData.shortName || ""}
              onChange={(e) => handleInputChange("shortName", e.target.value)}
              placeholder="e.g. NREP"
            />
          </Form.Group>
        </Col>
        <Col md={8}>
          <Form.Group className="mb-3">
            <Form.Label>Full Organization Name</Form.Label>
            <Form.Control
              type="text"
              value={formData.fullName || ""}
              onChange={(e) => handleInputChange("fullName", e.target.value)}
              placeholder="e.g. National Renewable Energy Platform"
            />
          </Form.Group>
        </Col>
      </Row>
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Logo URL</Form.Label>
            <Form.Control
              type="url"
              value={formData.logoUrl || ""}
              onChange={(e) => handleInputChange("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <Form.Label>Main Website URL</Form.Label>
            <Form.Control
              type="url"
              value={formData.mainWebsiteUrl || ""}
              onChange={(e) => handleInputChange("mainWebsiteUrl", e.target.value)}
              placeholder="https://nrep.org"
            />
          </Form.Group>
        </Col>
      </Row>
      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <Form.Label>Accent Color</Form.Label>
            <div className="d-flex align-items-center gap-2">
              <Form.Control
                type="color"
                value={formData.accentColor || "#2E9ECC"}
                onChange={(e) => handleInputChange("accentColor", e.target.value)}
                style={{ width: 50, height: 38, padding: 2 }}
              />
              <Form.Control
                type="text"
                value={formData.accentColor || "#2E9ECC"}
                onChange={(e) => handleInputChange("accentColor", e.target.value)}
                placeholder="#2E9ECC"
              />
            </div>
          </Form.Group>
        </Col>
      </Row>
    </>
  )

  const renderSponsorsSection = () => (
    <SponsorSetupEditor
      categories={sponsorCategories}
      sponsors={sponsors}
      logoFilesBySponsor={sponsorLogoFiles}
      onCategoriesChange={setSponsorCategories}
      onSponsorsChange={setSponsors}
      onLogoFileChange={(sponsorId, file) => {
        setSponsorLogoFiles(prev => {
          const next = { ...prev }
          if (file) next[sponsorId] = file
          else delete next[sponsorId]
          return next
        })
      }}
    />
  )

  const renderPublicSiteSection = () => (
    <>
      <div className="rec-editor-subsection">
        <h3>Hero Section</h3>
        <Form.Group className="mb-3">
          <Form.Label>Hero Tagline</Form.Label>
          <Form.Control
            type="text"
            value={formData.heroTagline || ""}
            onChange={(e) => handleInputChange("heroTagline", e.target.value)}
            placeholder="e.g. Powering Africa's Renewable Energy Future"
          />
        </Form.Group>
        <Form.Group className="mb-0">
          <Form.Label>Hero Background Image URL</Form.Label>
          <Form.Control
            type="url"
            value={formData.heroImageUrl || ""}
            onChange={(e) => handleInputChange("heroImageUrl", e.target.value)}
            placeholder="https://example.com/hero.jpg"
          />
        </Form.Group>
      </div>

      <div className="rec-editor-subsection">
        <h3>Contact Information</h3>
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Contact Email</Form.Label>
              <Form.Control
                type="email"
                value={formData.contactEmail || ""}
                onChange={(e) => handleInputChange("contactEmail", e.target.value)}
                placeholder="info@nrep.org"
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Contact Phone</Form.Label>
              <Form.Control
                type="text"
                value={formData.contactPhone || ""}
                onChange={(e) => handleInputChange("contactPhone", e.target.value)}
                placeholder="+256 700 000 000"
              />
            </Form.Group>
          </Col>
        </Row>
      </div>

      <div className="rec-editor-subsection">
        <h3>Registration Messages</h3>
        <Form.Group className="mb-3">
          <Form.Label>Registration Closed Message</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={formData.regClosedMessage || ""}
            onChange={(e) => handleInputChange("regClosedMessage", e.target.value)}
            placeholder="Custom message shown when registration is disabled"
          />
        </Form.Group>
        <Form.Group className="mb-0">
          <Form.Label>Registration Success Message</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={formData.successMessage || ""}
            onChange={(e) => handleInputChange("successMessage", e.target.value)}
            placeholder="Custom message after successful registration"
          />
        </Form.Group>
      </div>

      <div className="rec-editor-subsection">
        <h3>Reports Page & Program Call to Action</h3>
        <p className="text-muted small mb-3">
          Configure how previous conference reports are introduced on the public website. Report links themselves are managed in the Conference Reports workspace.
        </p>
        <Form.Check
          type="switch"
          id="reports-program-cta-enabled"
          className="mb-3"
          label="Show the previous conference report on the program page"
          checked={reportsSiteConfig.programCtaEnabled !== false}
          onChange={(e) => handleReportsSiteConfigChange("programCtaEnabled", e.target.checked)}
        />
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Reports Page Title</Form.Label>
              <Form.Control
                type="text"
                value={reportsSiteConfig.pageTitle}
                onChange={(e) => handleReportsSiteConfigChange("pageTitle", e.target.value)}
                maxLength={120}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label>Program CTA Eyebrow</Form.Label>
              <Form.Control
                type="text"
                value={reportsSiteConfig.ctaEyebrow}
                onChange={(e) => handleReportsSiteConfigChange("ctaEyebrow", e.target.value)}
                maxLength={80}
              />
            </Form.Group>
          </Col>
        </Row>
        <Form.Group className="mb-3">
          <Form.Label>Reports Page Description</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={reportsSiteConfig.pageDescription}
            onChange={(e) => handleReportsSiteConfigChange("pageDescription", e.target.value)}
            maxLength={300}
          />
        </Form.Group>
        <Row>
          <Col md={8}>
            <Form.Group className="mb-3">
              <Form.Label>Program CTA Heading</Form.Label>
              <Form.Control
                type="text"
                value={reportsSiteConfig.ctaTitle}
                onChange={(e) => handleReportsSiteConfigChange("ctaTitle", e.target.value)}
                maxLength={120}
              />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group className="mb-3">
              <Form.Label>CTA Button Label</Form.Label>
              <Form.Control
                type="text"
                value={reportsSiteConfig.ctaButtonLabel}
                onChange={(e) => handleReportsSiteConfigChange("ctaButtonLabel", e.target.value)}
                maxLength={60}
              />
            </Form.Group>
          </Col>
        </Row>
        <Form.Group className="mb-0">
          <Form.Label>Program CTA Description</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={reportsSiteConfig.ctaDescription}
            onChange={(e) => handleReportsSiteConfigChange("ctaDescription", e.target.value)}
            maxLength={300}
          />
        </Form.Group>
      </div>

      <div className="rec-editor-subsection">
        <h3>Website Config JSON</h3>
        <p className="text-muted small mb-3">
          Advanced configuration for social links, why-attend features, Google Maps, and reports presentation.
        </p>
        <Form.Group className="mb-0">
          <Form.Control
            as="textarea"
            rows={9}
            value={typeof formData.socialsJson === "string" ? formData.socialsJson : JSON.stringify(formData.socialsJson, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value)
                handleInputChange("socialsJson", parsed)
              } catch {
                handleInputChange("socialsJson", e.target.value)
              }
            }}
            style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
          />
          <Form.Text className="text-muted">
            Changes made above are reflected here. Keep valid JSON so all public-site settings can be saved.
          </Form.Text>
        </Form.Group>
      </div>
    </>
  )

  const renderReviewSection = () => (
    <>
      <div className="rec-review-grid">
        <div className="rec-review-card">
          <span>Conference</span>
          <strong>{formData.title || `Renewable Energy Conference & Expo ${formData.year}`}</strong>
          <small>{formData.theme || "No theme added yet"}</small>
        </div>
        <div className="rec-review-card">
          <span>Dates</span>
          <strong>{formData.startDate || "Start date"} - {formData.endDate || "End date"}</strong>
          <small>{formData.venue || formData.location || "Venue not set"}</small>
        </div>
        <div className="rec-review-card">
          <span>Registration</span>
          <strong>{registrationMode}</strong>
          <small>{formData.isActive ? "Active conference" : "Not marked active"}</small>
        </div>
        <div className="rec-review-card">
          <span>Public Schedule</span>
          <strong>{filledDays} day{filledDays === 1 ? "" : "s"} configured</strong>
          <small>{formData.days.length} day row{formData.days.length === 1 ? "" : "s"} in editor</small>
        </div>
        <div className="rec-review-card">
          <span>Sponsors</span>
          <strong>{visibleSponsors} visible sponsor{visibleSponsors === 1 ? "" : "s"}</strong>
          <small>{visibleSponsorCategories} active tier{visibleSponsorCategories === 1 ? "" : "s"}</small>
        </div>
        <div className="rec-review-card">
          <span>Public Site</span>
          <strong>{formData.heroImageUrl ? "Hero image set" : "Hero image not set"}</strong>
          <small>{formData.contactEmail || "No contact email"}</small>
        </div>
      </div>

      <div className="rec-editor-review-actions">
        {!formData.startDate || !formData.endDate ? (
          <div className="rec-alert rec-alert-warning mb-0">
            Start and end date are required before this conference can be saved.
          </div>
        ) : (
          <div className="rec-alert mb-0">
            Review complete. You can save now or jump back to any section from the left navigation.
          </div>
        )}
      </div>
    </>
  )

  const renderActiveSection = () => {
    switch (activeSection) {
      case "days":
        return renderDaysSection()
      case "registration":
        return renderRegistrationSection()
      case "branding":
        return renderBrandingSection()
      case "sponsors":
        return renderSponsorsSection()
      case "publicSite":
        return renderPublicSiteSection()
      case "review":
        return renderReviewSection()
      case "overview":
      default:
        return renderOverviewSection()
    }
  }

  return (
    <Form onSubmit={handleSubmit} className="rec-conference-editor">
      {formError && (
        <div className="rec-alert rec-alert-warning mb-3">
          {formError}
        </div>
      )}

      <div className="rec-editor-shell">
        <aside className="rec-editor-nav" aria-label="Conference editor sections">
          <div className="rec-editor-nav-title">
            <strong>{formData.title || `REC ${formData.year}`}</strong>
            <span>{registrationMode}</span>
          </div>
          <div className="rec-editor-nav-list">
            {EDITOR_SECTIONS.map((section, index) => (
              <button
                key={section.id}
                type="button"
                className={`rec-editor-nav-button ${activeSection === section.id ? "active" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="rec-editor-nav-icon">
                  <FontAwesomeIcon icon={section.icon} />
                </span>
                <span className="rec-editor-nav-copy">
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
                <span className="rec-editor-nav-step">{index + 1}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="rec-editor-main">
          <section className="rec-editor-card">
            {renderSectionHeader()}
            <div className="rec-editor-section-body">
              {renderActiveSection()}
            </div>
            <div className="rec-editor-section-footer">
              <Button
                type="button"
                variant="outline-secondary"
                disabled={!previousSection}
                onClick={() => previousSection && setActiveSection(previousSection.id)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline-primary"
                disabled={!nextSection}
                onClick={() => nextSection && setActiveSection(nextSection.id)}
              >
                Next
              </Button>
            </div>
          </section>
        </main>
      </div>

      <div className="rec-editor-savebar">
        <div className="rec-editor-savebar-copy">
          <strong>{formData.title || `REC ${formData.year}`}</strong>
          <span>{activeSectionMeta.label} - {filledDays} day{filledDays === 1 ? "" : "s"}, {visibleSponsors} sponsor{visibleSponsors === 1 ? "" : "s"}</span>
        </div>
        <div className="rec-editor-savebar-actions">
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            <FontAwesomeIcon icon={faArrowLeft} className="me-2" /> Cancel
          </Button>
          <Button type="submit" style={{ backgroundColor: "#2E9ECC", borderColor: "#2E9ECC" }} disabled={isSaving}>
            <FontAwesomeIcon icon={faSave} className="me-2" />
            {isSaving ? "Saving..." : "Save Conference"}
          </Button>
        </div>
      </div>
    </Form>
  )
}
