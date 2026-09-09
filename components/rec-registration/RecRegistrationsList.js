"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Query } from "appwrite"
import { useRouter, useSearchParams } from "next/navigation"
import { useAppwrite } from "@/lib/appwrite/provider"
import {
  deleteRecRegistration,
  getRecRegistrationsByYear,
  getRegistrationStats,
} from "@/lib/appwrite/rec-registrations"
import {
  getAllRecConferences,
  getRecConferenceByYear,
} from "@/lib/appwrite/rec-conferences"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faChevronLeft,
  faChevronRight,
  faDownload,
  faEdit,
  faEye,
  faFileImport,
  faFilter,
  faIdBadge,
  faPlus,
  faQrcode,
  faRefresh,
  faSearch,
  faSpinner,
  faTimes,
  faTrash,
  faUsers,
} from "@fortawesome/free-solid-svg-icons"
import { formatAppwriteDate } from "@/lib/utils"

const pageSizeOptions = [10, 25, 50, 100]
const registrationTypeOptions = ["Attendee", "Exhibitor", "Sponsor"]
const sectorOptions = ["Public", "Private", "Civil Society Organization", "Academia", "Other"]

const emptyStats = {
  total: 0,
  byType: { attendee: 0, exhibitor: 0, sponsor: 0 },
  bySponsor: {},
  sponsoredRegistrations: 0,
  visaLettersRequired: 0,
}

const defaultFilters = {
  registrationType: "",
  daysAttending: "",
  sector: "",
  sponsorOrganization: "",
  visaLetterRequired: "",
}

function normalizeYear(value, fallback = "") {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getRegistrantName(registration) {
  return [registration.title, registration.firstName, registration.otherName, registration.lastName]
    .filter(Boolean)
    .join(" ")
}

function getRegistrationStatusClass(type) {
  switch (type) {
    case "Attendee":
      return "rec-status-published"
    case "Exhibitor":
      return "rec-status-archived"
    case "Sponsor":
      return "rec-status-draft"
    default:
      return "rec-status-draft"
  }
}

function registrationMatchesSearch(registration, searchTerm) {
  const normalizedSearch = searchTerm.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [
    getRegistrantName(registration),
    registration.email,
    registration.otherEmail,
    registration.phone,
    registration.organization,
    registration.sponsorOrganization,
    registration.sponsorSector,
    registration.coupon,
    registration.country,
    registration.city,
    registration.stateRegion,
    registration.registrationType,
    Array.isArray(registration.sector) ? registration.sector.join(" ") : registration.sector,
  ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch))
}

function RegistrationModal({ title, children, footer, onClose }) {
  return (
    <div className="rec-modal-backdrop" role="presentation">
      <div className="rec-modal rec-modal-wide" role="dialog" aria-modal="true" aria-labelledby="registration-modal-title">
        <div className="rec-modal-header rec-modal-header-flex">
          <h3 id="registration-modal-title" className="rec-modal-title rec-modal-title-dark">
            {title}
          </h3>
          <button type="button" className="rec-icon-button" onClick={onClose} aria-label="Close modal">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="rec-modal-body">{children}</div>
        {footer && <div className="rec-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export default function RecRegistrationsList() {
  const appwriteServices = useAppwrite()
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedYear = Number(searchParams.get("year")) || null

  const [registrations, setRegistrations] = useState([])
  const [conferences, setConferences] = useState([])
  const [selectedConference, setSelectedConference] = useState(null)
  const [selectedYear, setSelectedYear] = useState(requestedYear || "")
  const [stats, setStats] = useState(emptyStats)
  const [totalRegistrations, setTotalRegistrations] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [filters, setFilters] = useState(defaultFilters)
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [selectedRegistration, setSelectedRegistration] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showBadgeModal, setShowBadgeModal] = useState(false)
  const [badgeLoading, setBadgeLoading] = useState(false)
  const [badgeDetails, setBadgeDetails] = useState(null)

  const totalPages = Math.max(1, Math.ceil(totalRegistrations / pageSize))
  const visibleRegistrations = useMemo(
    () => registrations.filter((registration) => registrationMatchesSearch(registration, searchTerm)),
    [registrations, searchTerm]
  )

  const dayOptions = useMemo(() => {
    if (selectedConference?.days?.length) {
      return selectedConference.days.map((day) => day.label).filter(Boolean)
    }

    return Array.from(
      new Set(registrations.flatMap((registration) => (
        Array.isArray(registration.daysAttending) ? registration.daysAttending : []
      )))
    )
  }, [registrations, selectedConference])

  const sponsorOptions = useMemo(
    () => Object.keys(stats.bySponsor || {}).sort((a, b) => a.localeCompare(b)),
    [stats.bySponsor]
  )

  const buildListQueries = useCallback(() => {
    const queries = []
    if (filters.registrationType) queries.push(Query.equal("registrationType", filters.registrationType))
    if (filters.daysAttending) queries.push(Query.contains("daysAttending", filters.daysAttending))
    if (filters.sector) queries.push(Query.contains("sector", filters.sector))
    if (filters.sponsorOrganization) {
      queries.push(Query.equal("sponsorOrganization", filters.sponsorOrganization))
    }
    if (filters.visaLetterRequired !== "") {
      queries.push(Query.equal("visaLetterRequired", filters.visaLetterRequired === "true"))
    }
    return queries
  }, [filters])

  const loadStats = useCallback(
    async (year) => {
      if (!appwriteServices || !year) return

      setStatsLoading(true)
      try {
        const data = await getRegistrationStats(year, appwriteServices)
        setStats(data)
      } catch (err) {
        console.error("Registration stats error:", err)
        setStats(emptyStats)
      } finally {
        setStatsLoading(false)
      }
    },
    [appwriteServices]
  )

  const loadRegistrations = useCallback(
    async ({ year = selectedYear, nextPage = page, nextPageSize = pageSize } = {}) => {
      if (!appwriteServices || !year) return

      setLoading(true)
      setError("")

      try {
        const offset = (nextPage - 1) * nextPageSize
        const response = await getRecRegistrationsByYear(
          year,
          appwriteServices,
          buildListQueries(),
          nextPageSize,
          offset
        )

        const rows = response.documents || []
        setRegistrations(rows)
        setTotalRegistrations(response.total || 0)

        if (rows.length === 0 && nextPage > 1) {
          setPage(nextPage - 1)
        }
      } catch (err) {
        console.error("Registration fetch error:", err)
        setError("Error fetching registrations. Please try again.")
      } finally {
        setLoading(false)
      }
    },
    [appwriteServices, buildListQueries, page, pageSize, selectedYear]
  )

  useEffect(() => {
    if (!appwriteServices) return

    let isMounted = true

    const initialize = async () => {
      setLoading(true)
      setError("")

      try {
        const response = await getAllRecConferences(appwriteServices)
        if (!isMounted) return

        const conferenceRows = (response.documents || []).sort((a, b) => Number(b.year || 0) - Number(a.year || 0))
        const activeConference = conferenceRows.find((conference) => conference.isActive)
        const defaultYear = requestedYear || activeConference?.year || conferenceRows[0]?.year || new Date().getFullYear()

        setConferences(conferenceRows)
        setSelectedYear(defaultYear)
      } catch (err) {
        console.error("Registration initialization error:", err)
        if (isMounted) {
          setError("Error initializing registrations. Please try again.")
          setLoading(false)
        }
      }
    }

    initialize()

    return () => {
      isMounted = false
    }
  }, [appwriteServices, requestedYear])

  useEffect(() => {
    if (!appwriteServices || !selectedYear) return

    const loadConference = async () => {
      const localConference = conferences.find((conference) => Number(conference.year) === Number(selectedYear))
      if (localConference) {
        setSelectedConference(localConference)
        return
      }

      try {
        const conference = await getRecConferenceByYear(selectedYear, appwriteServices)
        setSelectedConference(conference)
      } catch (err) {
        console.error("Selected conference fetch error:", err)
        setSelectedConference(null)
      }
    }

    loadConference()
    loadStats(selectedYear)
  }, [appwriteServices, conferences, loadStats, selectedYear])

  useEffect(() => {
    if (!appwriteServices || !selectedYear) return
    loadRegistrations({ nextPage: page, nextPageSize: pageSize })
  }, [appwriteServices, loadRegistrations, page, pageSize, selectedYear])

  const refreshCurrentPage = async () => {
    await loadRegistrations({ nextPage: page, nextPageSize: pageSize })
    await loadStats(selectedYear)
  }

  const handleYearChange = (value) => {
    const year = normalizeYear(value, "")
    setSelectedYear(year)
    setPage(1)
    setSearchTerm("")
    router.replace(`/dashboard/rec-conference/admin/registrations?year=${year}`)
  }

  const handleFilterChange = (field, value) => {
    setFilters((previous) => ({ ...previous, [field]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters(defaultFilters)
    setSearchTerm("")
    setPage(1)
  }

  const handleDelete = async () => {
    if (!selectedRegistration) return

    setDeleting(true)
    setError("")
    setSuccess("")

    try {
      await deleteRecRegistration(selectedRegistration, appwriteServices, selectedYear)
      setShowDeleteModal(false)
      setSelectedRegistration(null)
      setSuccess("Registration removed from the selected conference.")
      await refreshCurrentPage()
    } catch (err) {
      console.error("Registration delete error:", err)
      setError(err?.message || err || "Error deleting registration. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  const issueBadgeQr = async (registration) => {
    if (!selectedConference?.$id) {
      setError("Select a configured conference before issuing a badge QR.")
      return
    }

    setSelectedRegistration(registration)
    setShowBadgeModal(true)
    setBadgeDetails(null)
    setBadgeLoading(true)
    setError("")

    try {
      const response = await fetch("/api/rec/scanning/tokens/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conferenceId: selectedConference.$id,
          registrationId: registration.$id,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Failed to issue badge QR.")
      setBadgeDetails(data.badge)
    } catch (err) {
      console.error("Badge QR issue error:", err)
      setError(err.message || "Could not issue badge QR.")
      setShowBadgeModal(false)
    } finally {
      setBadgeLoading(false)
    }
  }

  const exportToCSV = async () => {
    if (!selectedYear || exporting) return

    setExporting(true)
    setError("")

    try {
      const pageSizeForExport = 100
      const queries = buildListQueries()
      const rows = []
      let offset = 0
      let total = 0

      do {
        const response = await getRecRegistrationsByYear(
          selectedYear,
          appwriteServices,
          queries,
          pageSizeForExport,
          offset
        )
        rows.push(...(response.documents || []))
        total = response.total || rows.length
        offset += pageSizeForExport
      } while (rows.length < total)

      const exportRows = rows.filter((registration) => registrationMatchesSearch(registration, searchTerm))
      const headers = [
        "Email",
        "Name",
        "Organization",
        "Sector",
        "Sponsored By",
        "Sponsor Sector",
        "Coupon Code",
        "Registration Type",
        "Days Attending",
        "Country",
        "Phone",
        "Visa Letter Required",
        "Conference Years",
        "Created At",
      ]

      const csvData = exportRows.map((registration) => [
        registration.email,
        getRegistrantName(registration),
        registration.organization,
        Array.isArray(registration.sector) ? registration.sector.join(", ") : "",
        registration.sponsorOrganization,
        registration.sponsorSector,
        registration.coupon,
        registration.registrationType,
        Array.isArray(registration.daysAttending) ? registration.daysAttending.join(", ") : "",
        registration.country,
        registration.phone,
        registration.visaLetterRequired ? "Yes" : "No",
        Array.isArray(registration.conferenceYears) ? registration.conferenceYears.join(", ") : "",
        formatAppwriteDate(registration.$createdAt),
      ])

      const escapeCsv = (field) => `"${String(field || "").replaceAll('"', '""')}"`
      const csvContent = [headers, ...csvData]
        .map((row) => row.map(escapeCsv).join(","))
        .join("\n")

      const blob = new Blob([csvContent], { type: "text/csv" })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `rec-${selectedYear}-registrations-${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Registration export error:", err)
      setError("Could not export registrations. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  const startRecord = totalRegistrations === 0 ? 0 : (page - 1) * pageSize + 1
  const endRecord = Math.min(totalRegistrations, page * pageSize)
  const activeFilterCount = Object.values(filters).filter(Boolean).length + (searchTerm.trim() ? 1 : 0)

  return (
    <>
      <section className="rec-registration-summary">
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{statsLoading ? "-" : stats.total}</span>
          <span className="rec-stat-label">Total registrants</span>
        </div>
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{statsLoading ? "-" : stats.byType?.attendee || 0}</span>
          <span className="rec-stat-label">Attendees</span>
        </div>
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{statsLoading ? "-" : stats.byType?.exhibitor || 0}</span>
          <span className="rec-stat-label">Exhibitors</span>
        </div>
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{statsLoading ? "-" : stats.byType?.sponsor || 0}</span>
          <span className="rec-stat-label">Sponsor registrations</span>
        </div>
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{statsLoading ? "-" : stats.sponsoredRegistrations || 0}</span>
          <span className="rec-stat-label">Coupon-sponsored</span>
        </div>
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{statsLoading ? "-" : stats.visaLettersRequired || 0}</span>
          <span className="rec-stat-label">Visa letters</span>
        </div>
      </section>

      <section className="rec-panel">
        <div className="rec-panel-header">
          <div>
            <h3 className="rec-panel-title">
              <FontAwesomeIcon icon={faUsers} />
              REC {selectedYear || ""} registrants
            </h3>
            <p className="rec-muted mb-0 mt-1">
              Appwrite handles year and structured filters. Search narrows the currently loaded page.
            </p>
          </div>
          <div className="rec-page-actions">
            <button
              type="button"
              className="rec-btn rec-btn-primary"
              onClick={() => router.push(`/dashboard/rec-conference/admin/registrations/new?year=${selectedYear}`)}
              disabled={!selectedYear}
            >
              <FontAwesomeIcon icon={faPlus} />
              New Registration
            </button>
            <button
              type="button"
              className="rec-btn rec-btn-outline"
              onClick={() => router.push(`/dashboard/rec-conference/admin/registrations/import?year=${selectedYear}`)}
              disabled={!selectedYear}
            >
              <FontAwesomeIcon icon={faFileImport} />
              Import Attendees
            </button>
            <button type="button" className="rec-btn rec-btn-outline" onClick={exportToCSV} disabled={exporting || !selectedYear}>
              {exporting ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faDownload} />}
              Export CSV
            </button>
            <button type="button" className="rec-icon-button" onClick={refreshCurrentPage} aria-label="Refresh registrations">
              <FontAwesomeIcon icon={faRefresh} />
            </button>
          </div>
        </div>

        <div className="rec-panel-body">
          {error && (
            <div className="rec-alert rec-alert-danger mb-3">
              <p className="mb-0">{error}</p>
            </div>
          )}
          {success && (
            <div className="rec-alert rec-alert-success mb-3">
              <p className="mb-0">{success}</p>
            </div>
          )}

          <div className="rec-registration-toolbar">
            <div className="rec-field">
              <label className="rec-label" htmlFor="registration-year">Conference</label>
              <select
                id="registration-year"
                className="rec-select"
                value={selectedYear}
                onChange={(event) => handleYearChange(event.target.value)}
              >
                {conferences.map((conference) => (
                  <option key={conference.$id || conference.year} value={conference.year}>
                    REC {conference.year} {conference.isActive ? "(Active)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="registration-type-filter">Type</label>
              <select
                id="registration-type-filter"
                className="rec-select"
                value={filters.registrationType}
                onChange={(event) => handleFilterChange("registrationType", event.target.value)}
              >
                <option value="">All Types</option>
                {registrationTypeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="registration-day-filter">Day</label>
              <select
                id="registration-day-filter"
                className="rec-select"
                value={filters.daysAttending}
                onChange={(event) => handleFilterChange("daysAttending", event.target.value)}
              >
                <option value="">All Days</option>
                {dayOptions.map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="registration-sector-filter">Sector</label>
              <select
                id="registration-sector-filter"
                className="rec-select"
                value={filters.sector}
                onChange={(event) => handleFilterChange("sector", event.target.value)}
              >
                <option value="">All Sectors</option>
                {sectorOptions.map((sector) => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="registration-sponsor-filter">Coupon Sponsor</label>
              <select
                id="registration-sponsor-filter"
                className="rec-select"
                value={filters.sponsorOrganization}
                onChange={(event) => handleFilterChange("sponsorOrganization", event.target.value)}
              >
                <option value="">All Sponsors</option>
                {sponsorOptions.map((sponsor) => (
                  <option key={sponsor} value={sponsor}>{sponsor}</option>
                ))}
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="registration-visa-filter">Visa</label>
              <select
                id="registration-visa-filter"
                className="rec-select"
                value={filters.visaLetterRequired}
                onChange={(event) => handleFilterChange("visaLetterRequired", event.target.value)}
              >
                <option value="">All</option>
                <option value="true">Required</option>
                <option value="false">Not Required</option>
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="registration-page-size">Rows</label>
              <select
                id="registration-page-size"
                className="rec-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>{size} per page</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rec-registration-search-row mt-3">
            <div className="rec-field">
              <label className="rec-label" htmlFor="registration-search">Search current page</label>
              <div className="rec-search">
                <FontAwesomeIcon icon={faSearch} />
                <input
                  id="registration-search"
                  className="rec-input"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Name, email, organization, sponsor, country..."
                />
              </div>
            </div>
            <div className="rec-filter-actions">
              <button type="button" className="rec-btn rec-btn-outline" onClick={clearFilters}>
                <FontAwesomeIcon icon={faFilter} />
                Clear Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="rec-spinner-wrap">
              <div className="rec-spinner" />
              <p className="mt-3">Loading registrations...</p>
            </div>
          ) : visibleRegistrations.length === 0 ? (
            <div className="rec-empty-state">
              <FontAwesomeIcon icon={faUsers} size="2x" />
              <h4 className="rec-empty-title">No registrations found</h4>
              <p>Adjust the filters or create a registration for this conference.</p>
              <button
                type="button"
                className="rec-btn rec-btn-primary"
                onClick={() => router.push(`/dashboard/rec-conference/admin/registrations/new?year=${selectedYear}`)}
              >
                <FontAwesomeIcon icon={faPlus} />
                New Registration
              </button>
            </div>
          ) : (
            <div className="rec-table-wrap rec-responsive-table mt-3">
              <table className="rec-table rec-registration-table">
                <thead>
                  <tr>
                    <th>Registrant</th>
                    <th>Contact</th>
                    <th>Organization</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Attendance</th>
                    <th>Visa</th>
                    <th>Registered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRegistrations.map((registration) => (
                    <tr key={registration.$id}>
                      <td data-label="Registrant">
                        <div className="rec-row-title">{getRegistrantName(registration) || "Unnamed registrant"}</div>
                        {registration.otherName && <div className="rec-row-desc">{registration.otherName}</div>}
                      </td>
                      <td data-label="Contact">
                        <div>{registration.email || "No email"}</div>
                        <div className="rec-row-desc">{registration.phone || "No phone"}</div>
                      </td>
                      <td data-label="Organization">
                        <div className="rec-row-title">{registration.organization || "No organization"}</div>
                        <div className="rec-row-desc">
                          {Array.isArray(registration.sector) && registration.sector.length
                            ? registration.sector.join(", ")
                            : "No sector"}
                        </div>
                        {registration.sponsorOrganization && (
                          <div className="rec-row-desc">
                            Sponsored by <strong>{registration.sponsorOrganization}</strong>
                          </div>
                        )}
                      </td>
                      <td data-label="Type">
                        <span className={`rec-status ${getRegistrationStatusClass(registration.registrationType)}`}>
                          {registration.registrationType || "Unknown"}
                        </span>
                      </td>
                      <td data-label="Location">
                        <div>{registration.country || "No country"}</div>
                        <div className="rec-row-desc">
                          {[registration.city, registration.stateRegion].filter(Boolean).join(", ") || "No city"}
                        </div>
                      </td>
                      <td data-label="Attendance">
                        <div className="rec-chip-list rec-chip-list-table">
                          {(Array.isArray(registration.daysAttending) ? registration.daysAttending : []).slice(0, 2).map((day) => (
                            <span key={day} className="rec-chip">{day}</span>
                          ))}
                          {Array.isArray(registration.daysAttending) && registration.daysAttending.length > 2 && (
                            <span className="rec-chip">+{registration.daysAttending.length - 2}</span>
                          )}
                          {!registration.daysAttending?.length && <span className="rec-muted">No days</span>}
                        </div>
                      </td>
                      <td data-label="Visa">
                        <span className={`rec-status ${registration.visaLetterRequired ? "rec-status-archived" : "rec-status-draft"}`}>
                          {registration.visaLetterRequired ? "Required" : "Not needed"}
                        </span>
                      </td>
                      <td data-label="Registered" className="rec-muted">
                        {formatAppwriteDate(registration.$createdAt)}
                      </td>
                      <td data-label="Actions">
                        <div className="rec-row-actions">
                          <button
                            type="button"
                            className="rec-icon-button"
                            onClick={() => {
                              setSelectedRegistration(registration)
                              setShowDetailModal(true)
                            }}
                            aria-label="View registration"
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>
                          <button
                            type="button"
                            className="rec-icon-button"
                            onClick={() => issueBadgeQr(registration)}
                            aria-label="Issue badge QR"
                          >
                            <FontAwesomeIcon icon={faQrcode} />
                          </button>
                          <button
                            type="button"
                            className="rec-icon-button"
                            onClick={() => router.push(`/dashboard/rec-conference/admin/registrations/${registration.$id}/edit?year=${selectedYear}`)}
                            aria-label="Edit registration"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button
                            type="button"
                            className="rec-icon-button rec-icon-button-danger"
                            onClick={() => {
                              setSelectedRegistration(registration)
                              setShowDeleteModal(true)
                            }}
                            aria-label="Delete registration"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rec-pagination-bar">
            <span className="rec-muted">
              Showing {startRecord}-{endRecord} of {totalRegistrations}
              {searchTerm ? ` (${visibleRegistrations.length} matched on this page)` : ""}
            </span>
            <div className="rec-page-actions">
              <button
                type="button"
                className="rec-btn rec-btn-outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
                Previous
              </button>
              <span className="rec-pagination-page">Page {page} of {totalPages}</span>
              <button
                type="button"
                className="rec-btn rec-btn-outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
              >
                Next
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {showDetailModal && selectedRegistration && (
        <RegistrationModal title="Registration Details" onClose={() => setShowDetailModal(false)}>
          <RegistrationDetails registration={selectedRegistration} selectedYear={selectedYear} />
        </RegistrationModal>
      )}

      {showDeleteModal && selectedRegistration && (
        <RegistrationModal
          title="Remove Registration"
          onClose={() => !deleting && setShowDeleteModal(false)}
          footer={
            <>
              <button type="button" className="rec-btn rec-btn-outline" disabled={deleting} onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button type="button" className="rec-btn rec-btn-accent" disabled={deleting} onClick={handleDelete}>
                {deleting ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTrash} />}
                Remove Registration
              </button>
            </>
          }
        >
          <p>
            Remove this registrant from REC {selectedYear}? If this is their only conference year, the full registration row will be deleted.
          </p>
          <div className="rec-empty-state-compact text-start">
            <div><strong>Name:</strong> {getRegistrantName(selectedRegistration)}</div>
            <div><strong>Email:</strong> {selectedRegistration.email}</div>
            <div><strong>Organization:</strong> {selectedRegistration.organization || "N/A"}</div>
          </div>
        </RegistrationModal>
      )}

      {showBadgeModal && selectedRegistration && (
        <RegistrationModal
          title="Badge QR"
          onClose={() => !badgeLoading && setShowBadgeModal(false)}
          footer={
            <>
              <button type="button" className="rec-btn rec-btn-outline" disabled={badgeLoading} onClick={() => setShowBadgeModal(false)}>
                Close
              </button>
              {badgeDetails?.qrDataUrl && (
                <a className="rec-btn rec-btn-primary" href={badgeDetails.qrDataUrl} download={`rec-${selectedYear}-${selectedRegistration.email}-badge-qr.png`}>
                  <FontAwesomeIcon icon={faIdBadge} />
                  Download QR
                </a>
              )}
            </>
          }
        >
          {badgeLoading ? (
            <div className="rec-spinner-wrap">
              <div className="rec-spinner" />
              <p className="mt-3">Issuing secure badge QR...</p>
            </div>
          ) : badgeDetails ? (
            <div className="rec-badge-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={badgeDetails.qrDataUrl} alt={`Badge QR for ${getRegistrantName(selectedRegistration)}`} />
              <div>
                <h4>{getRegistrantName(selectedRegistration)}</h4>
                <p className="rec-muted mb-2">{selectedRegistration.email}</p>
                <p className="rec-muted mb-0">
                  {badgeDetails.conference?.title || `REC ${selectedYear}`} · issued {formatAppwriteDate(badgeDetails.issuedAt, "long")}
                </p>
                {badgeDetails.badgeUrl && (
                  <a className="rec-inline-link mt-2" href={badgeDetails.badgeUrl} target="_blank" rel="noopener noreferrer">
                    Open digital badge
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="mb-0">No badge QR was generated.</p>
          )}
        </RegistrationModal>
      )}
    </>
  )
}

function DetailField({ label, value }) {
  return (
    <div className="rec-detail-field">
      <span>{label}</span>
      <strong>{value || "N/A"}</strong>
    </div>
  )
}

function RegistrationDetails({ registration, selectedYear }) {
  return (
    <div className="rec-registration-details">
      <div className="rec-detail-card">
        <h4>Personal Information</h4>
        <DetailField label="Name" value={getRegistrantName(registration)} />
        <DetailField label="Email" value={registration.email} />
        <DetailField label="Other Email" value={registration.otherEmail} />
        <DetailField label="Phone" value={registration.phone} />
        <DetailField label="Other Phone" value={registration.otherPhone} />
      </div>

      <div className="rec-detail-card">
        <h4>Organization & Location</h4>
        <DetailField label="Registrant Organization" value={registration.organization} />
        <DetailField label="Registrant Sector" value={Array.isArray(registration.sector) ? registration.sector.join(", ") : registration.sector} />
        <DetailField label="Country" value={registration.country} />
        <DetailField label="City / Region" value={[registration.city, registration.stateRegion].filter(Boolean).join(", ")} />
      </div>

      {registration.sponsorOrganization && (
        <div className="rec-detail-card">
          <h4>Coupon Sponsorship</h4>
          <DetailField label="Sponsored By" value={registration.sponsorOrganization} />
          <DetailField label="Sponsor Sector" value={registration.sponsorSector} />
          <DetailField label="Coupon Code" value={registration.coupon} />
        </div>
      )}

      <div className="rec-detail-card">
        <h4>Registration</h4>
        <DetailField label="Type" value={registration.registrationType} />
        <DetailField label="Selected Year" value={`REC ${selectedYear}`} />
        <DetailField label="Conference Years" value={Array.isArray(registration.conferenceYears) ? registration.conferenceYears.join(", ") : ""} />
        <DetailField label="Days Attending" value={Array.isArray(registration.daysAttending) ? registration.daysAttending.join(", ") : ""} />
        {registration.registrationType === "Exhibitor" && (
          <DetailField label="Exhibition Details" value={registration.exhibitionDetails} />
        )}
      </div>

      <div className="rec-detail-card">
        <h4>Travel & Notes</h4>
        <DetailField label="Visa Letter" value={registration.visaLetterRequired ? "Required" : "Not required"} />
        {registration.visaLetterRequired && <DetailField label="Passport Number" value={registration.passportNumber} />}
        <DetailField label="Comments" value={registration.additionalComments} />
        <DetailField label="Registered" value={formatAppwriteDate(registration.$createdAt, "long")} />
        {registration.$updatedAt !== registration.$createdAt && (
          <DetailField label="Last Updated" value={formatAppwriteDate(registration.$updatedAt, "long")} />
        )}
      </div>
    </div>
  )
}
