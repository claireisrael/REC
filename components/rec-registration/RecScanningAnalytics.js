"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faChartLine,
  faClock,
  faDownload,
  faFilter,
  faIdBadge,
  faQrcode,
  faRefresh,
  faSearch,
  faTriangleExclamation,
  faUserGroup,
  faUserShield,
  faUsersGear,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import { paginateRecAnalyticsRows } from "@/lib/rec-conference/scanning-analytics.mjs"
import {
  formatRecOptionalSessions,
  formatRecParticipantCategory,
  recParticipantCategoryFilterOptions,
} from "@/lib/rec-conference/registration-tracks.mjs"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"

const emptyOverview = {
  summary: {},
  byEvent: [],
  byScanner: [],
  byRegistrationType: [],
  byCountry: [],
  byOrganization: [],
  byAttendanceDay: [],
  rejectionReasons: [],
  timeline: [],
}

const emptyPage = {
  documents: [],
  total: 0,
  page: 1,
  limit: 25,
  totalPages: 1,
}

const navigationItems = [
  ["events", faIdBadge, "Scan Events"],
  ["operators", faUsersGear, "Scanner Operators"],
  ["badges", faQrcode, "Badge Registry"],
  ["analytics", faChartLine, "Analytics"],
]

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "Request failed")
  return payload
}

function formatDateTime(value, fallback = "Not recorded") {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  })
}

function formatTime(value) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("en-UG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  })
}

function humanize(value, fallback = "Not specified") {
  const normalized = String(value || "").trim()
  if (!normalized) return fallback
  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatList(value, fallback = "Not specified") {
  return Array.isArray(value) && value.length ? value.join(", ") : fallback
}

function toStartOfKampalaDay(value) {
  return value ? `${value}T00:00:00+03:00` : ""
}

function toEndOfKampalaDay(value) {
  return value ? `${value}T23:59:59.999+03:00` : ""
}

function buildReportParams(conferenceId, filters = {}) {
  const params = new URLSearchParams({ conferenceId })
  if (filters.eventId) params.set("eventId", filters.eventId)
  if (filters.from) params.set("from", toStartOfKampalaDay(filters.from))
  if (filters.to) params.set("to", toEndOfKampalaDay(filters.to))
  return params
}

function AccessMessage({ title, children }) {
  return (
    <div className="rec-dashboard-container">
      <div className="rec-access-wrap">
        <div className="rec-alert text-center">
          <FontAwesomeIcon icon={faUserShield} size="3x" className="mb-4" style={{ color: "#EFA74F" }} />
          <h4 className="rec-alert-title">{title}</h4>
          <div>{children}</div>
          <Link href="/dashboard/rec-conference" className="rec-btn rec-btn-primary mt-3">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to REC Conference
          </Link>
        </div>
      </div>
    </div>
  )
}

function ScannerNavigation({ conferenceId }) {
  const suffix = conferenceId ? `?conferenceId=${encodeURIComponent(conferenceId)}` : ""
  return (
    <nav className="rec-scanning-tabs" aria-label="Scanning management">
      {navigationItems.map(([key, icon, label]) => (
        <Link
          key={key}
          href={`/dashboard/rec-conference/admin/scanning/${key}${suffix}`}
          className={key === "analytics" ? "active" : ""}
          aria-current={key === "analytics" ? "page" : undefined}
        >
          <FontAwesomeIcon icon={icon} />
          {label}
        </Link>
      ))}
    </nav>
  )
}

function SummaryCard({ label, value, detail, tone = "primary" }) {
  return (
    <div className={`rec-analytics-stat rec-analytics-stat-${tone}`}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
      {detail && <small>{detail}</small>}
    </div>
  )
}

function ProgressRows({ rows, emptyMessage, valueKey = "scanned", totalKey = "registered", limit = 8 }) {
  if (!rows?.length) return <div className="rec-empty-state rec-empty-state-compact">{emptyMessage}</div>

  return (
    <div className="rec-analytics-progress-list">
      {rows.slice(0, limit).map((row) => {
        const value = Number(row[valueKey] ?? row.count ?? 0)
        const total = totalKey ? Number(row[totalKey] || 0) : Math.max(...rows.map((item) => Number(item.count || 0)), 1)
        const percentage = total ? Math.min(100, Math.round((value / total) * 100)) : 0
        return (
          <div className="rec-analytics-progress-row" key={row.key || row.label}>
            <div className="rec-analytics-progress-label">
              <strong>{row.label}</strong>
              <span>{totalKey ? `${value} of ${total}` : value}</span>
            </div>
            <div className="rec-analytics-progress-track" aria-hidden="true">
              <span style={{ width: `${percentage}%` }} />
            </div>
            {totalKey && <small>{row.attendanceRate || 0}% attendance</small>}
          </div>
        )
      })}
    </div>
  )
}

function Pagination({ pageData, onPageChange, onLimitChange, itemLabel = "record" }) {
  if (!pageData.total) return null
  const firstRecord = ((pageData.page - 1) * pageData.limit) + 1
  const lastRecord = Math.min(pageData.page * pageData.limit, pageData.total)
  const itemName = `${itemLabel}${pageData.total === 1 ? "" : "s"}`
  const collectionName = `${itemLabel}s`
  const visibleRange = firstRecord === lastRecord
    ? firstRecord.toLocaleString()
    : `${firstRecord.toLocaleString()}-${lastRecord.toLocaleString()}`

  return (
    <nav className="rec-pagination-bar" aria-label={`${collectionName} pagination`}>
      <span className="rec-muted" aria-live="polite">
        Showing {visibleRange} of {pageData.total.toLocaleString()} {itemName}
      </span>
      <div className="rec-pagination-controls">
        {onLimitChange && (
          <label className="rec-pagination-size">
            <span>Rows</span>
            <select
              className="rec-select"
              value={pageData.limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
              aria-label={`Rows per page for ${itemName}`}
            >
              {[10, 25, 50].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="rec-btn rec-btn-outline"
          aria-label={`Previous page of ${collectionName}`}
          disabled={pageData.page <= 1}
          onClick={() => onPageChange(pageData.page - 1)}
        >
          Previous
        </button>
        <span className="rec-pagination-page">Page {pageData.page} of {pageData.totalPages}</span>
        <button
          type="button"
          className="rec-btn rec-btn-outline"
          aria-label={`Next page of ${collectionName}`}
          disabled={pageData.page >= pageData.totalPages}
          onClick={() => onPageChange(pageData.page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  )
}

function DetailField({ label, value, href }) {
  return (
    <div className="rec-analytics-detail-field">
      <span>{label}</span>
      {href && value ? <a href={href}>{value}</a> : <strong>{value || "Not specified"}</strong>}
    </div>
  )
}

export default function RecScanningAnalytics({ initialConferenceId = "" }) {
  const router = useRouter()
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES,
  } = useAuth()

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "manage")
  const isSenior = isSeniorManager()
  const permissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  const [conferences, setConferences] = useState([])
  const [conferenceId, setConferenceId] = useState("")
  const [draftFilters, setDraftFilters] = useState({ eventId: "", from: "", to: "" })
  const [appliedFilters, setAppliedFilters] = useState({ eventId: "", from: "", to: "" })
  const [overview, setOverview] = useState(emptyOverview)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState("")
  const [detailError, setDetailError] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)

  const [eventSummaryPageNumber, setEventSummaryPageNumber] = useState(1)
  const [eventSummaryLimit, setEventSummaryLimit] = useState(10)
  const [scannerSummaryPageNumber, setScannerSummaryPageNumber] = useState(1)
  const [scannerSummaryLimit, setScannerSummaryLimit] = useState(10)

  const [activeDataset, setActiveDataset] = useState("attendance")
  const [attendeePage, setAttendeePage] = useState(emptyPage)
  const [attendeePageNumber, setAttendeePageNumber] = useState(1)
  const [attendeeSearchInput, setAttendeeSearchInput] = useState("")
  const [attendeeSearch, setAttendeeSearch] = useState("")
  const [attendanceFilter, setAttendanceFilter] = useState("all")
  const [registrationTypeFilter, setRegistrationTypeFilter] = useState("")
  const [participantCategoryFilter, setParticipantCategoryFilter] = useState("")

  const [scanPage, setScanPage] = useState(emptyPage)
  const [scanPageNumber, setScanPageNumber] = useState(1)
  const [scanSearchInput, setScanSearchInput] = useState("")
  const [scanSearch, setScanSearch] = useState("")
  const [scanStatus, setScanStatus] = useState("")
  const [scannerFilter, setScannerFilter] = useState("")

  const [selectedRegistrationId, setSelectedRegistrationId] = useState("")
  const [registrantDetail, setRegistrantDetail] = useState(null)

  const selectedConference = useMemo(
    () => conferences.find((conference) => conference.$id === conferenceId) || null,
    [conferenceId, conferences]
  )

  const eventSummaryPage = useMemo(
    () => paginateRecAnalyticsRows(overview.byEvent, eventSummaryPageNumber, eventSummaryLimit, 10),
    [eventSummaryLimit, eventSummaryPageNumber, overview.byEvent]
  )

  const scannerSummaryPage = useMemo(
    () => paginateRecAnalyticsRows(overview.byScanner, scannerSummaryPageNumber, scannerSummaryLimit, 10),
    [overview.byScanner, scannerSummaryLimit, scannerSummaryPageNumber]
  )

  const reportParams = useMemo(
    () => buildReportParams(conferenceId, appliedFilters),
    [appliedFilters, conferenceId]
  )

  const attendanceExportHref = useMemo(() => {
    const params = new URLSearchParams(reportParams)
    params.set("kind", "attendance")
    if (attendeeSearch) params.set("search", attendeeSearch)
    if (attendanceFilter !== "all") params.set("attendance", attendanceFilter)
    if (registrationTypeFilter) params.set("registrationType", registrationTypeFilter)
    if (participantCategoryFilter) params.set("participantCategory", participantCategoryFilter)
    return `/api/rec/scanning/analytics/export?${params.toString()}`
  }, [attendanceFilter, attendeeSearch, participantCategoryFilter, registrationTypeFilter, reportParams])

  const scanExportHref = useMemo(() => {
    const params = new URLSearchParams(reportParams)
    params.set("kind", "scan_log")
    if (scanSearch) params.set("search", scanSearch)
    if (scanStatus) params.set("status", scanStatus)
    if (scannerFilter) params.set("scanner", scannerFilter)
    return `/api/rec/scanning/analytics/export?${params.toString()}`
  }, [reportParams, scanSearch, scanStatus, scannerFilter])

  useEffect(() => {
    if ((!hasRecAccess && !isSenior) || (!canManageRec && !isSenior)) return
    const controller = new AbortController()

    const loadConferences = async () => {
      setOverviewLoading(true)
      setError("")
      try {
        const data = await fetchJson("/api/rec/scanning/conferences", { signal: controller.signal })
        const rows = data.documents || []
        setConferences(rows)
        setConferenceId(
          rows.find((conference) => conference.$id === initialConferenceId)?.$id
          || rows.find((conference) => conference.isActive)?.$id
          || rows[0]?.$id
          || ""
        )
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Failed to load conferences.")
      } finally {
        if (!controller.signal.aborted) setOverviewLoading(false)
      }
    }

    loadConferences()
    return () => controller.abort()
  }, [canManageRec, hasRecAccess, initialConferenceId, isSenior])

  useEffect(() => {
    if (!conferenceId) return
    const controller = new AbortController()

    const loadOverview = async () => {
      setOverviewLoading(true)
      setError("")
      try {
        const data = await fetchJson(`/api/rec/scanning/analytics?${reportParams.toString()}`, {
          signal: controller.signal,
        })
        setOverview(data)
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Failed to load scan analytics.")
      } finally {
        if (!controller.signal.aborted) setOverviewLoading(false)
      }
    }

    loadOverview()
    return () => controller.abort()
  }, [conferenceId, refreshKey, reportParams])

  useEffect(() => {
    if (!conferenceId || activeDataset !== "attendance") return
    const controller = new AbortController()

    const loadAttendees = async () => {
      setDataLoading(true)
      setError("")
      try {
        const params = new URLSearchParams(reportParams)
        params.set("page", String(attendeePageNumber))
        params.set("limit", "25")
        params.set("attendance", attendanceFilter)
        if (attendeeSearch) params.set("search", attendeeSearch)
        if (registrationTypeFilter) params.set("registrationType", registrationTypeFilter)
        if (participantCategoryFilter) params.set("participantCategory", participantCategoryFilter)
        const data = await fetchJson(`/api/rec/scanning/analytics/registrants?${params.toString()}`, {
          signal: controller.signal,
        })
        setAttendeePage(data)
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Failed to load attendee analytics.")
      } finally {
        if (!controller.signal.aborted) setDataLoading(false)
      }
    }

    loadAttendees()
    return () => controller.abort()
  }, [activeDataset, attendanceFilter, attendeePageNumber, attendeeSearch, conferenceId, participantCategoryFilter, refreshKey, registrationTypeFilter, reportParams])

  useEffect(() => {
    if (!conferenceId || activeDataset !== "scan_log") return
    const controller = new AbortController()

    const loadScans = async () => {
      setDataLoading(true)
      setError("")
      try {
        const params = new URLSearchParams(reportParams)
        params.set("page", String(scanPageNumber))
        params.set("limit", "25")
        if (scanSearch) params.set("search", scanSearch)
        if (scanStatus) params.set("status", scanStatus)
        if (scannerFilter) params.set("scanner", scannerFilter)
        const data = await fetchJson(`/api/rec/scanning/analytics/scans?${params.toString()}`, {
          signal: controller.signal,
        })
        setScanPage(data)
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Failed to load the scan log.")
      } finally {
        if (!controller.signal.aborted) setDataLoading(false)
      }
    }

    loadScans()
    return () => controller.abort()
  }, [activeDataset, conferenceId, refreshKey, reportParams, scanPageNumber, scanSearch, scannerFilter, scanStatus])

  const changeConference = (nextConferenceId) => {
    setConferenceId(nextConferenceId)
    setDraftFilters({ eventId: "", from: "", to: "" })
    setAppliedFilters({ eventId: "", from: "", to: "" })
    setEventSummaryPageNumber(1)
    setScannerSummaryPageNumber(1)
    setAttendeePageNumber(1)
    setScanPageNumber(1)
    router.replace(
      `/dashboard/rec-conference/admin/scanning/analytics${nextConferenceId ? `?conferenceId=${encodeURIComponent(nextConferenceId)}` : ""}`,
      { scroll: false }
    )
  }

  const applyReportFilters = (event) => {
    event.preventDefault()
    if (draftFilters.from && draftFilters.to && draftFilters.to < draftFilters.from) {
      setError("The report end date must be on or after the start date.")
      return
    }
    setError("")
    setAppliedFilters(draftFilters)
    setEventSummaryPageNumber(1)
    setScannerSummaryPageNumber(1)
    setAttendeePageNumber(1)
    setScanPageNumber(1)
  }

  const clearReportFilters = () => {
    const cleared = { eventId: "", from: "", to: "" }
    setDraftFilters(cleared)
    setAppliedFilters(cleared)
    setEventSummaryPageNumber(1)
    setScannerSummaryPageNumber(1)
    setAttendeePageNumber(1)
    setScanPageNumber(1)
  }

  const openRegistrant = async (registrationId) => {
    setSelectedRegistrationId(registrationId)
    setRegistrantDetail(null)
    setDetailError("")
    setDetailLoading(true)
    try {
      const params = new URLSearchParams({ conferenceId })
      const data = await fetchJson(
        `/api/rec/scanning/analytics/registrants/${encodeURIComponent(registrationId)}?${params.toString()}`
      )
      setRegistrantDetail(data)
    } catch (err) {
      setDetailError(err.message || "Failed to load registrant details.")
    } finally {
      setDetailLoading(false)
    }
  }

  const closeRegistrant = () => {
    setSelectedRegistrationId("")
    setRegistrantDetail(null)
    setDetailError("")
  }

  if (!hasRecAccess && !isSenior) {
    return (
      <AccessMessage title="Access Restricted">
        <p>You do not have access to the REC Conference module.</p>
      </AccessMessage>
    )
  }

  if (!canManageRec && !isSenior) {
    return (
      <AccessMessage title="Manage Access Required">
        <p>
          You have <strong>{permissionLevel}</strong> access. Scanning analytics requires manage access or senior manager access.
        </p>
      </AccessMessage>
    )
  }

  const summary = overview.summary || {}
  const selectedEvent = overview.byEvent?.find((item) => item.eventId === appliedFilters.eventId)

  return (
    <div className="rec-dashboard-container rec-scanning-analytics-page">
      <div className="rec-page-bar mb-4">
        <div>
          <div className="rec-breadcrumb">
            <Link href="/dashboard/rec-conference">
              <FontAwesomeIcon icon={faArrowLeft} /> REC Conference
            </Link>
            <span className="rec-breadcrumb-separator">/</span>
            <span>Scanning Analytics</span>
          </div>
          <h2 className="rec-header-gradient mb-2">Attendance and Scan Analytics</h2>
          <p className="rec-muted mb-0">
            {selectedConference?.title || "Conference reporting"}
            {selectedEvent ? ` / ${selectedEvent.name}` : " / All scan events"}
          </p>
        </div>
        <div className="rec-page-actions">
          <Link href="/rec-scanner" target="_blank" className="rec-btn rec-btn-primary">
            <FontAwesomeIcon icon={faQrcode} />
            Open Scanner
          </Link>
          <button
            type="button"
            className="rec-icon-button"
            onClick={() => setRefreshKey((current) => current + 1)}
            aria-label="Refresh analytics"
          >
            <FontAwesomeIcon icon={faRefresh} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rec-alert rec-alert-danger mb-3">
          <p className="mb-0">{error}</p>
        </div>
      )}

      <section className="rec-panel mb-4">
        <div className="rec-panel-body">
          <div className="rec-scanning-topbar">
            <div className="rec-field">
              <label className="rec-label" htmlFor="analytics-conference">Conference</label>
              <select
                id="analytics-conference"
                className="rec-select"
                value={conferenceId}
                onChange={(event) => changeConference(event.target.value)}
              >
                {conferences.map((conference) => (
                  <option key={conference.$id} value={conference.$id}>
                    {conference.title || formatRecEdition(conference.year)} {conference.isActive ? "(Active)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <ScannerNavigation conferenceId={conferenceId} />
          </div>
        </div>
      </section>

      <section className="rec-panel mb-4">
        <div className="rec-panel-header">
          <h3 className="rec-panel-title"><FontAwesomeIcon icon={faFilter} /> Report Filters</h3>
          {(appliedFilters.eventId || appliedFilters.from || appliedFilters.to) && (
            <span className="rec-status rec-status-published">Filtered report</span>
          )}
        </div>
        <div className="rec-panel-body">
          <form className="rec-analytics-filter-grid" onSubmit={applyReportFilters}>
            <div className="rec-field">
              <label className="rec-label" htmlFor="analytics-event">Scan Event</label>
              <select
                id="analytics-event"
                className="rec-select"
                value={draftFilters.eventId}
                onChange={(event) => setDraftFilters((current) => ({ ...current, eventId: event.target.value }))}
              >
                <option value="">All scan events</option>
                {(overview.byEvent || []).map((scanEvent) => (
                  <option key={scanEvent.eventId} value={scanEvent.eventId}>{scanEvent.name}</option>
                ))}
              </select>
            </div>
            <div className="rec-field">
              <label className="rec-label" htmlFor="analytics-from">From Date</label>
              <input
                id="analytics-from"
                type="date"
                className="rec-input"
                value={draftFilters.from}
                onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))}
              />
            </div>
            <div className="rec-field">
              <label className="rec-label" htmlFor="analytics-to">To Date</label>
              <input
                id="analytics-to"
                type="date"
                className="rec-input"
                value={draftFilters.to}
                onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))}
              />
            </div>
            <div className="rec-filter-actions rec-analytics-filter-actions">
              <button type="button" className="rec-btn rec-btn-outline" onClick={clearReportFilters}>Clear</button>
              <button type="submit" className="rec-btn rec-btn-primary">
                <FontAwesomeIcon icon={faFilter} /> Apply
              </button>
            </div>
          </form>
        </div>
      </section>

      {overviewLoading ? (
        <div className="rec-spinner-wrap">
          <div className="rec-spinner" />
          <p className="mt-3">Loading conference analytics...</p>
        </div>
      ) : !conferenceId ? (
        <div className="rec-empty-state rec-panel">No conferences are available for reporting.</div>
      ) : (
        <>
          <div className="rec-analytics-summary mb-4">
            <SummaryCard label="Registrants" value={summary.registeredAttendees?.toLocaleString()} detail="Eligible for this conference" />
            <SummaryCard label="Attended" value={summary.uniqueAttendees?.toLocaleString()} detail="Unique accepted badges" tone="success" />
            <SummaryCard label="Not Yet Scanned" value={summary.notYetScanned?.toLocaleString()} detail="No accepted scan in scope" tone="muted" />
            <SummaryCard label="Accepted Scans" value={summary.acceptedScans?.toLocaleString()} detail={`${summary.acceptanceRate || 0}% of scan records`} tone="success" />
            <SummaryCard label="Rejected Scans" value={summary.rejectedScans?.toLocaleString()} detail="Invalid or disallowed attempts" tone="danger" />
            <SummaryCard label="Attendance Rate" value={`${summary.attendanceRate || 0}%`} detail={`${summary.activeEvents || 0} active scan events`} tone="accent" />
          </div>

          <div className="rec-analytics-overview-grid mb-4">
            <section className="rec-panel">
              <div className="rec-panel-header">
                <h3 className="rec-panel-title"><FontAwesomeIcon icon={faIdBadge} /> Event Attendance</h3>
              </div>
              <div className="rec-panel-body p-0">
                <div className="rec-table-wrap rec-responsive-table">
                  <table className="rec-table rec-analytics-event-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Schedule</th>
                        <th>Eligible</th>
                        <th>Attended</th>
                        <th>Rate</th>
                        <th>Rejected</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventSummaryPage.documents.map((scanEvent) => (
                        <tr key={scanEvent.eventId}>
                          <td data-label="Event">
                            <strong className="rec-row-title">{scanEvent.name}</strong>
                            <small>{humanize(scanEvent.type)}{scanEvent.venue ? ` / ${scanEvent.venue}` : ""}</small>
                          </td>
                          <td data-label="Schedule">
                            {scanEvent.day ? `Day ${scanEvent.day}` : "Any day"}
                            <small>{[formatTime(scanEvent.startTime), formatTime(scanEvent.endTime)].filter(Boolean).join(" - ") || "No time window"}</small>
                          </td>
                          <td data-label="Eligible">{scanEvent.eligibleRegistrants.toLocaleString()}</td>
                          <td data-label="Attended">{scanEvent.uniqueRegistrants.toLocaleString()}</td>
                          <td data-label="Rate"><strong>{scanEvent.attendanceRate}%</strong></td>
                          <td data-label="Rejected">{scanEvent.rejected.toLocaleString()}</td>
                        </tr>
                      ))}
                      {!eventSummaryPage.total && (
                        <tr><td colSpan="6"><div className="rec-empty-state rec-empty-state-compact">No scan events are configured.</div></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {eventSummaryPage.total > 0 && (
                  <div className="rec-panel-body rec-analytics-pagination-body rec-analytics-summary-pagination">
                    <Pagination
                      pageData={eventSummaryPage}
                      onPageChange={setEventSummaryPageNumber}
                      onLimitChange={(nextLimit) => {
                        setEventSummaryLimit(nextLimit)
                        setEventSummaryPageNumber(1)
                      }}
                      itemLabel="event"
                    />
                  </div>
                )}
              </div>
            </section>

            <section className="rec-panel">
              <div className="rec-panel-header">
                <h3 className="rec-panel-title"><FontAwesomeIcon icon={faUsersGear} /> Scanner Performance</h3>
              </div>
              <div className="rec-panel-body">
                {overview.byScanner?.length ? (
                  <div className="rec-analytics-operator-list">
                    {scannerSummaryPage.documents.map((scanner) => (
                      <div key={scanner.key} className="rec-analytics-operator-row">
                        <div>
                          <strong>{scanner.name}</strong>
                          <small>{scanner.uniqueRegistrants} unique attendees / {scanner.total} records</small>
                        </div>
                        <div>
                          <strong>{scanner.acceptanceRate}%</strong>
                          <small>{scanner.accepted} accepted</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rec-empty-state rec-empty-state-compact">No scanner activity in this report.</div>
                )}
                {scannerSummaryPage.total > 0 && (
                  <div className="rec-analytics-summary-pagination">
                    <Pagination
                      pageData={scannerSummaryPage}
                      onPageChange={setScannerSummaryPageNumber}
                      onLimitChange={(nextLimit) => {
                        setScannerSummaryLimit(nextLimit)
                        setScannerSummaryPageNumber(1)
                      }}
                      itemLabel="scanner operator"
                    />
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="rec-analytics-breakdown-grid mb-4">
            <section className="rec-panel">
              <div className="rec-panel-header"><h3 className="rec-panel-title">Registration Types</h3></div>
              <div className="rec-panel-body">
                <ProgressRows rows={overview.byRegistrationType} emptyMessage="No registration data." />
              </div>
            </section>
            <section className="rec-panel">
              <div className="rec-panel-header"><h3 className="rec-panel-title">Registered Days</h3></div>
              <div className="rec-panel-body">
                <ProgressRows rows={overview.byAttendanceDay} emptyMessage="No attendance-day data." />
              </div>
            </section>
            <section className="rec-panel">
              <div className="rec-panel-header"><h3 className="rec-panel-title">Rejection Reasons</h3></div>
              <div className="rec-panel-body">
                <ProgressRows rows={overview.rejectionReasons} emptyMessage="No rejected scans in this report." valueKey="count" totalKey="" />
              </div>
            </section>
          </div>

          <div className="rec-analytics-breakdown-grid mb-4">
            <section className="rec-panel">
              <div className="rec-panel-header"><h3 className="rec-panel-title">Top Organizations</h3></div>
              <div className="rec-panel-body">
                <ProgressRows rows={overview.byOrganization} emptyMessage="No organization data." limit={10} />
              </div>
            </section>
            <section className="rec-panel">
              <div className="rec-panel-header"><h3 className="rec-panel-title">Top Countries</h3></div>
              <div className="rec-panel-body">
                <ProgressRows rows={overview.byCountry} emptyMessage="No country data." limit={10} />
              </div>
            </section>
            <section className="rec-panel">
              <div className="rec-panel-header">
                <h3 className="rec-panel-title"><FontAwesomeIcon icon={faClock} /> Recent Hourly Activity</h3>
              </div>
              <div className="rec-panel-body">
                {overview.timeline?.length ? (
                  <div className="rec-analytics-timeline">
                    {overview.timeline.slice(-10).map((item) => (
                      <div key={item.key}>
                        <span>{item.label}</span>
                        <strong>{item.total} scans</strong>
                        <small>{item.accepted} accepted / {item.rejected} rejected</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rec-empty-state rec-empty-state-compact">No hourly activity in this report.</div>
                )}
              </div>
            </section>
          </div>

          <section className="rec-panel mb-4">
            <div className="rec-panel-header rec-analytics-table-header">
              <div>
                <h3 className="rec-panel-title">
                  <FontAwesomeIcon icon={activeDataset === "attendance" ? faUserGroup : faQrcode} />
                  {activeDataset === "attendance" ? "Registrant Attendance" : "Scan Audit Log"}
                </h3>
                <p className="rec-muted mb-0">
                  {activeDataset === "attendance"
                    ? "Conference roster matched with accepted and rejected scan activity."
                    : "Chronological scanner activity with event, operator, and result details."}
                </p>
              </div>
              <div className="rec-analytics-segmented" role="group" aria-label="Analytics dataset">
                <button
                  type="button"
                  className={activeDataset === "attendance" ? "active" : ""}
                  aria-pressed={activeDataset === "attendance"}
                  onClick={() => setActiveDataset("attendance")}
                >
                  Attendees
                </button>
                <button
                  type="button"
                  className={activeDataset === "scan_log" ? "active" : ""}
                  aria-pressed={activeDataset === "scan_log"}
                  onClick={() => setActiveDataset("scan_log")}
                >
                  Scan Log
                </button>
              </div>
            </div>

            {activeDataset === "attendance" ? (
              <>
                <div className="rec-panel-body rec-analytics-data-filters">
                  <form
                    className="rec-analytics-search-field"
                    onSubmit={(event) => {
                      event.preventDefault()
                      setAttendeeSearch(attendeeSearchInput.trim())
                      setAttendeePageNumber(1)
                    }}
                  >
                    <label className="rec-label" htmlFor="attendance-search">Registrant</label>
                    <div className="rec-analytics-search-control">
                      <input
                        id="attendance-search"
                        className="rec-input"
                        type="search"
                        placeholder="Name, email, or organization"
                        value={attendeeSearchInput}
                        onChange={(event) => setAttendeeSearchInput(event.target.value)}
                      />
                      <button type="submit" className="rec-icon-button" aria-label="Search registrants">
                        <FontAwesomeIcon icon={faSearch} />
                      </button>
                    </div>
                  </form>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="attendance-state">Attendance</label>
                    <select
                      id="attendance-state"
                      className="rec-select"
                      value={attendanceFilter}
                      onChange={(event) => {
                        setAttendanceFilter(event.target.value)
                        setAttendeePageNumber(1)
                      }}
                    >
                      <option value="all">All registrants</option>
                      <option value="scanned">Scanned</option>
                      <option value="not_scanned">Not yet scanned</option>
                    </select>
                  </div>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="attendance-type">Registration Type</label>
                    <select
                      id="attendance-type"
                      className="rec-select"
                      value={registrationTypeFilter}
                      onChange={(event) => {
                        setRegistrationTypeFilter(event.target.value)
                        setAttendeePageNumber(1)
                      }}
                    >
                      <option value="">All types</option>
                      {(overview.byRegistrationType || []).map((item) => (
                        <option key={item.key} value={item.key}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="attendance-category">Category</label>
                    <select
                      id="attendance-category"
                      className="rec-select"
                      value={participantCategoryFilter}
                      onChange={(event) => {
                        setParticipantCategoryFilter(event.target.value)
                        setAttendeePageNumber(1)
                      }}
                    >
                      <option value="">All categories</option>
                      {recParticipantCategoryFilterOptions(selectedConference?.year).map((category) => (
                        <option key={category.value} value={category.value}>{category.label}</option>
                      ))}
                    </select>
                  </div>
                  <a className="rec-btn rec-btn-outline" href={attendanceExportHref}>
                    <FontAwesomeIcon icon={faDownload} /> Export CSV
                  </a>
                </div>
                <div className="rec-table-wrap rec-responsive-table">
                  <table className="rec-table rec-analytics-attendee-table">
                    <thead>
                      <tr>
                        <th>Registrant</th>
                        <th>Organization</th>
                        <th>Registration</th>
                        <th>Attendance</th>
                        <th>Events</th>
                        <th>Last Scan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!dataLoading && attendeePage.documents.map((row) => (
                        <tr key={row.registrationId}>
                          <td data-label="Registrant">
                            <button
                              type="button"
                              className="rec-table-name-button"
                              onClick={() => openRegistrant(row.registrationId)}
                            >
                              {row.name}
                            </button>
                            <small>{row.email || "No email"}</small>
                          </td>
                          <td data-label="Organization">
                            {row.organization || "Not specified"}
                            {row.sponsorOrganization && <small>Sponsor: {row.sponsorOrganization}</small>}
                          </td>
                          <td data-label="Registration">
                            {humanize(row.registrationType)}
                            <small>{formatRecParticipantCategory(row, selectedConference?.year)}</small>
                            <small>{formatList(row.daysAttending)}</small>
                          </td>
                          <td data-label="Attendance">
                            <span className={`rec-status ${row.attendanceStatus === "scanned" ? "rec-status-published" : "rec-status-draft"}`}>
                              {row.attendanceStatus === "scanned" ? "Scanned" : "Not scanned"}
                            </span>
                            <small>{row.acceptedScans} accepted / {row.rejectedScans} rejected</small>
                          </td>
                          <td data-label="Events">
                            {row.lastScanEventName || row.eventsAttended?.[0]?.name || "No event scanned"}
                            {row.eventsAttended?.length > 1 && (
                              <small>
                                {row.eventsAttended.slice(1).map((event) => event.name).join(" · ")}
                              </small>
                            )}
                          </td>
                          <td data-label="Last Scan">
                            {row.lastScanAt ? formatDateTime(row.lastScanAt) : "No accepted scan"}
                            {row.lastScanEventName && <small>{row.lastScanEventName}{row.lastScanVenue ? ` · ${row.lastScanVenue}` : ""}</small>}
                          </td>
                        </tr>
                      ))}
                      {dataLoading && (
                        <tr><td colSpan="6"><div className="rec-spinner-wrap rec-analytics-table-loading"><div className="rec-spinner" /></div></td></tr>
                      )}
                      {!dataLoading && !attendeePage.documents.length && (
                        <tr><td colSpan="6"><div className="rec-empty-state">No registrants match these filters.</div></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="rec-panel-body rec-analytics-pagination-body">
                  <Pagination pageData={attendeePage} onPageChange={setAttendeePageNumber} />
                </div>
              </>
            ) : (
              <>
                <div className="rec-panel-body rec-analytics-data-filters">
                  <form
                    className="rec-analytics-search-field"
                    onSubmit={(event) => {
                      event.preventDefault()
                      setScanSearch(scanSearchInput.trim())
                      setScanPageNumber(1)
                    }}
                  >
                    <label className="rec-label" htmlFor="scan-log-search">Scan Record</label>
                    <div className="rec-analytics-search-control">
                      <input
                        id="scan-log-search"
                        className="rec-input"
                        type="search"
                        placeholder="Registrant, event, or scanner"
                        value={scanSearchInput}
                        onChange={(event) => setScanSearchInput(event.target.value)}
                      />
                      <button type="submit" className="rec-icon-button" aria-label="Search scan records">
                        <FontAwesomeIcon icon={faSearch} />
                      </button>
                    </div>
                  </form>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="scan-log-status">Result</label>
                    <select
                      id="scan-log-status"
                      className="rec-select"
                      value={scanStatus}
                      onChange={(event) => {
                        setScanStatus(event.target.value)
                        setScanPageNumber(1)
                      }}
                    >
                      <option value="">All results</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                      <option value="duplicate">Legacy duplicate</option>
                      <option value="manual_override">Manual override</option>
                    </select>
                  </div>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="scan-log-scanner">Scanner</label>
                    <select
                      id="scan-log-scanner"
                      className="rec-select"
                      value={scannerFilter}
                      onChange={(event) => {
                        setScannerFilter(event.target.value)
                        setScanPageNumber(1)
                      }}
                    >
                      <option value="">All scanners</option>
                      {(overview.byScanner || []).map((scanner) => (
                        <option key={scanner.key} value={scanner.key}>{scanner.name}</option>
                      ))}
                    </select>
                  </div>
                  <a className="rec-btn rec-btn-outline" href={scanExportHref}>
                    <FontAwesomeIcon icon={faDownload} /> Export CSV
                  </a>
                </div>
                <div className="rec-table-wrap rec-responsive-table">
                  <table className="rec-table rec-analytics-scan-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Registrant</th>
                        <th>Event</th>
                        <th>Result</th>
                        <th>Scanner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!dataLoading && scanPage.documents.map((row) => (
                        <tr key={row.scanId}>
                          <td data-label="Time">{formatDateTime(row.scannedAt)}</td>
                          <td data-label="Registrant">
                            {row.registrationId ? (
                              <button
                                type="button"
                                className="rec-table-name-button"
                                onClick={() => openRegistrant(row.registrationId)}
                              >
                                {row.registrantName || "Registrant record"}
                              </button>
                            ) : (
                              <strong className="rec-row-title">Unavailable registration</strong>
                            )}
                            <small>{row.registrantEmail || "No email"}</small>
                          </td>
                          <td data-label="Event">
                            {row.eventName}
                            <small>{[row.eventDay ? `Day ${row.eventDay}` : "", row.venue].filter(Boolean).join(" / ")}</small>
                          </td>
                          <td data-label="Result">
                            <span className={`rec-status ${row.status === "accepted" ? "rec-status-published" : row.status === "rejected" ? "rec-analytics-status-rejected" : "rec-status-archived"}`}>
                              {humanize(row.status)}
                            </span>
                            {row.reason && <small>{humanize(row.reason)}</small>}
                          </td>
                          <td data-label="Scanner">
                            {row.scannerName}
                            {row.deviceLabel && row.deviceLabel !== row.scannerName && <small>{row.deviceLabel}</small>}
                          </td>
                        </tr>
                      ))}
                      {dataLoading && (
                        <tr><td colSpan="5"><div className="rec-spinner-wrap rec-analytics-table-loading"><div className="rec-spinner" /></div></td></tr>
                      )}
                      {!dataLoading && !scanPage.documents.length && (
                        <tr><td colSpan="5"><div className="rec-empty-state">No scan records match these filters.</div></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="rec-panel-body rec-analytics-pagination-body">
                  <Pagination pageData={scanPage} onPageChange={setScanPageNumber} />
                </div>
              </>
            )}
          </section>
        </>
      )}

      {selectedRegistrationId && (
        <div className="rec-modal-backdrop" role="presentation">
          <div
            className="rec-modal rec-modal-wide rec-analytics-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registrant-scan-detail-title"
          >
            <div className="rec-modal-header rec-modal-header-flex">
              <div>
                <h3 id="registrant-scan-detail-title" className="rec-modal-title rec-modal-title-dark">
                  {registrantDetail?.registration?.name || "Registrant Scan Details"}
                </h3>
                {registrantDetail?.registration?.registrationType && (
                  <p className="rec-muted mb-0">{humanize(registrantDetail.registration.registrationType)}</p>
                )}
              </div>
              <button type="button" className="rec-icon-button" onClick={closeRegistrant} aria-label="Close registrant details">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="rec-modal-body">
              {detailLoading && (
                <div className="rec-spinner-wrap rec-analytics-detail-loading">
                  <div className="rec-spinner" />
                  <p className="mt-3">Loading registrant details...</p>
                </div>
              )}
              {detailError && (
                <div className="rec-alert rec-alert-danger">
                  <FontAwesomeIcon icon={faTriangleExclamation} /> {detailError}
                </div>
              )}
              {registrantDetail && (() => {
                const registration = registrantDetail.registration || {}
                const attendance = registrantDetail.attendance || {}
                const detailSummary = registrantDetail.summary || {}
                return (
                  <>
                    <div className="rec-analytics-detail-summary">
                      <SummaryCard label="Accepted Scans" value={detailSummary.acceptedScans || 0} tone="success" />
                      <SummaryCard label="Rejected Scans" value={detailSummary.rejectedScans || 0} tone="danger" />
                      <SummaryCard label="Events Attended" value={attendance.lastScanEventName || attendance.eventCount || 0} detail={attendance.eventCount > 1 ? `${attendance.eventCount} events` : ""} />
                      <SummaryCard label="Last Scan" value={attendance.lastScanAt ? formatDateTime(attendance.lastScanAt) : "None"} detail={attendance.lastScanEventName || ""} tone="muted" />
                    </div>

                    <div className="rec-analytics-detail-grid">
                      <section className="rec-analytics-detail-section">
                        <h4>Contact</h4>
                        <DetailField label="Email" value={registration.email} href={registration.email ? `mailto:${registration.email}` : ""} />
                        <DetailField label="Other Email" value={registration.otherEmail} href={registration.otherEmail ? `mailto:${registration.otherEmail}` : ""} />
                        <DetailField label="Phone" value={registration.phone} href={registration.phone ? `tel:${registration.phone}` : ""} />
                        <DetailField label="Other Phone" value={registration.otherPhone} href={registration.otherPhone ? `tel:${registration.otherPhone}` : ""} />
                      </section>
                      <section className="rec-analytics-detail-section">
                        <h4>Organization</h4>
                        <DetailField label="Organization" value={registration.organization} />
                        <DetailField label="Sector" value={formatList(registration.sector)} />
                        <DetailField label="Sponsor" value={registration.sponsorOrganization} />
                        <DetailField label="Sponsor Sector" value={registration.sponsorSector} />
                      </section>
                      <section className="rec-analytics-detail-section">
                        <h4>Registration</h4>
                        <DetailField label="Type" value={humanize(registration.registrationType)} />
                        <DetailField label="Days" value={formatList(registration.daysAttending)} />
                        <DetailField label="Participant category" value={formatList(formatRecOptionalSessions(registration.additionalSessions, selectedConference?.year))} />
                        <DetailField label="Conference Years" value={formatList((registration.conferenceYears || []).map(formatRecEdition))} />
                        <DetailField label="Registered" value={formatDateTime(registration.registeredAt)} />
                      </section>
                      <section className="rec-analytics-detail-section">
                        <h4>Location and Visa</h4>
                        <DetailField label="Country" value={registration.country} />
                        <DetailField label="Region" value={registration.stateRegion} />
                        <DetailField label="City" value={registration.city} />
                        <DetailField label="Visa Letter" value={registration.visaLetterRequired ? (registration.visaLetterSent ? "Required and sent" : "Required, not sent") : "Not required"} />
                      </section>
                    </div>

                    {(registration.exhibitionDetails || registration.additionalComments) && (
                      <section className="rec-analytics-detail-section rec-analytics-detail-section-wide">
                        <h4>Additional Details</h4>
                        {registration.exhibitionDetails && <DetailField label="Exhibition" value={registration.exhibitionDetails} />}
                        {registration.additionalComments && <DetailField label="Comments" value={registration.additionalComments} />}
                      </section>
                    )}

                    <section className="rec-analytics-detail-section rec-analytics-detail-section-wide">
                      <div className="rec-analytics-detail-section-heading">
                        <h4>Scan History</h4>
                        <span>{registrantDetail.scanHistory?.length || 0} records</span>
                      </div>
                      {registrantDetail.scanHistory?.length ? (
                        <div className="rec-table-wrap rec-responsive-table">
                          <table className="rec-table rec-analytics-detail-history">
                            <thead>
                              <tr>
                                <th>Time</th>
                                <th>Event</th>
                                <th>Result</th>
                                <th>Scanner</th>
                              </tr>
                            </thead>
                            <tbody>
                              {registrantDetail.scanHistory.map((scan) => (
                                <tr key={scan.scanId}>
                                  <td data-label="Time">{formatDateTime(scan.scannedAt)}</td>
                                  <td data-label="Event">
                                    {scan.eventName}
                                    <small>{[scan.eventDay ? `Day ${scan.eventDay}` : "", scan.venue].filter(Boolean).join(" / ")}</small>
                                  </td>
                                  <td data-label="Result">
                                    <span className={`rec-status ${scan.status === "accepted" ? "rec-status-published" : scan.status === "rejected" ? "rec-analytics-status-rejected" : "rec-status-archived"}`}>
                                      {humanize(scan.status)}
                                    </span>
                                    {scan.reason && <small>{humanize(scan.reason)}</small>}
                                  </td>
                                  <td data-label="Scanner">
                                    {scan.scannerName}
                                    {scan.deviceLabel && scan.deviceLabel !== scan.scannerName && <small>{scan.deviceLabel}</small>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="rec-empty-state rec-empty-state-compact">No scan activity has been recorded for this registrant.</div>
                      )}
                    </section>
                  </>
                )
              })()}
            </div>
            <div className="rec-modal-footer">
              <button type="button" className="rec-btn rec-btn-outline" onClick={closeRegistrant}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
