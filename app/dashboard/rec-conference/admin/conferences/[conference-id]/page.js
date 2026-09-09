"use client"

import { useState, useEffect } from "react"
import { Container, Alert, Breadcrumb, Spinner, Row, Col, Card, Badge, Button } from "@/components/ui/portal-kit"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getRecConferenceById, setActiveConference } from "@/lib/appwrite/rec-conferences"
import { getConferenceSponsorsSetup, groupSponsorsByCategory } from "@/lib/appwrite/rec-sponsors"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faEdit, faInfoCircle, faCalendarAlt, faMapMarkerAlt, faUsers, faCheck, faMoneyBillWave, faFileDownload, faGlobe, faImage, faEnvelope, faPhone, faCommentDots, faPalette, faShareAlt, faHandshake, faStar } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import React from "react"
import { formatAppwriteDate } from "@/lib/utils"
import "../../../rec-dashboard.css"

export default function ConferenceDetailsPage({ params }) {
  const router = useRouter()
  const unwrappedParams = React.use(params)
  const conferenceId = unwrappedParams["conference-id"]

  const { isSeniorManager, canPerformModuleAction, MODULES } = useAuth()
  const appwriteServices = useAppwrite()
  
  const [conference, setConference] = useState(null)
  const [sponsorSetup, setSponsorSetup] = useState({ categories: [], sponsors: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Security Check
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'manage')
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'edit')
  
  const hasAccess = canManageRec || canEditRec || isSeniorManager()
  const canEdit = canManageRec || canEditRec || isSeniorManager()

  const getRegistrationMode = (conference) => {
    if (!conference.registrationOpen) {
      return { label: "CLOSED", className: "text-danger fw-bold" }
    }

    if (conference.couponRequired) {
      return { label: "OPEN - COUPON REQUIRED", className: "text-warning fw-bold" }
    }

    return { label: "OPEN", className: "text-success fw-bold" }
  }

  const fetchConference = async () => {
    if (!appwriteServices || !hasAccess) return
    setLoading(true)
    try {
      const [data, sponsorsData] = await Promise.all([
        getRecConferenceById(conferenceId, appwriteServices),
        getConferenceSponsorsSetup(conferenceId, appwriteServices, { includeInactive: true })
      ])
      if (!data) throw new Error("Conference not found")
      setConference(data)
      setSponsorSetup(sponsorsData)
    } catch (err) {
      console.error(err)
      setError("Failed to load conference details.")
    } finally {
      setLoading(false)
    }
  }

  const sponsorGroups = groupSponsorsByCategory(
    sponsorSetup.categories.filter((category) => category.isActive !== false),
    sponsorSetup.sponsors.filter((sponsor) => sponsor.isActive !== false)
  )

  useEffect(() => {
    fetchConference()
  }, [conferenceId, appwriteServices, hasAccess])

  const handleSetActive = async () => {
    try {
      await setActiveConference(conference.year, appwriteServices)
      setSuccess(`REC ${conference.year} is now the active conference!`)
      fetchConference() // Refresh data to show active status
    } catch (err) {
      console.error(err)
      setError("Failed to set active conference.")
    }
  }

  if (!hasAccess) {
    return (
      <Container className="py-4 text-center">
        <Alert variant="danger">You do not have permission to view conferences.</Alert>
      </Container>
    )
  }

  if (loading) {
    return (
      <div className="rec-dashboard-container d-flex justify-content-center align-items-center" style={{ minHeight: "50vh" }}>
        <Spinner animation="border" style={{ color: "#2E9ECC" }} />
      </div>
    )
  }

  if (!conference) {
    return (
      <div className="rec-dashboard-container">
        <Alert variant="danger">Conference not found.</Alert>
        <Button variant="outline-primary" onClick={() => router.push('/dashboard/rec-conference')}>Return to Dashboard</Button>
      </div>
    )
  }

  return (
    <div className="rec-dashboard-container">
      <Breadcrumb className="mb-4">
        <Breadcrumb.Item linkAs={Link} href="/dashboard/rec-conference">REC Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item active>Conference Details</Breadcrumb.Item>
      </Breadcrumb>

      <div className="rec-dashboard-header d-flex justify-content-between align-items-start flex-wrap gap-3">
        <div>
          <h2 className="rec-header-gradient mb-1">
            {conference.title}
            {conference.isActive && <Badge bg="success" className="ms-3 align-middle fs-6">ACTIVE</Badge>}
          </h2>
          <p className="text-muted mb-0">{conference.theme || "No overall theme set"}</p>
        </div>
        
        <div className="d-flex gap-2">
          {!conference.isActive && canManageRec && (
            <Button variant="outline-success" onClick={handleSetActive}>
              <FontAwesomeIcon icon={faCheck} className="me-2" /> Set Active
            </Button>
          )}
          {canEdit && (
            <Button 
              style={{ backgroundColor: "#2E9ECC", borderColor: "#2E9ECC" }}
              onClick={() => router.push(`/dashboard/rec-conference/admin/conferences/edit/${conferenceId}`)}
            >
              <FontAwesomeIcon icon={faEdit} className="me-2" /> Edit Conference
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess(null)}>{success}</Alert>}

      <Row className="g-4 mb-4">
        <Col md={8}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Body className="p-4">
              <h5 className="mb-4 text-nrep-darker fw-bold">
                <FontAwesomeIcon icon={faInfoCircle} className="me-2 text-nrep-primary" /> 
                Overview
              </h5>
              <p className="mb-4 text-secondary lh-lg">{conference.description}</p>

              <div className="d-flex flex-column gap-3">
                <div className="d-flex align-items-center">
                  <div className="rec-icon-wrap rec-icon-primary mb-0 me-3" style={{ width: 40, height: 40, fontSize: "1.1rem" }}>
                    <FontAwesomeIcon icon={faCalendarAlt} />
                  </div>
                  <div>
                    <h6 className="mb-0 text-dark fw-bold">Dates</h6>
                    <small className="text-muted">{formatAppwriteDate(conference.startDate)} - {formatAppwriteDate(conference.endDate)}</small>
                  </div>
                </div>

                <div className="d-flex align-items-center">
                  <div className="rec-icon-wrap rec-icon-accent mb-0 me-3" style={{ width: 40, height: 40, fontSize: "1.1rem" }}>
                    <FontAwesomeIcon icon={faMapMarkerAlt} />
                  </div>
                  <div>
                    <h6 className="mb-0 text-dark fw-bold">Location & Venue</h6>
                    <small className="text-muted">{conference.location} {conference.venue && `• ${conference.venue}`}</small>
                  </div>
                </div>
                
                <div className="d-flex align-items-center">
                  <div className="rec-icon-wrap rec-icon-success mb-0 me-3" style={{ width: 40, height: 40, fontSize: "1.1rem" }}>
                    <FontAwesomeIcon icon={faCheck} />
                  </div>
                  <div>
                    <h6 className="mb-0 text-dark fw-bold">Registration Status</h6>
                    <small className={getRegistrationMode(conference).className}>
                      {getRegistrationMode(conference).label}
                    </small>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="border-0 shadow-sm h-100 bg-nrep-darker text-white">
            <Card.Body className="p-4">
              <h5 className="mb-4 text-white fw-bold">
                <FontAwesomeIcon icon={faUsers} className="me-2 text-nrep-orange" /> 
                Attendance Metrics
              </h5>
              
              <div className="mb-4">
                <div className="d-flex justify-content-between mb-1">
                  <span>Attendees</span>
                  <span className="fw-bold">{conference.currentCounts?.attendee || 0} / {conference.maxLimits?.attendee || 800}</span>
                </div>
                <div className="progress" style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.2)" }}>
                  <div className="progress-bar bg-nrep-orange" style={{ width: `${((conference.currentCounts?.attendee || 0) / (conference.maxLimits?.attendee || 800)) * 100}%` }}></div>
                </div>
              </div>

              <div className="mb-4">
                <div className="d-flex justify-content-between mb-1">
                  <span>Exhibitors</span>
                  <span className="fw-bold">{conference.currentCounts?.exhibitor || 0} / {conference.maxLimits?.exhibitor || 150}</span>
                </div>
                <div className="progress" style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.2)" }}>
                  <div className="progress-bar bg-info" style={{ width: `${((conference.currentCounts?.exhibitor || 0) / (conference.maxLimits?.exhibitor || 150)) * 100}%` }}></div>
                </div>
              </div>

              <div>
                <div className="d-flex justify-content-between mb-1">
                  <span>Sponsors</span>
                  <span className="fw-bold">{conference.currentCounts?.sponsor || 0} / {conference.maxLimits?.sponsor || 50}</span>
                </div>
                <div className="progress" style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.2)" }}>
                  <div className="progress-bar bg-success" style={{ width: `${((conference.currentCounts?.sponsor || 0) / (conference.maxLimits?.sponsor || 50)) * 100}%` }}></div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-4 mb-4">
        <Col md={12}>
          <Card className="border-0 shadow-sm">
            <Card.Body className="p-4">
              <h5 className="mb-4 text-nrep-darker fw-bold">
                <FontAwesomeIcon icon={faCalendarAlt} className="me-2 text-nrep-primary" /> 
                Conference Schedule
              </h5>
              
              {conference.days && conference.days.length > 0 ? (
                <div className="d-flex flex-column gap-3">
                  {conference.days.map((day, idx) => (
                    <div key={idx} className="p-3 bg-light rounded border-start border-4 border-nrep-primary">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <strong className="text-dark">{day.label || `Day ${idx + 1}`}</strong>
                        <Badge bg="secondary">{day.date ? formatAppwriteDate(day.date) : "TBD"}</Badge>
                      </div>
                      {day.theme && <p className="mb-0 text-muted small fst-italic">{day.theme}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <Alert variant="info" className="mb-0">No schedule configured for this conference.</Alert>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-4">
        <Col md={12}>
          <Card className="border-0 shadow-sm">
            <Card.Body className="p-4">
              <h5 className="mb-4 text-nrep-darker fw-bold">
                <FontAwesomeIcon icon={faMoneyBillWave} className="me-2 text-nrep-primary" /> 
                Pricing & Packages
              </h5>
              
              <div className="d-flex flex-wrap gap-4 mb-4">
                <div className="p-3 bg-light rounded border text-center flex-grow-1">
                  <h6 className="text-muted mb-2">Attendee</h6>
                  <h4 className="text-dark fw-bold mb-0">UGX {conference.registrationFee?.attendee?.toLocaleString() || 0}</h4>
                </div>
                <div className="p-3 bg-light rounded border text-center flex-grow-1">
                  <h6 className="text-muted mb-2">Exhibitor</h6>
                  <h4 className="text-dark fw-bold mb-0">UGX {conference.registrationFee?.exhibitor?.toLocaleString() || '500,000'}</h4>
                </div>
                <div className="p-3 bg-light rounded border text-center flex-grow-1">
                  <h6 className="text-muted mb-2">Sponsor</h6>
                  <h4 className="text-dark fw-bold mb-0">UGX {conference.registrationFee?.sponsor?.toLocaleString() || '2,000,000'}</h4>
                </div>
              </div>

              {conference.sponsorshipPackageUrl && (
                <div className="p-3 border rounded d-flex align-items-center justify-content-between bg-light">
                  <div className="d-flex align-items-center gap-3">
                    <FontAwesomeIcon icon={faFileDownload} className="text-nrep-primary fs-3" />
                    <div>
                      <h6 className="mb-0 fw-bold">Sponsorship Package Document</h6>
                      <small className="text-muted">Available for download to potential sponsors</small>
                    </div>
                  </div>
                  <Button variant="outline-primary" href={conference.sponsorshipPackageUrl} target="_blank">
                    Download PDF
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Branding & Identity */}
      {(conference.shortName || conference.fullName || conference.logoUrl || conference.mainWebsiteUrl || conference.accentColor) && (
        <Row className="g-4 mb-4 mt-1">
          <Col md={12}>
            <Card className="border-0 shadow-sm">
              <Card.Body className="p-4">
                <h5 className="mb-4 text-nrep-darker fw-bold">
                  <FontAwesomeIcon icon={faPalette} className="me-2 text-nrep-primary" /> 
                  Branding & Identity
                </h5>
                <Row className="g-3">
                  {conference.shortName && (
                    <Col md={3}>
                      <div className="p-3 bg-light rounded border">
                        <small className="text-muted d-block mb-1">Short Name</small>
                        <strong>{conference.shortName}</strong>
                      </div>
                    </Col>
                  )}
                  {conference.fullName && (
                    <Col md={5}>
                      <div className="p-3 bg-light rounded border">
                        <small className="text-muted d-block mb-1">Full Name</small>
                        <strong>{conference.fullName}</strong>
                      </div>
                    </Col>
                  )}
                  {conference.accentColor && (
                    <Col md={4}>
                      <div className="p-3 bg-light rounded border d-flex align-items-center gap-3">
                        <div style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: conference.accentColor, border: '1px solid rgba(0,0,0,0.1)' }}></div>
                        <div>
                          <small className="text-muted d-block mb-0">Accent Color</small>
                          <strong>{conference.accentColor}</strong>
                        </div>
                      </div>
                    </Col>
                  )}
                  {conference.logoUrl && (
                    <Col md={6}>
                      <div className="p-3 bg-light rounded border">
                        <small className="text-muted d-block mb-1">Logo URL</small>
                        <a href={conference.logoUrl} target="_blank" rel="noopener noreferrer" className="text-break small">{conference.logoUrl}</a>
                      </div>
                    </Col>
                  )}
                  {conference.mainWebsiteUrl && (
                    <Col md={6}>
                      <div className="p-3 bg-light rounded border">
                        <small className="text-muted d-block mb-1">Main Website</small>
                        <a href={conference.mainWebsiteUrl} target="_blank" rel="noopener noreferrer" className="text-break small">{conference.mainWebsiteUrl}</a>
                      </div>
                    </Col>
                  )}
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Sponsors & Partners */}
      <Row className="g-4 mb-4">
        <Col md={12}>
          <Card className="border-0 shadow-sm">
            <Card.Body className="p-4">
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-4">
                <div>
                  <h5 className="mb-1 text-nrep-darker fw-bold">
                    <FontAwesomeIcon icon={faHandshake} className="me-2 text-nrep-primary" />
                    Sponsors & Partners
                  </h5>
                  <p className="text-muted small mb-0">Public sponsor directory grouped by configured category.</p>
                </div>
                {canEdit && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => router.push(`/dashboard/rec-conference/admin/conferences/edit/${conferenceId}`)}
                  >
                    Manage Sponsors
                  </Button>
                )}
              </div>

              {sponsorGroups.length === 0 ? (
                <Alert variant="info" className="mb-0">No visible sponsors have been configured for this conference.</Alert>
              ) : (
                <div className="d-flex flex-column gap-4">
                  {sponsorGroups.map(({ category, sponsors: categorySponsors }) => (
                    <div key={category.$id || category.localId}>
                      <div className="d-flex align-items-center gap-2 mb-3">
                        <div style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: category.accentColor || "#2E9ECC" }} />
                        <h6 className="mb-0 fw-bold text-dark">{category.name}</h6>
                        <Badge bg="light" text="dark" className="border">{categorySponsors.length}</Badge>
                      </div>
                      {category.description && <p className="text-muted small mb-3">{category.description}</p>}
                      <Row className="g-3">
                        {categorySponsors.map((sponsor) => (
                          <Col key={sponsor.$id || sponsor.localId} md={6} xl={4}>
                            <div className="h-100 p-3 rounded border bg-light">
                              <div className="d-flex gap-3 align-items-start">
                                {sponsor.logoUrl ? (
                                  <img
                                    src={sponsor.logoUrl}
                                    alt={`${sponsor.name} logo`}
                                    style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0" }}
                                  />
                                ) : (
                                  <div className="d-flex align-items-center justify-content-center text-muted bg-white border rounded" style={{ width: 72, height: 72 }}>
                                    Logo
                                  </div>
                                )}
                                <div className="flex-grow-1 min-w-0">
                                  <div className="d-flex align-items-center gap-2 mb-1">
                                    <h6 className="mb-0 fw-bold text-dark">{sponsor.name}</h6>
                                    {sponsor.isFeatured && <FontAwesomeIcon icon={faStar} className="text-warning" title="Featured sponsor" />}
                                  </div>
                                  {sponsor.description && <p className="small text-muted mb-2">{sponsor.description}</p>}
                                  {sponsor.siteUrl && (
                                    <a href={sponsor.siteUrl} target="_blank" rel="noopener noreferrer" className="small text-decoration-none">
                                      <FontAwesomeIcon icon={faGlobe} className="me-1" />
                                      Visit website
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Hero & Contact */}
      {(conference.heroTagline || conference.heroImageUrl || conference.contactEmail || conference.contactPhone) && (
        <Row className="g-4 mb-4">
          <Col md={6}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Body className="p-4">
                <h5 className="mb-4 text-nrep-darker fw-bold">
                  <FontAwesomeIcon icon={faImage} className="me-2 text-nrep-primary" /> 
                  Hero Section
                </h5>
                {conference.heroTagline && (
                  <div className="p-3 bg-light rounded border mb-3">
                    <small className="text-muted d-block mb-1">Tagline</small>
                    <strong className="fst-italic">"{conference.heroTagline}"</strong>
                  </div>
                )}
                {conference.heroImageUrl && (
                  <div className="p-3 bg-light rounded border">
                    <small className="text-muted d-block mb-1">Hero Image URL</small>
                    <a href={conference.heroImageUrl} target="_blank" rel="noopener noreferrer" className="text-break small">{conference.heroImageUrl}</a>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
          <Col md={6}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Body className="p-4">
                <h5 className="mb-4 text-nrep-darker fw-bold">
                  <FontAwesomeIcon icon={faEnvelope} className="me-2 text-nrep-primary" /> 
                  Contact Information
                </h5>
                {conference.contactEmail && (
                  <div className="d-flex align-items-center gap-3 p-3 bg-light rounded border mb-3">
                    <FontAwesomeIcon icon={faEnvelope} className="text-nrep-primary" />
                    <div>
                      <small className="text-muted d-block">Email</small>
                      <a href={`mailto:${conference.contactEmail}`}>{conference.contactEmail}</a>
                    </div>
                  </div>
                )}
                {conference.contactPhone && (
                  <div className="d-flex align-items-center gap-3 p-3 bg-light rounded border">
                    <FontAwesomeIcon icon={faPhone} className="text-nrep-primary" />
                    <div>
                      <small className="text-muted d-block">Phone</small>
                      <a href={`tel:${conference.contactPhone}`}>{conference.contactPhone}</a>
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Content Customization */}
      {(conference.regClosedMessage || conference.successMessage) && (
        <Row className="g-4 mb-4">
          <Col md={12}>
            <Card className="border-0 shadow-sm">
              <Card.Body className="p-4">
                <h5 className="mb-4 text-nrep-darker fw-bold">
                  <FontAwesomeIcon icon={faCommentDots} className="me-2 text-nrep-primary" /> 
                  Content Customization
                </h5>
                <Row className="g-3">
                  {conference.regClosedMessage && (
                    <Col md={6}>
                      <div className="p-3 bg-light rounded border">
                        <small className="text-muted d-block mb-1">Registration Closed Message</small>
                        <span>{conference.regClosedMessage}</span>
                      </div>
                    </Col>
                  )}
                  {conference.successMessage && (
                    <Col md={6}>
                      <div className="p-3 bg-light rounded border">
                        <small className="text-muted d-block mb-1">Success Message</small>
                        <span>{conference.successMessage}</span>
                      </div>
                    </Col>
                  )}
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {/* Website Config (socialsJson) */}
      {conference.socialsJson && (conference.socialsJson.socials || conference.socialsJson.features?.length > 0 || conference.socialsJson.googleMapsUrl) && (
        <Row className="g-4 mb-4">
          <Col md={12}>
            <Card className="border-0 shadow-sm">
              <Card.Body className="p-4">
                <h5 className="mb-4 text-nrep-darker fw-bold">
                  <FontAwesomeIcon icon={faShareAlt} className="me-2 text-nrep-primary" /> 
                  Website Config
                </h5>
                {conference.socialsJson.socials && Object.keys(conference.socialsJson.socials).some(k => conference.socialsJson.socials[k]) && (
                  <div className="mb-3">
                    <small className="text-muted d-block mb-2 fw-bold text-uppercase" style={{ letterSpacing: '1px' }}>Social Media Links</small>
                    <div className="d-flex flex-wrap gap-2">
                      {Object.entries(conference.socialsJson.socials).filter(([, v]) => v).map(([platform, url]) => (
                        <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="badge bg-primary text-decoration-none py-2 px-3">
                          {platform.charAt(0).toUpperCase() + platform.slice(1)}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {conference.socialsJson.features && conference.socialsJson.features.length > 0 && (
                  <div className="mb-3">
                    <small className="text-muted d-block mb-2 fw-bold text-uppercase" style={{ letterSpacing: '1px' }}>Feature Cards ({conference.socialsJson.features.length})</small>
                    <div className="d-flex flex-wrap gap-2">
                      {conference.socialsJson.features.map((f, i) => (
                        <Badge key={i} bg="light" text="dark" className="border py-2 px-3">{f.icon}: {f.title}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {conference.socialsJson.googleMapsUrl && (
                  <div>
                    <small className="text-muted d-block mb-1 fw-bold text-uppercase" style={{ letterSpacing: '1px' }}>Google Maps</small>
                    <a href={conference.socialsJson.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-break small">{conference.socialsJson.googleMapsUrl}</a>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  )
}
