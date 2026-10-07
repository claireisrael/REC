"use client"

import { useEffect, useRef, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faDownload,
  faEye,
  faFileImage,
  faFilePdf,
  faPlay,
  faPlus,
  faRefresh,
  faSpinner,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { BADGE_PRINT_DEFAULTS, BADGE_PRINT_FIELDS } from "@/lib/rec-conference/badge-print-options.mjs"

const base = "/api/rec/scanning/badges/exports"

async function api(path = "", body) {
  const response = await fetch(`${base}${path}`, {
    cache: "no-store",
    ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Export request failed.")
  return data
}

async function downloadBadgeFile(url, fallback) {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || "Download failed. Please retry.")
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || fallback
  a.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

const stamp = (value) => value
  ? new Date(value).toLocaleString("en-UG", { timeZone: "Africa/Kampala", dateStyle: "medium", timeStyle: "short" })
  : ""

export default function RecBadgeExports({ conferenceId, days = [], selectedIds = [], initialSearch = "" }) {
  const [jobs, setJobs] = useState(null)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [job, setJob] = useState(null)
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState("")
  const [scope, setScope] = useState(selectedIds.length ? "selected" : "filtered")
  const [format, setFormat] = useState("pdf")
  const [bleed, setBleed] = useState(false)
  const [printDetails, setPrintDetails] = useState({ ...BADGE_PRINT_DEFAULTS })
  const [search, setSearch] = useState(initialSearch)
  const [registrationType, setRegistrationType] = useState("")
  const [day, setDay] = useState("")
  const mounted = useRef(false)
  const requestId = useRef("")

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (!conferenceId) return undefined
    let current = true
    api(`?${new URLSearchParams({ conferenceId, page })}`)
      .then((data) => { if (current) setJobs(data) })
      .catch((e) => { if (current) setError(e.message) })
    return () => { current = false }
  }, [conferenceId, page, revision])

  const run = async (value) => {
    setBusy(true)
    setError("")
    setJob(value)
    try {
      let current = value
      while (mounted.current && ["preparing", "processing"].includes(current.status)) {
        current = await api(`/${current.$id}`, {})
        if (mounted.current) setJob(current)
      }
      if (mounted.current) setRevision((n) => n + 1)
    } catch (e) {
      if (mounted.current) setError(e.message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const create = async () => {
    setBusy(true)
    setError("")
    try {
      const created = await api("", {
        conferenceId,
        scope,
        registrationIds: selectedIds,
        format,
        bleed,
        ...printDetails,
        registrationType,
        day,
        search,
        requestId: requestId.current,
      })
      setModal(false)
      await run(created)
    } catch (e) {
      setError(e.message)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const download = async (packaging) => {
    setDownloading(true)
    setError("")
    try {
      if (packaging === "zip") {
        const check = await api(`/${job.$id}`)
        if (check.status !== "completed") throw new Error("This export is not available. Create a new export.")
        const a = document.createElement("a")
        a.href = `${base}/${job.$id}/download?packaging=zip`
        a.download = `REC-badges-${job.$id}.zip`
        a.click()
      } else {
        await downloadBadgeFile(`${base}/${job.$id}/download?packaging=${packaging}`, `REC-badges.${packaging === "report" ? "csv" : "pdf"}`)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setDownloading(false)
    }
  }

  const load = async (id, p = 1) => {
    setError("")
    try {
      setJob(await api(`/${id}?page=${p}`))
    } catch (e) {
      setError(e.message)
    }
  }

  const previewSrc = `${base}/preview?${new URLSearchParams({ conferenceId, format: "png", bleed: String(bleed), ...Object.fromEntries(Object.entries(printDetails).map(([k, v]) => [k, String(v)])) })}`

  return (
    <section aria-label="Badge print exports">
      <div className="rec-pagination-bar mb-3">
        <h4 className="rec-panel-title mb-0">Print exports</h4>
        <div className="rec-page-actions">
          <button type="button" className="rec-btn rec-btn-outline" title="Refresh exports" aria-label="Refresh exports" disabled={busy} onClick={() => setRevision((n) => n + 1)}>
            <FontAwesomeIcon icon={faRefresh} />
          </button>
          <button
            type="button"
            className="rec-btn rec-btn-primary"
            disabled={busy || !conferenceId}
            onClick={() => {
              requestId.current = crypto.randomUUID()
              setError("")
              setModal(true)
            }}
          >
            <FontAwesomeIcon icon={faPlus} />
            New export
          </button>
        </div>
      </div>

      {error && !modal && <div className="rec-alert rec-alert-danger mb-3">{error}</div>}

      {job && (
        <section className="rec-panel mb-3" aria-live="polite">
          <div className="rec-panel-body">
            <div className="rec-pagination-bar">
              <h4 className="rec-panel-title mb-0">
                {job.status === "completed" ? "Export ready" : job.status === "expired" ? "Export expired" : "Preparing badges"}
              </h4>
              <span className="rec-chip">{job.status}</span>
            </div>
            <progress max={Math.max(1, job.total)} value={job.status === "preparing" ? 0 : job.processed} style={{ width: "100%" }} />
            <p className="rec-muted">
              {job.processed || 0} / {job.total} processed · {job.exported || 0} exported · {job.skipped || 0} skipped · {job.failed || 0} failed
            </p>
            <div className="rec-page-actions mb-3">
              {["preparing", "processing"].includes(job.status) && (
                <button type="button" className="rec-btn rec-btn-primary" disabled={busy} onClick={() => run(job)}>
                  <FontAwesomeIcon icon={busy ? faSpinner : faPlay} spin={busy} />
                  {busy ? "Processing..." : "Continue export"}
                </button>
              )}
              {job.status === "completed" && (
                <>
                  <button type="button" className="rec-btn rec-btn-primary" disabled={downloading} onClick={() => download("zip")}>
                    <FontAwesomeIcon icon={faDownload} />
                    Download ZIP
                  </button>
                  {job.options?.format === "pdf" && job.exported > 0 && job.exported <= 100 && (
                    <button type="button" className="rec-btn rec-btn-outline" disabled={downloading} onClick={() => download("pdf")}>
                      <FontAwesomeIcon icon={faFilePdf} />
                      Combined PDF
                    </button>
                  )}
                  <button type="button" className="rec-btn rec-btn-outline" disabled={downloading} onClick={() => download("report")}>
                    <FontAwesomeIcon icon={faDownload} />
                    Report
                  </button>
                </>
              )}
            </div>
            <div className="rec-table-wrap rec-responsive-table">
              <table className="rec-table">
                <thead>
                  <tr><th>Name</th><th>Badge</th><th>Result</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {(job.results?.documents || []).map((item) => (
                    <tr key={item.$id}>
                      <td data-label="Name">{item.name}</td>
                      <td data-label="Badge">{item.badgeNumber || "Not issued"}</td>
                      <td data-label="Result">{item.status}</td>
                      <td data-label="Details">{item.message || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rec-pagination-bar">
              <span className="rec-muted">Page {job.results?.page || 1} of {job.results?.totalPages || 1}</span>
              <div className="rec-page-actions">
                <button type="button" className="rec-btn rec-btn-outline" disabled={busy || (job.results?.page || 1) <= 1} onClick={() => load(job.$id, job.results.page - 1)}>Previous</button>
                <button type="button" className="rec-btn rec-btn-outline" disabled={busy || (job.results?.page || 1) >= (job.results?.totalPages || 1)} onClick={() => load(job.$id, job.results.page + 1)}>Next</button>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="rec-table-wrap rec-responsive-table">
        <table className="rec-table">
          <thead>
            <tr><th>Created</th><th>Format</th><th>Bleed</th><th>Progress</th><th>Status</th><th>Open</th></tr>
          </thead>
          <tbody>
            {(jobs?.documents || []).map((j) => (
              <tr key={j.$id}>
                <td data-label="Created">{stamp(j.createdAt)}</td>
                <td data-label="Format">{String(j.options?.format || "").toUpperCase()}</td>
                <td data-label="Bleed">{j.options?.bleed ? "3 mm" : "None"}</td>
                <td data-label="Progress">{j.processed}/{j.total}</td>
                <td data-label="Status">{j.status}</td>
                <td data-label="Open">
                  <button type="button" className="rec-btn rec-btn-outline rec-btn-sm" title="Open export" aria-label="Open export" disabled={busy} onClick={() => load(j.$id)}>
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                </td>
              </tr>
            ))}
            {!jobs?.documents?.length && (
              <tr><td colSpan={6} className="rec-muted">{jobs ? "No print exports yet." : "Loading exports..."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="rec-pagination-bar">
        <span className="rec-muted">Page {page} of {jobs?.totalPages || 1}</span>
        <div className="rec-page-actions">
          <button type="button" className="rec-btn rec-btn-outline" disabled={busy || page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" className="rec-btn rec-btn-outline" disabled={busy || !jobs || page >= (jobs.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {modal && (
        <div className="rec-modal-backdrop" role="presentation">
          <div className="rec-modal rec-modal-wide" role="dialog" aria-modal="true" aria-labelledby="rec-badge-export-title">
            <div className="rec-modal-header rec-modal-header-flex">
              <h3 id="rec-badge-export-title" className="rec-modal-title rec-modal-title-dark">Export active badges</h3>
              <button type="button" className="rec-icon-button" aria-label="Close export options" disabled={busy} onClick={() => setModal(false)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <div className="rec-modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: 20 }}>
                <div>
                  <p>Finished size: <strong>9.3 × 12.5 cm</strong>. Portrait.</p>
                  {error && <div className="rec-alert rec-alert-danger mb-3">{error}</div>}
                  <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
                    <div className="rec-field mb-3">
                      <label className="rec-label" htmlFor="rec-export-scope">Badges</label>
                      <select id="rec-export-scope" className="rec-select" value={scope} onChange={(e) => setScope(e.target.value)}>
                        <option value="filtered">All matching active badges</option>
                        <option value="selected" disabled={!selectedIds.length}>Selected registrations ({selectedIds.length})</option>
                      </select>
                    </div>
                    {scope === "filtered" && (
                      <>
                        <div className="rec-field mb-3">
                          <label className="rec-label" htmlFor="rec-export-type">Participation</label>
                          <select id="rec-export-type" className="rec-select" value={registrationType} onChange={(e) => setRegistrationType(e.target.value)}>
                            <option value="">All participants</option>
                            {["Attendee", "Exhibitor", "Sponsor"].map((t) => <option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="rec-field mb-3">
                          <label className="rec-label" htmlFor="rec-export-day">Attendance day</label>
                          <select id="rec-export-day" className="rec-select" value={day} onChange={(e) => setDay(e.target.value)}>
                            <option value="">All days</option>
                            {days.map((d) => <option key={d.label}>{d.label}</option>)}
                          </select>
                        </div>
                        <div className="rec-field mb-3">
                          <label className="rec-label" htmlFor="rec-export-search">Name, email or organization</label>
                          <input id="rec-export-search" className="rec-input" value={search} maxLength={150} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                      </>
                    )}
                    <div className="rec-page-actions mb-3" aria-label="Export format">
                      <button type="button" className={`rec-btn ${format === "pdf" ? "rec-btn-primary" : "rec-btn-outline"}`} aria-pressed={format === "pdf"} onClick={() => setFormat("pdf")}>
                        <FontAwesomeIcon icon={faFilePdf} />
                        PDF
                      </button>
                      <button type="button" className={`rec-btn ${format === "png" ? "rec-btn-primary" : "rec-btn-outline"}`} aria-pressed={format === "png"} onClick={() => setFormat("png")}>
                        <FontAwesomeIcon icon={faFileImage} />
                        PNG · 300 DPI
                      </button>
                    </div>
                    <span className="rec-label">Tag details</span>
                    <div className="rec-checkbox-grid rec-checkbox-grid-compact mb-3">
                      {BADGE_PRINT_FIELDS.map(({ key, label }) => (
                        <label key={key} className="rec-checkbox-option">
                          <input type="checkbox" checked={printDetails[key]} onChange={(e) => setPrintDetails({ ...printDetails, [key]: e.target.checked })} />
                          {label}
                        </label>
                      ))}
                    </div>
                    <label className="rec-checkbox-option rec-checkbox-option-inline mb-2">
                      <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
                      Add 3 mm bleed on each side
                    </label>
                    <p className="rec-muted">{bleed ? "File size: 99 × 131 mm. Trim to 93 × 125 mm." : "File size: 93 × 125 mm, without bleed."}</p>
                  </fieldset>
                  <p className="rec-muted">Inactive badges are skipped. Files expire after 24 hours. Exporting does not issue badges or send email.</p>
                </div>
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewSrc} alt="Sample REC badge print layout" style={{ width: "100%", height: "auto", border: "1px solid #e2e8f0" }} />
                  <span className="rec-muted">Sample preview</span>
                </div>
              </div>
            </div>
            <div className="rec-modal-footer">
              <button type="button" className="rec-btn rec-btn-outline" disabled={busy} onClick={() => setModal(false)}>Cancel</button>
              <button type="button" className="rec-btn rec-btn-primary" disabled={busy || (scope === "selected" && !selectedIds.length)} onClick={create}>
                <FontAwesomeIcon icon={busy ? faSpinner : faDownload} spin={busy} />
                Prepare export
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
