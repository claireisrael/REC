"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faBookOpen,
  faCheckCircle,
  faExclamationTriangle,
  faExternalLinkAlt,
  faFileLines,
  faPenToSquare,
  faPlus,
  faSave,
  faSpinner,
  faStar,
  faTrash,
  faUserShield,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import "../../rec-dashboard.css"

const reportTypes = [
  { value: "all", label: "All report types" },
  { value: "conference_report", label: "Conference report" },
  { value: "proceedings", label: "Conference proceedings" },
  { value: "outcomes", label: "Outcomes document" },
  { value: "communique", label: "Conference communique" },
  { value: "other", label: "Other publication" },
]

const emptyForm = {
  reportType: "conference_report",
  title: "",
  summary: "",
  reportUrl: "",
  coverImageUrl: "",
  publicationDate: "",
  displayOrder: 0,
  isFeatured: false,
  isPublished: false,
}

function typeLabel(value) {
  return reportTypes.find((type) => type.value === value)?.label || "Conference report"
}

function toDateInput(value) {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

function formatDate(value, includeTime = false) {
  if (!value) return ""
  return new Date(value).toLocaleString("en-UG", {
    timeZone: "Africa/Kampala",
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  })
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "Request failed")
  return payload
}

function mapReportToForm(report) {
  return {
    reportType: report.reportType || "conference_report",
    title: report.title || "",
    summary: report.summary || "",
    reportUrl: report.reportUrl || "",
    coverImageUrl: report.coverImageUrl || "",
    publicationDate: toDateInput(report.publicationDate),
    displayOrder: Number(report.displayOrder || 0),
    isFeatured: report.isFeatured === true,
    isPublished: report.isPublished === true,
  }
}

function AccessMessage({ icon, title, children }) {
  return (
    <div className="rec-dashboard-container">
      <div className="rec-access-wrap">
        <div className="rec-alert text-center">
          <FontAwesomeIcon icon={icon} size="3x" className="mb-4" style={{ color: "#d99a00" }} />
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

export default function RecReportsAdminPage() {
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
  const [reports, setReports] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(12)
  const [pager, setPager] = useState({ total: 0, page: 1, limit: 12, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const selectedConference = useMemo(
    () => conferences.find((conference) => conference.$id === conferenceId) || null,
    [conferenceId, conferences]
  )

  const loadConferences = useCallback(async () => {
    const data = await fetchJson("/api/rec/reports/conferences")
    const documents = data.documents || []
    setConferences(documents)
    setConferenceId((current) => current || documents[0]?.$id || "")
  }, [])

  const loadReports = useCallback(async () => {
    if (!conferenceId) {
      setReports([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams({
        conferenceId,
        page: String(page),
        limit: String(limit),
      })
      if (typeFilter !== "all") params.set("type", typeFilter)
      const data = await fetchJson(`/api/rec/reports?${params.toString()}`)
      setReports(data.documents || [])
      setPager({
        total: data.total || 0,
        page: data.page || page,
        limit: data.limit || limit,
        totalPages: data.totalPages || 1,
      })
    } catch (err) {
      setError(err.message || "Failed to load conference reports.")
    } finally {
      setLoading(false)
    }
  }, [conferenceId, limit, page, typeFilter])

  useEffect(() => {
    if (!hasRecAccess && !isSenior) return
    queueMicrotask(() => {
      loadConferences().catch((err) => {
        setError(err.message || "Failed to load completed conferences.")
        setLoading(false)
      })
    })
  }, [hasRecAccess, isSenior, loadConferences])

  useEffect(() => {
    queueMicrotask(loadReports)
  }, [loadReports])

  const resetForm = () => {
    setEditingId("")
    setForm(emptyForm)
  }

  const updateForm = (patch) => setForm((previous) => ({ ...previous, ...patch }))

  const saveReport = async (event) => {
    event.preventDefault()
    if (!conferenceId) return
    setSaving("report")
    setError("")
    setSuccess("")
    try {
      await fetchJson(editingId ? `/api/rec/reports/${editingId}` : "/api/rec/reports", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, conferenceId }),
      })
      const wasEditing = Boolean(editingId)
      resetForm()
      setSuccess(wasEditing ? "Conference report updated." : "Conference report added.")
      await Promise.all([loadReports(), loadConferences()])
    } catch (err) {
      setError(err.message || "Failed to save conference report.")
    } finally {
      setSaving("")
    }
  }

  const editReport = (report) => {
    setEditingId(report.$id)
    setForm(mapReportToForm(report))
    setError("")
    setSuccess("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const deleteReport = async (report) => {
    if (!window.confirm(`Delete "${report.title}"? The external report file will not be deleted.`)) return
    setSaving(report.$id)
    setError("")
    setSuccess("")
    try {
      await fetchJson(`/api/rec/reports/${report.$id}`, { method: "DELETE" })
      if (editingId === report.$id) resetForm()
      if (reports.length === 1 && page > 1) setPage((current) => Math.max(1, current - 1))
      else await loadReports()
      await loadConferences()
      setSuccess("Conference report deleted.")
    } catch (err) {
      setError(err.message || "Failed to delete conference report.")
    } finally {
      setSaving("")
    }
  }

  if (!hasRecAccess && !isSenior) {
    return (
      <AccessMessage icon={faExclamationTriangle} title="Access Restricted">
        <p>You do not have permission to access REC conference reports.</p>
      </AccessMessage>
    )
  }

  if (!canManageRec && !isSenior) {
    return (
      <AccessMessage icon={faFileLines} title="Insufficient Access">
        <p>Conference report management requires manage access or senior manager access.</p>
      </AccessMessage>
    )
  }

  return (
    <div className="rec-dashboard-container">
      <div className="rec-page-bar mb-4">
        <div>
          <div className="rec-breadcrumb">
            <Link href="/dashboard/rec-conference">
              <FontAwesomeIcon icon={faArrowLeft} /> REC Conference
            </Link>
            <span className="rec-breadcrumb-separator">/</span>
            <span>Conference Reports</span>
          </div>
          <h2 className="rec-header-gradient mb-2">Previous Conference Reports</h2>
          <p className="rec-muted mb-0">
            Publish official report links for completed REC editions and choose the report promoted on the public program page.
          </p>
        </div>
        {permissionLevel && (
          <div className="rec-permission-badge">
            <FontAwesomeIcon icon={faUserShield} /> {permissionLevel} Access
          </div>
        )}
      </div>

      {(error || success) && (
        <div className={error ? "rec-alert rec-alert-danger mb-4" : "rec-alert rec-alert-success mb-4"}>
          <FontAwesomeIcon icon={error ? faExclamationTriangle : faCheckCircle} />
          {error || success}
        </div>
      )}

      <section className="rec-panel mb-4">
        <div className="rec-panel-header">
          <h3 className="rec-panel-title">
            <FontAwesomeIcon icon={faBookOpen} />
            Select Completed REC Edition
          </h3>
          <span className="rec-permission-badge">{conferences.length} completed</span>
        </div>
        <div className="rec-panel-body rec-grid rec-grid-two">
          <div className="rec-field">
            <label className="rec-label" htmlFor="report-conference">Conference</label>
            <select
              id="report-conference"
              className="rec-select"
              value={conferenceId}
              onChange={(event) => {
                setConferenceId(event.target.value)
                setPage(1)
                resetForm()
              }}
            >
              <option value="">Select completed conference</option>
              {conferences.map((conference) => (
                <option key={conference.$id} value={conference.$id}>
                  {conference.title || conference.shortName || `REC ${conference.year}`}
                </option>
              ))}
            </select>
          </div>
          <div className="rec-media-space-summary">
            <strong>{selectedConference?.shortName || selectedConference?.title || "No conference selected"}</strong>
            <span>
              {selectedConference
                ? `${selectedConference.reportCount || 0} configured report link${selectedConference.reportCount === 1 ? "" : "s"}`
                : "Reports are restricted to conferences whose end date has passed."}
            </span>
          </div>
        </div>
      </section>

      {!conferenceId ? (
        <div className="rec-alert">
          <h4 className="rec-alert-title">No completed conference available</h4>
          <p className="mb-0">A conference appears here after its configured end date has passed.</p>
        </div>
      ) : (
        <div className="rec-media-layout">
          <section className="rec-panel">
            <div className="rec-panel-header">
              <h3 className="rec-panel-title">
                <FontAwesomeIcon icon={editingId ? faPenToSquare : faPlus} />
                {editingId ? "Edit Report Link" : "Add Report Link"}
              </h3>
              {editingId && (
                <button type="button" className="rec-btn rec-btn-outline" onClick={resetForm}>
                  <FontAwesomeIcon icon={faXmark} /> Cancel
                </button>
              )}
            </div>
            <form className="rec-panel-body rec-grid" onSubmit={saveReport}>
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="report-type">Report type</label>
                  <select
                    id="report-type"
                    className="rec-select"
                    value={form.reportType}
                    onChange={(event) => updateForm({ reportType: event.target.value })}
                  >
                    {reportTypes.slice(1).map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div className="rec-field">
                  <label className="rec-label" htmlFor="report-order">Display order</label>
                  <input
                    id="report-order"
                    className="rec-input"
                    type="number"
                    min="0"
                    value={form.displayOrder}
                    onChange={(event) => updateForm({ displayOrder: Number(event.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="rec-field">
                <label className="rec-label" htmlFor="report-title">Public title</label>
                <input
                  id="report-title"
                  className="rec-input"
                  value={form.title}
                  maxLength={180}
                  onChange={(event) => updateForm({ title: event.target.value })}
                  placeholder="REC 2025 Conference Report"
                  required
                />
              </div>

              <div className="rec-field">
                <label className="rec-label" htmlFor="report-summary">Summary</label>
                <textarea
                  id="report-summary"
                  className="rec-textarea"
                  rows={4}
                  maxLength={1200}
                  value={form.summary}
                  onChange={(event) => updateForm({ summary: event.target.value })}
                  placeholder="Briefly describe the report and its main coverage."
                />
              </div>

              <div className="rec-field">
                <label className="rec-label" htmlFor="report-url">Report link</label>
                <input
                  id="report-url"
                  className="rec-input"
                  type="url"
                  value={form.reportUrl}
                  onChange={(event) => updateForm({ reportUrl: event.target.value })}
                  placeholder="https://nrep.ug/reports/rec-2025.pdf"
                  required
                />
                <small className="rec-field-help">Use the final HTTPS link to the PDF or report landing page.</small>
              </div>

              <div className="rec-field">
                <label className="rec-label" htmlFor="report-cover">Optional cover image URL</label>
                <input
                  id="report-cover"
                  className="rec-input"
                  type="url"
                  value={form.coverImageUrl}
                  onChange={(event) => updateForm({ coverImageUrl: event.target.value })}
                  placeholder="https://nrep.ug/images/rec-2025-report-cover.jpg"
                />
              </div>

              <div className="rec-field">
                <label className="rec-label" htmlFor="report-date">Publication date</label>
                <input
                  id="report-date"
                  className="rec-input"
                  type="date"
                  value={form.publicationDate}
                  onChange={(event) => updateForm({ publicationDate: event.target.value })}
                />
              </div>

              <div className="rec-media-toggle-row">
                <label>
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(event) => updateForm({ isFeatured: event.target.checked })}
                  />
                  Feature for this conference
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(event) => updateForm({ isPublished: event.target.checked })}
                  />
                  Published publicly
                </label>
              </div>
              <small className="rec-field-help">
                Featuring this report automatically removes the featured status from other reports in the same conference.
              </small>

              <button type="submit" className="rec-btn rec-btn-primary" disabled={saving === "report"}>
                {saving === "report" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
                {editingId ? "Update Report" : "Save Report"}
              </button>
            </form>
          </section>

          <section className="rec-panel">
            <div className="rec-panel-header">
              <h3 className="rec-panel-title">
                <FontAwesomeIcon icon={faFileLines} /> Report Links
              </h3>
              <div className="rec-page-actions">
                <label className="rec-inline-control">
                  <span>Type</span>
                  <select
                    className="rec-select"
                    value={typeFilter}
                    onChange={(event) => {
                      setTypeFilter(event.target.value)
                      setPage(1)
                    }}
                  >
                    {reportTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <label className="rec-inline-control">
                  <span>Rows</span>
                  <select
                    className="rec-select"
                    value={limit}
                    onChange={(event) => {
                      setLimit(Number(event.target.value))
                      setPage(1)
                    }}
                  >
                    {[6, 12, 24, 48].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="rec-panel-body">
              {loading ? (
                <div className="rec-empty-state-compact"><FontAwesomeIcon icon={faSpinner} spin /> Loading reports...</div>
              ) : reports.length === 0 ? (
                <div className="rec-empty-state-compact">No report links have been added for this conference.</div>
              ) : (
                <div className="rec-media-list">
                  {reports.map((report) => (
                    <article key={report.$id} className="rec-media-card rec-report-card">
                      <div className="rec-media-thumb rec-report-thumb">
                        {report.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={report.coverImageUrl} alt="" />
                        ) : (
                          <FontAwesomeIcon icon={faFileLines} />
                        )}
                      </div>
                      <div className="rec-media-card-body">
                        <div className="rec-media-card-title">
                          <span>{report.title}</span>
                          <span className={`rec-status ${report.isPublished ? "rec-status-published" : "rec-status-draft"}`}>
                            {report.isPublished ? "Published" : "Draft"}
                          </span>
                        </div>
                        <p>{report.summary || "No summary provided."}</p>
                        <div className="rec-chip-list">
                          <span className="rec-chip">{typeLabel(report.reportType)}</span>
                          {report.isFeatured && <span className="rec-chip"><FontAwesomeIcon icon={faStar} /> Featured</span>}
                          {report.publicationDate && <span className="rec-chip">Published {formatDate(report.publicationDate)}</span>}
                        </div>
                        {report.updatedAt && <small className="rec-muted">Updated {formatDate(report.updatedAt, true)}</small>}
                        <div className="rec-row-actions mt-3">
                          <a className="rec-btn rec-btn-outline" href={report.reportUrl} target="_blank" rel="noopener noreferrer">
                            <FontAwesomeIcon icon={faExternalLinkAlt} /> Open report
                          </a>
                          <button type="button" className="rec-btn rec-btn-outline" onClick={() => editReport(report)} disabled={saving === report.$id}>
                            <FontAwesomeIcon icon={faPenToSquare} /> Edit
                          </button>
                          <button type="button" className="rec-btn rec-btn-accent" onClick={() => deleteReport(report)} disabled={saving === report.$id}>
                            {saving === report.$id ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTrash} />}
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="rec-pagination-bar">
                <span className="rec-muted">
                  Showing page {pager.page || page} of {pager.totalPages || 1} · {pager.total || 0} reports
                </span>
                <div className="rec-page-actions">
                  <button type="button" className="rec-btn rec-btn-outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                    Previous
                  </button>
                  <button type="button" className="rec-btn rec-btn-outline" disabled={page >= (pager.totalPages || 1) || loading} onClick={() => setPage((current) => Math.min(pager.totalPages || 1, current + 1))}>
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
