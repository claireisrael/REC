"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faBuilding,
  faCheckCircle,
  faChevronLeft,
  faChevronRight,
  faDownload,
  faEnvelope,
  faEye,
  faFileCsv,
  faPlay,
  faRefresh,
  faRotate,
  faSpinner,
  faUpload,
  faUsers,
} from "@fortawesome/free-solid-svg-icons"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"

const TEMPLATE_TYPES = {
  STANDARD: "standard",
  SPONSORED: "sponsored",
}

const pageSize = 25

function parseApiError(payload, fallback) {
  const details = payload?.details || {}
  const detailMessages = [
    ...(Array.isArray(details.errors) ? details.errors : []),
    ...(Array.isArray(details.missing) && details.missing.length
      ? [`Missing columns: ${details.missing.join(", ")}`]
      : []),
    ...(Array.isArray(details.unexpected) && details.unexpected.length
      ? [`Unexpected columns: ${details.unexpected.join(", ")}`]
      : []),
  ]
  return [payload?.error || fallback, ...detailMessages].filter(Boolean).join(" ")
}

async function readJsonResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(parseApiError(payload, fallback))
  return payload
}

function formatDateTime(value) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function statusLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function statusClass(value) {
  if (["completed", "sent"].includes(value)) return "rec-status-published"
  if (["invalid", "failed", "completed_with_errors"].includes(value)) {
    return "rec-import-status-error"
  }
  if (["processing", "pending", "validated"].includes(value)) return "rec-status-archived"
  return "rec-status-draft"
}

function actionLabel(value) {
  const labels = {
    create: "Create attendee",
    register_existing: "Register returning attendee",
    update_existing: "Update current attendee",
    skip: "Already registered",
  }
  return labels[value] || statusLabel(value)
}

function triggerDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export default function RecRegistrationImportManager() {
  const appwriteServices = useAppwrite()
  const searchParams = useSearchParams()
  const requestedYear = Number(searchParams.get("year")) || null
  const fileInputRef = useRef(null)

  const [conferences, setConferences] = useState([])
  const [selectedConferenceId, setSelectedConferenceId] = useState("")
  const [templateType, setTemplateType] = useState(TEMPLATE_TYPES.STANDARD)
  const [sendEmails, setSendEmails] = useState(false)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [currentImport, setCurrentImport] = useState(null)
  const [history, setHistory] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [rowPage, setRowPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const selectedConference = useMemo(
    () => conferences.find((conference) => conference.$id === selectedConferenceId) || null,
    [conferences, selectedConferenceId]
  )
  const configuredDays = useMemo(
    () => Array.isArray(selectedConference?.days) ? selectedConference.days : [],
    [selectedConference]
  )
  const importRecord = currentImport?.import || null
  const importRows = currentImport?.rows?.documents || []
  const importRowsTotalPages = currentImport?.rows?.totalPages || 1
  const importIssueCount = Number(importRecord?.invalidCount || 0) +
    Number(importRecord?.failedCount || 0) +
    Number(importRecord?.emailsFailed || 0)
  const processedCount = Number(importRecord?.createdCount || 0) +
    Number(importRecord?.returningCount || 0) +
    Number(importRecord?.updatedCount || 0) +
    Number(importRecord?.skippedCount || 0) +
    Number(importRecord?.failedCount || 0)
  const processableCount = Math.max(
    0,
    Number(importRecord?.rowCount || 0) - Number(importRecord?.invalidCount || 0)
  )
  const progressPercent = processableCount
    ? Math.min(100, Math.round((processedCount / processableCount) * 100))
    : 0

  const loadHistory = useCallback(async (conferenceId) => {
    if (!conferenceId) return
    setHistoryLoading(true)
    try {
      const response = await fetch(
        `/api/rec/registrations/imports?conferenceId=${encodeURIComponent(conferenceId)}&page=1&limit=10`,
        { cache: "no-store" }
      )
      const payload = await readJsonResponse(response, "Could not load import history.")
      setHistory(payload.documents || [])
      setHistoryTotal(payload.total || 0)
    } catch (historyError) {
      console.error("REC import history error:", historyError)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!appwriteServices) return
    let active = true

    const initialize = async () => {
      setLoading(true)
      setError("")
      try {
        const response = await getAllRecConferences(appwriteServices)
        if (!active) return
        const rows = (response.documents || []).sort(
          (first, second) => Number(second.year || 0) - Number(first.year || 0)
        )
        const requested = rows.find(
          (conference) => Number(conference.year) === requestedYear
        )
        const selected = requested || rows.find((conference) => conference.isActive) || rows[0]
        setConferences(rows)
        setSelectedConferenceId(selected?.$id || "")
      } catch (initializeError) {
        console.error("REC import initialization error:", initializeError)
        if (active) setError("Could not load configured conferences.")
      } finally {
        if (active) setLoading(false)
      }
    }

    initialize()
    return () => {
      active = false
    }
  }, [appwriteServices, requestedYear])

  useEffect(() => {
    if (!selectedConferenceId) return
    const timer = window.setTimeout(() => {
      loadHistory(selectedConferenceId)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadHistory, selectedConferenceId])

  const loadImport = async (importId, page = 1) => {
    setError("")
    const response = await fetch(
      `/api/rec/registrations/imports/${encodeURIComponent(importId)}?page=${page}&limit=${pageSize}`,
      { cache: "no-store" }
    )
    const payload = await readJsonResponse(response, "Could not load the selected import.")
    setCurrentImport(payload)
    setRowPage(page)
    return payload
  }

  const downloadTemplate = async () => {
    if (!selectedConference) return
    setDownloading(true)
    setError("")
    try {
      const response = await fetch(
        `/api/rec/registrations/imports/template?type=${encodeURIComponent(templateType)}&year=${selectedConference.year}&conferenceId=${encodeURIComponent(selectedConference.$id)}`,
        { cache: "no-store" }
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(parseApiError(payload, "Could not download the CSV template."))
      }
      const disposition = response.headers.get("Content-Disposition") || ""
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ||
        `rec-${selectedConference.year}-${templateType}-attendees-template.csv`
      triggerDownload(await response.blob(), fileName)
    } catch (downloadError) {
      setError(downloadError.message)
    } finally {
      setDownloading(false)
    }
  }

  const validateFile = async (event) => {
    event.preventDefault()
    if (!selectedConferenceId || !selectedFile) {
      setError("Select a conference and CSV file before validation.")
      return
    }

    setValidating(true)
    setError("")
    setSuccess("")
    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("conferenceId", selectedConferenceId)
      formData.append("templateType", templateType)
      formData.append("sendEmails", String(sendEmails))
      formData.append("updateExisting", String(updateExisting))
      const response = await fetch("/api/rec/registrations/imports", {
        method: "POST",
        body: formData,
      })
      const payload = await readJsonResponse(response, "Could not validate the CSV file.")
      setCurrentImport(payload)
      setRowPage(1)
      setSuccess(
        payload.import.invalidCount
          ? "Validation finished. Correct the highlighted rows before importing."
          : "Validation finished. The attendee rows are ready for review."
      )
      await loadHistory(selectedConferenceId)
    } catch (validationError) {
      setError(validationError.message)
    } finally {
      setValidating(false)
    }
  }

  const processImport = async ({ retryFailed = false } = {}) => {
    if (!importRecord?.$id) return
    setProcessing(true)
    setError("")
    setSuccess("")

    try {
      let hasMore = true
      let firstRequest = true
      let latest = currentImport

      for (let requestNumber = 0; hasMore && requestNumber < 250; requestNumber += 1) {
        const response = await fetch(
          `/api/rec/registrations/imports/${encodeURIComponent(importRecord.$id)}/commit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              retryFailed: retryFailed && firstRequest,
            }),
          }
        )
        latest = await readJsonResponse(response, "Could not process the attendee import.")
        setCurrentImport(latest)
        setRowPage(1)
        hasMore = latest.hasMore === true
        firstRequest = false
      }

      if (hasMore) {
        throw new Error("The import paused before all batches completed. Use Continue Import.")
      }
      await loadImport(importRecord.$id, 1)
      await loadHistory(selectedConferenceId)
      setSuccess(
        latest?.import?.status === "completed"
          ? "The attendee import completed successfully."
          : "The import completed with issues. Review or download the issue report."
      )
    } catch (processError) {
      setError(processError.message)
      await loadImport(importRecord.$id, 1).catch(() => null)
    } finally {
      setProcessing(false)
    }
  }

  const retryEmails = async () => {
    if (!importRecord?.$id) return
    setProcessing(true)
    setError("")
    setSuccess("")
    try {
      let hasMore = true
      let latest = currentImport
      for (let requestNumber = 0; hasMore && requestNumber < 250; requestNumber += 1) {
        const response = await fetch(
          `/api/rec/registrations/imports/${encodeURIComponent(importRecord.$id)}/emails/retry`,
          { method: "POST" }
        )
        latest = await readJsonResponse(response, "Could not retry the failed emails.")
        setCurrentImport(latest)
        hasMore = latest.hasMore === true
      }
      await loadImport(importRecord.$id, 1)
      await loadHistory(selectedConferenceId)
      setSuccess(
        latest?.import?.emailsFailed
          ? "Some emails still could not be sent."
          : "The failed registration emails were sent successfully."
      )
    } catch (retryError) {
      setError(retryError.message)
    } finally {
      setProcessing(false)
    }
  }

  const downloadIssues = async () => {
    if (!importRecord?.$id) return
    setDownloading(true)
    setError("")
    try {
      const response = await fetch(
        `/api/rec/registrations/imports/${encodeURIComponent(importRecord.$id)}/errors`,
        { cache: "no-store" }
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(parseApiError(payload, "Could not download the issue report."))
      }
      const disposition = response.headers.get("Content-Disposition") || ""
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ||
        `rec-registration-import-${importRecord.$id}-issues.csv`
      triggerDownload(await response.blob(), fileName)
    } catch (downloadError) {
      setError(downloadError.message)
    } finally {
      setDownloading(false)
    }
  }

  const resetImport = () => {
    setCurrentImport(null)
    setSelectedFile(null)
    setRowPage(1)
    setError("")
    setSuccess("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleConferenceChange = (conferenceId) => {
    setSelectedConferenceId(conferenceId)
    resetImport()
  }

  if (loading) {
    return (
      <div className="rec-spinner-wrap">
        <div className="rec-spinner" />
        <p className="mt-3">Loading registration import setup...</p>
      </div>
    )
  }

  return (
    <>
      {error && <div className="rec-alert rec-alert-danger mb-3">{error}</div>}
      {success && <div className="rec-alert rec-alert-success mb-3">{success}</div>}

      {!currentImport && (
        <form onSubmit={validateFile}>
          <section className="rec-panel mb-4">
            <div className="rec-panel-header">
              <div>
                <h3 className="rec-panel-title">
                  <FontAwesomeIcon icon={faUsers} />
                  Import setup
                </h3>
                <p className="rec-muted mb-0 mt-1">
                  Choose the conference and the source of attendee sponsorship.
                </p>
              </div>
            </div>
            <div className="rec-panel-body">
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="rec-import-conference">Conference</label>
                  <select
                    id="rec-import-conference"
                    className="rec-select"
                    value={selectedConferenceId}
                    onChange={(event) => handleConferenceChange(event.target.value)}
                    disabled={validating}
                  >
                    {conferences.map((conference) => (
                      <option key={conference.$id} value={conference.$id}>
                        {formatRecEdition(conference.year)} - {conference.title}
                        {conference.isActive ? " (Active)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rec-field">
                  <span className="rec-label">Accepted attendance days</span>
                  <div className="rec-chip-list rec-import-day-list">
                    {configuredDays.length ? configuredDays.map((day) => (
                      <span className="rec-chip" key={`${day.label}-${day.date}`}>
                        {day.label}{day.date ? ` (${day.date})` : ""}
                      </span>
                    )) : (
                      <span className="rec-help-text">No conference days are configured.</span>
                    )}
                  </div>
                </div>
              </div>

              {selectedConference && (
                !selectedConference.registrationOpen || selectedConference.couponRequired
              ) && (
                <div className="rec-alert rec-alert-warning mt-3">
                  <strong>Admin override applies.</strong>{" "}
                  These registrations can be created even though public registration is
                  {selectedConference.registrationOpen ? " coupon-only" : " closed"}.
                </div>
              )}

              <div className="rec-import-section">
                <span className="rec-label">Template</span>
                <div className="rec-import-template-options" role="radiogroup" aria-label="Import template">
                  <label className={`rec-import-template-option ${templateType === TEMPLATE_TYPES.STANDARD ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="templateType"
                      value={TEMPLATE_TYPES.STANDARD}
                      checked={templateType === TEMPLATE_TYPES.STANDARD}
                      onChange={() => setTemplateType(TEMPLATE_TYPES.STANDARD)}
                      disabled={validating}
                    />
                    <FontAwesomeIcon icon={faUsers} />
                    <span>
                      <strong>Standard attendees</strong>
                      <small>No coupon sponsorship is applied.</small>
                    </span>
                  </label>
                  <label className={`rec-import-template-option ${templateType === TEMPLATE_TYPES.SPONSORED ? "is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="templateType"
                      value={TEMPLATE_TYPES.SPONSORED}
                      checked={templateType === TEMPLATE_TYPES.SPONSORED}
                      onChange={() => setTemplateType(TEMPLATE_TYPES.SPONSORED)}
                      disabled={validating}
                    />
                    <FontAwesomeIcon icon={faBuilding} />
                    <span>
                      <strong>Coupon-sponsored attendees</strong>
                      <small>Every row must provide a valid attendee coupon.</small>
                    </span>
                  </label>
                </div>
              </div>

              <div className="rec-import-section rec-import-options">
                <label className="rec-checkbox-option">
                  <input
                    type="checkbox"
                    checked={sendEmails}
                    onChange={(event) => setSendEmails(event.target.checked)}
                    disabled={validating}
                  />
                  <FontAwesomeIcon icon={faEnvelope} />
                  <span>
                    <strong>Send registration emails after creation</strong>
                    <small>
                      Optional and currently {sendEmails ? "enabled" : "disabled"}.
                      Email failures will not undo registrations.
                    </small>
                  </span>
                </label>
                <label className="rec-checkbox-option">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(event) => setUpdateExisting(event.target.checked)}
                    disabled={validating}
                  />
                  <FontAwesomeIcon icon={faRefresh} />
                  <span>
                    <strong>Update attendees already registered for this conference</strong>
                    <small>Otherwise existing conference registrations are safely skipped.</small>
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section className="rec-panel mb-4">
            <div className="rec-panel-header">
              <h3 className="rec-panel-title">
                <FontAwesomeIcon icon={faFileCsv} />
                Template and upload
              </h3>
              <button
                type="button"
                className="rec-btn rec-btn-outline"
                onClick={downloadTemplate}
                disabled={!selectedConference || downloading || validating}
              >
                <FontAwesomeIcon icon={downloading ? faSpinner : faDownload} spin={downloading} />
                Download {templateType === TEMPLATE_TYPES.SPONSORED ? "Sponsored" : "Standard"} Template
              </button>
            </div>
            <div className="rec-panel-body">
              <div className="rec-import-guidance">
                <strong>CSV format</strong>
                <span>
                  The template includes four sample rows. Replace or remove every sample
                  before validation. Use exact conference day labels separated with{" "}
                  <code>|</code>, such as Day 1|Day 2, and do not rename columns.
                </span>
              </div>
              <label className={`rec-import-dropzone ${selectedFile ? "has-file" : ""}`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  disabled={validating}
                />
                <FontAwesomeIcon icon={selectedFile ? faCheckCircle : faUpload} />
                <span>
                  <strong>{selectedFile ? selectedFile.name : "Choose the completed CSV file"}</strong>
                  <small>
                    {selectedFile
                      ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB selected`
                      : "CSV only, maximum 2 MB and 500 attendee rows"}
                  </small>
                </span>
              </label>
              <div className="rec-import-actions">
                <button
                  type="submit"
                  className="rec-btn rec-btn-primary"
                  disabled={!selectedFile || !selectedConference || validating}
                >
                  <FontAwesomeIcon icon={validating ? faSpinner : faEye} spin={validating} />
                  {validating ? "Validating CSV..." : "Validate and Preview"}
                </button>
              </div>
            </div>
          </section>
        </form>
      )}

      {currentImport && (
        <>
          <section className="rec-panel mb-4">
            <div className="rec-panel-header">
              <div>
                <h3 className="rec-panel-title">
                  <FontAwesomeIcon icon={faFileCsv} />
                  {importRecord.fileName}
                </h3>
                <p className="rec-muted mb-0 mt-1">
                  {formatRecEdition(importRecord.conferenceYear)} · {statusLabel(importRecord.templateType)} template ·
                  {" "}emails {importRecord.sendEmails ? "enabled" : "disabled"}
                </p>
              </div>
              <span className={`rec-status ${statusClass(importRecord.status)}`}>
                {statusLabel(importRecord.status)}
              </span>
            </div>
            <div className="rec-panel-body">
              <div className="rec-stats-grid rec-import-stats">
                <div className="rec-stat-tile">
                  <span className="rec-stat-number">{importRecord.rowCount || 0}</span>
                  <span className="rec-stat-label">CSV rows</span>
                </div>
                <div className="rec-stat-tile">
                  <span className="rec-stat-number">{importRecord.createdCount || 0}</span>
                  <span className="rec-stat-label">Created</span>
                </div>
                <div className="rec-stat-tile">
                  <span className="rec-stat-number">{importRecord.returningCount || 0}</span>
                  <span className="rec-stat-label">Returning</span>
                </div>
                <div className="rec-stat-tile">
                  <span className="rec-stat-number">{importRecord.updatedCount || 0}</span>
                  <span className="rec-stat-label">Updated</span>
                </div>
                <div className="rec-stat-tile">
                  <span className="rec-stat-number">{importRecord.skippedCount || 0}</span>
                  <span className="rec-stat-label">Skipped</span>
                </div>
                <div className="rec-stat-tile">
                  <span className="rec-stat-number rec-stat-error">{importIssueCount}</span>
                  <span className="rec-stat-label">Issues</span>
                </div>
              </div>

              {importRecord.status === "processing" && (
                <div className="rec-import-progress-wrap">
                  <div className="rec-import-progress-label">
                    <strong>Registration progress</strong>
                    <span>{processedCount} of {processableCount}</span>
                  </div>
                  <div className="rec-progress">
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}

              {importRecord.invalidCount > 0 && (
                <div className="rec-alert rec-alert-danger mt-3">
                  <strong>{importRecord.invalidCount} invalid row(s).</strong>{" "}
                  No registrations will be created from this file. Download the issue report,
                  correct the CSV, and upload it again.
                </div>
              )}
              {importRecord.errorMessage && (
                <div className="rec-alert rec-alert-warning mt-3">
                  {importRecord.errorMessage}
                </div>
              )}
              {!importRecord.sendEmails && (
                <div className="rec-import-email-state mt-3">
                  <FontAwesomeIcon icon={faEnvelope} />
                  Email delivery was not selected. No attendee emails will be sent by this import.
                </div>
              )}

              <div className="rec-import-actions rec-import-actions-between">
                <button type="button" className="rec-btn rec-btn-outline" onClick={resetImport} disabled={processing}>
                  <FontAwesomeIcon icon={faRotate} />
                  Start New Upload
                </button>
                <div className="rec-page-actions">
                  {importIssueCount > 0 && (
                    <button type="button" className="rec-btn rec-btn-outline" onClick={downloadIssues} disabled={downloading || processing}>
                      <FontAwesomeIcon icon={downloading ? faSpinner : faDownload} spin={downloading} />
                      Download Issues
                    </button>
                  )}
                  {importRecord.failedCount > 0 && (
                    <button type="button" className="rec-btn rec-btn-outline" onClick={() => processImport({ retryFailed: true })} disabled={processing}>
                      <FontAwesomeIcon icon={faRefresh} />
                      Retry Failed Rows
                    </button>
                  )}
                  {importRecord.emailsFailed > 0 && importRecord.sendEmails && (
                    <button type="button" className="rec-btn rec-btn-outline" onClick={retryEmails} disabled={processing}>
                      <FontAwesomeIcon icon={faEnvelope} />
                      Retry Failed Emails
                    </button>
                  )}
                  {["completed", "completed_with_errors"].includes(importRecord.status) ? (
                    <Link
                      className="rec-btn rec-btn-primary"
                      href={`/dashboard/rec-conference/admin/registrations?year=${importRecord.conferenceYear}`}
                    >
                      <FontAwesomeIcon icon={faUsers} />
                      View Registrations
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="rec-btn rec-btn-primary"
                      onClick={() => processImport()}
                      disabled={processing || importRecord.invalidCount > 0}
                    >
                      <FontAwesomeIcon icon={processing ? faSpinner : faPlay} spin={processing} />
                      {processing
                        ? "Processing Import..."
                        : importRecord.status === "processing"
                          ? "Continue Import"
                          : "Create Registrations"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {importRecord.couponSummary?.length > 0 && (
            <section className="rec-panel mb-4">
              <div className="rec-panel-header">
                <h3 className="rec-panel-title">
                  <FontAwesomeIcon icon={faBuilding} />
                  Coupon capacity review
                </h3>
              </div>
              <div className="rec-panel-body">
                <div className="rec-table-wrap rec-responsive-table">
                  <table className="rec-table rec-import-coupon-table">
                    <thead>
                      <tr>
                        <th>Coupon</th>
                        <th>Sponsoring organization</th>
                        <th>Seats required</th>
                        <th>Seats available</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRecord.couponSummary.map((coupon) => (
                        <tr key={coupon.couponCode}>
                          <td data-label="Coupon"><strong>{coupon.couponCode}</strong></td>
                          <td data-label="Sponsor">
                            {coupon.sponsorOrganization || "-"}
                            {coupon.sponsorSector && <div className="rec-row-desc">{coupon.sponsorSector}</div>}
                          </td>
                          <td data-label="Required">{coupon.requiredSeats}</td>
                          <td data-label="Available">{coupon.availableSeats}</td>
                          <td data-label="Status">
                            <span className={`rec-status ${coupon.valid ? "rec-status-published" : "rec-import-status-error"}`}>
                              {coupon.valid ? "Ready" : "Insufficient"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          <section className="rec-panel mb-4">
            <div className="rec-panel-header">
              <div>
                <h3 className="rec-panel-title">Attendee row review</h3>
                <p className="rec-muted mb-0 mt-1">
                  Review the server validation result before creating registrations.
                </p>
              </div>
            </div>
            <div className="rec-table-wrap rec-responsive-table">
              <table className="rec-table rec-import-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Attendee</th>
                    <th>Organization</th>
                    <th>Days</th>
                    <th>Coupon</th>
                    <th>Action</th>
                    <th>Status / issue</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row) => (
                    <tr key={row.$id}>
                      <td data-label="Row">{row.rowNumber}</td>
                      <td data-label="Attendee">
                        <div className="rec-row-title">{row.attendeeName || "Incomplete attendee"}</div>
                        <div className="rec-row-desc">{row.email || row.payload?.email || "-"}</div>
                      </td>
                      <td data-label="Organization">{row.payload?.organization || "-"}</td>
                      <td data-label="Days">
                        {Array.isArray(row.payload?.daysAttending)
                          ? row.payload.daysAttending.join(", ")
                          : "-"}
                      </td>
                      <td data-label="Coupon">{row.couponCode || "-"}</td>
                      <td data-label="Action">{actionLabel(row.action)}</td>
                      <td data-label="Status">
                        <span className={`rec-status ${statusClass(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                        {row.errorMessage && <div className="rec-import-row-error">{row.errorMessage}</div>}
                        {row.emailStatus === "failed" && (
                          <div className="rec-import-row-error">Email: {row.emailError || "Failed to send"}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {currentImport.rows.total > 0 && (
              <div className="rec-panel-body rec-import-pagination">
                <span className="rec-muted">
                  Page {rowPage} of {importRowsTotalPages} · {currentImport.rows.total} rows
                </span>
                <div className="rec-page-actions">
                  <button
                    type="button"
                    className="rec-icon-button"
                    onClick={() => loadImport(importRecord.$id, rowPage - 1)}
                    disabled={rowPage <= 1 || processing}
                    aria-label="Previous row page"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </button>
                  <button
                    type="button"
                    className="rec-icon-button"
                    onClick={() => loadImport(importRecord.$id, rowPage + 1)}
                    disabled={rowPage >= importRowsTotalPages || processing}
                    aria-label="Next row page"
                  >
                    <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <section className="rec-panel">
        <div className="rec-panel-header">
          <div>
            <h3 className="rec-panel-title">Recent imports</h3>
            <p className="rec-muted mb-0 mt-1">
              {historyTotal} import job{historyTotal === 1 ? "" : "s"} for the selected conference.
            </p>
          </div>
          <button
            type="button"
            className="rec-icon-button"
            onClick={() => loadHistory(selectedConferenceId)}
            disabled={historyLoading}
            aria-label="Refresh import history"
          >
            <FontAwesomeIcon icon={historyLoading ? faSpinner : faRefresh} spin={historyLoading} />
          </button>
        </div>
        {history.length ? (
          <div className="rec-table-wrap rec-responsive-table">
            <table className="rec-table rec-import-history-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Created</th>
                  <th>Rows</th>
                  <th>Emails</th>
                  <th>Status</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.$id}>
                    <td data-label="File">
                      <div className="rec-row-title">{item.fileName}</div>
                      <div className="rec-row-desc">{item.createdByName || "REC administrator"}</div>
                    </td>
                    <td data-label="Created">{formatDateTime(item.createdAt || item.$createdAt)}</td>
                    <td data-label="Rows">{item.rowCount || 0}</td>
                    <td data-label="Emails">{item.sendEmails ? "Enabled" : "Disabled"}</td>
                    <td data-label="Status">
                      <span className={`rec-status ${statusClass(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td data-label="View">
                      <button
                        type="button"
                        className="rec-icon-button"
                        onClick={() => loadImport(item.$id, 1)}
                        aria-label={`View import ${item.fileName}`}
                      >
                        <FontAwesomeIcon icon={faEye} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rec-empty-state rec-empty-state-compact">
            <FontAwesomeIcon icon={faFileCsv} />
            <div className="rec-empty-title">
              {historyLoading ? "Loading import history..." : "No imports for this conference"}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
