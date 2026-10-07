"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faBookOpen,
  faPenToSquare,
  faUsers,
  faPlus,
  faSave,
  faSpinner,
  faTrash,
  faUpRightFromSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { downloadRapporteurReport, rapporteurDocumentHtml } from "@/lib/rec-conference/rapporteur-rules.mjs"
import RecConfirmDialog from "./RecConfirmDialog"
import "./RecRapporteurDesk.css"

const STATUS = {
  new: "Not started",
  draft: "Draft",
  submitted: "Waiting",
  returned: "Returned",
  approved: "Approved",
}

const emptyForm = {
  assignmentId: "",
  name: "",
  email: "",
  organization: "",
  phone: "",
  hall: "Achwa",
  status: "active",
  accessStart: "",
  accessEnd: "",
}

function toDateTime(local) {
  if (!local) return ""
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(local)
  if (!match) return null
  return `${match[1]}T${match[2]}:00+03:00`
}

function toFormParts(value) {
  if (!value) return { date: "", time: "" }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: "", time: "" }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date)
  const get = (type) => parts.find((part) => part.type === type)?.value || ""
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` }
}

function toLocalValue(value) {
  const parts = toFormParts(value)
  if (!parts.date || !parts.time) return ""
  return `${parts.date}T${parts.time}`
}

function formatDate(value) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  })
}

function accessSummary(item) {
  return `${item.accessStartsAt ? `Starts ${formatDate(item.accessStartsAt)}` : "Starts immediately"}${item.accessEndsAt ? ` · Ends ${formatDate(item.accessEndsAt)}` : " · No expiry"}`
}

async function fetchJson(url, options) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "Request failed")
  return payload
}

function DeskModal({ title, busy, onClose, children, footer }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [busy, onClose])

  return (
    <div className="rec-modal-backdrop" role="presentation">
      <div className="rec-modal rec-modal-wide rec-scanning-management-modal" role="dialog" aria-modal="true" aria-labelledby="rapporteur-modal-title">
        <div className="rec-modal-header rec-modal-header-flex">
          <h3 id="rapporteur-modal-title" className="rec-modal-title rec-modal-title-dark">{title}</h3>
          <button type="button" className="rec-icon-button" onClick={onClose} disabled={busy} aria-label={`Close ${title}`}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="rec-modal-body">{children}</div>
        {footer ? <div className="rec-modal-footer">{footer}</div> : null}
      </div>
    </div>
  )
}

function CommentBox({ busy, onComment, onReturn, onApprove }) {
  const [message, setMessage] = useState("")
  const note = message.trim()
  async function run(work) {
    const text = message
    setMessage("")
    try {
      await work(text)
    } catch {
      setMessage(text)
    }
  }
  return (
    <form className="rec-approve-decide" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="review-comment">
        Note
        <span>Required to return</span>
      </label>
      <textarea id="review-comment" value={message} placeholder="Add a note…" onChange={(event) => setMessage(event.target.value)} />
      <div className="rec-approve-decisions">
        {onApprove ? (
          <button type="button" className="yes" disabled={busy} onClick={() => run(async (text) => {
            if (text) await onComment(text)
            await onApprove()
          })}>Approve</button>
        ) : null}
        {onReturn ? <button type="button" className="back" disabled={busy || !note} onClick={() => run((text) => onReturn(text))}>Return</button> : null}
        <button type="button" className="note" disabled={busy || !note} onClick={() => run((text) => onComment(text))}>Comment</button>
      </div>
    </form>
  )
}

function queueGroups(reports) {
  const groups = []
  for (const report of reports) {
    const label = report.sessionDate || "Date not set"
    const group = groups.find((item) => item.label === label)
    if (group) group.items.push(report)
    else groups.push({ label, items: [report] })
  }
  return groups
}

function shortDay(label) {
  const match = String(label || "").match(/^(\d+)(?:st|nd|rd|th)?\s+([A-Za-z]+)/)
  if (!match) return label
  return `${match[1]} ${match[2].slice(0, 3)}`
}

function ApproverDesk({
  embedded = false,
  conferences,
  conferenceId,
  onConference,
  approverName,
  focusName = "",
  onClearFocus,
  reports,
  detail,
  error,
  notice,
  busy,
  onOpen,
  onClose,
  onComment,
  onReturn,
  onApprove,
  onPeople,
  onShowQueue,
  showingPeople = false,
  people = null,
}) {
  const [filter, setFilter] = useState(embedded ? "all" : "submitted")
  const [pickedDay, setPickedDay] = useState("")
  const [confirmApprove, setConfirmApprove] = useState(false)
  const ordered = reports
    .filter((report) => report.status !== "draft")
    .sort((left, right) => (Number(left.sortAt) - Number(right.sortAt)) || String(left.title || "").localeCompare(String(right.title || "")))
  const counts = {
    submitted: ordered.filter((report) => report.status === "submitted").length,
    returned: ordered.filter((report) => report.status === "returned").length,
    approved: ordered.filter((report) => report.status === "approved").length,
  }
  const shown = filter === "all" ? ordered : ordered.filter((report) => report.status === filter)
  const report = detail?.report
  const filters = [
    ["submitted", "Waiting", counts.submitted],
    ["returned", "Returned", counts.returned],
    ["approved", "Approved", counts.approved],
    ["all", "All", ordered.length],
  ]
  const groups = queueGroups(shown)
  const activeDay = groups.some((group) => group.label === pickedDay) ? pickedDay : (groups[0]?.label || "")
  const activeGroup = groups.find((group) => group.label === activeDay)

  if (!embedded) {
    return (
      <div className={report ? "rec-approve-shell is-reading" : "rec-approve-shell"}>
        {report ? null : (
          <aside className="rec-approve-nav">
            <img className="rec-side-logo" src="/NREP.png" alt="NREP" width="72" height="72" />
            <div className="rec-approve-brand">
              <small>REC26 &amp; Expo</small>
              <strong>Approver</strong>
            </div>
            {conferences.length > 1 ? (
              <label className="rec-approve-conference">
                <span>Conference</span>
                <select value={conferenceId} onChange={(event) => onConference(event.target.value)}>
                  {conferences.map((conference) => (
                    <option key={conference.$id} value={conference.$id}>{conference.title || conference.year}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="rec-approve-conference-name">{conferences.find((conference) => conference.$id === conferenceId)?.title || ""}</p>
            )}
            <div className="rec-approve-counts" aria-label="Report queue">
              {filters.map(([key, label, count]) => (
                <button key={key} type="button" className={!showingPeople && filter === key ? "is-on" : ""} onClick={() => { setFilter(key); onShowQueue?.() }}>
                  <strong>{count}</strong>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <nav className="rec-approve-days" aria-label="Conference days">
              {groups.map((group) => (
                <button key={group.label} type="button" className={!showingPeople && group.label === activeDay ? "is-on" : ""} onClick={() => { setPickedDay(group.label); onShowQueue?.() }}>
                  <span>{shortDay(group.label)}</span>
                  <b>{group.items.length}</b>
                </button>
              ))}
            </nav>
            {onPeople ? (
              <button type="button" className={showingPeople ? "rec-approve-back is-on" : "rec-approve-back"} onClick={onPeople}>Rapporteurs</button>
            ) : null}
          </aside>
        )}
        <div className="rec-approve-main">
          {error ? <p className="rec-approve-alert" role="alert">{error}</p> : null}
          {notice ? <p className="rec-approve-note">{notice}</p> : null}
          {showingPeople ? people : report ? (
            <ApproverReview
              report={report}
              comments={detail.comments || []}
              busy={busy}
              onClose={onClose}
              onComment={onComment}
              onReturn={onReturn}
              onApprove={() => setConfirmApprove(true)}
            />
          ) : (
            <>
              {focusName ? (
                <div className="rec-approve-focus">
                  <span>{focusName}</span>
                  <button type="button" className="plain" onClick={onClearFocus}>All reports</button>
                </div>
              ) : null}
              {activeGroup ? (
                <section className="rec-approve-day">
                  <h1>{activeGroup.label}</h1>
                  <div className="rec-approve-table">
                    {activeGroup.items.map((item) => (
                      <button key={item.$id} type="button" className={`rec-approve-row is-${item.status}`} onClick={() => onOpen(item.$id)}>
                        <span className="rec-approve-time">
                          <span>{item.startTime || "Time not set"}</span>
                          {item.endTime ? <span>{item.endTime}</span> : null}
                        </span>
                        <span>
                          <strong>{item.title || "Session"}</strong>
                          <span>{[item.authorName, item.hall].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className={`rec-approve-status rec-approve-status-${item.status}`}>{STATUS[item.status] || item.status}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : <p className="rec-approve-empty">{filter === "submitted" ? "Nothing is waiting for review." : "No reports in this list."}</p>}
            </>
          )}
        </div>
        {confirmApprove && report ? (
          <RecConfirmDialog
            title="Approve report"
            confirmLabel="Approve"
            busy={busy}
            onClose={() => { if (!busy) setConfirmApprove(false) }}
            onConfirm={async () => {
              try {
                await onApprove()
                setConfirmApprove(false)
              } catch {
                /* the desk already shows the error */
              }
            }}
          >
            <div className="rec-confirm-subject">
              <strong>{report.title || "Session"}</strong>
              <span>{[report.authorName, report.hall].filter(Boolean).join(" · ")}</span>
            </div>
          </RecConfirmDialog>
        ) : null}
      </div>
    )
  }

  return (
    <div className={embedded ? "rec-approve rec-approve-embedded" : "rec-approve"}>
      {embedded ? null : (
        <header className="rec-approve-bar">
          <div>
            <small>REC26 &amp; Expo</small>
            <strong>{approverName || "Approver"}</strong>
            <span>Reports for review</span>
          </div>
          <label className="rec-approve-conference">
            Conference
            <select value={conferenceId} onChange={(event) => onConference(event.target.value)}>
              {conferences.map((conference) => (
                <option key={conference.$id} value={conference.$id}>{conference.title || conference.year}</option>
              ))}
            </select>
          </label>
        </header>
      )}
      {embedded ? null : error ? <p className="rec-approve-alert" role="alert">{error}</p> : null}
      {embedded ? null : notice ? <p className="rec-approve-note">{notice}</p> : null}
      {focusName && !report ? (
        <div className="rec-approve-focus">
          <span>{focusName}</span>
          <button type="button" className="plain" onClick={onClearFocus}>All reports</button>
        </div>
      ) : null}
      {report ? (
        <ApproverReview
          report={report}
          comments={detail.comments || []}
          busy={busy}
          onClose={onClose}
          onComment={onComment}
          onReturn={onReturn}
          onApprove={() => setConfirmApprove(true)}
        />
      ) : (
        <>
          <div className="rec-approve-stats" role="tablist" aria-label="Report queue">
            {filters.map(([key, label, count]) => (
              <button key={key} type="button" data-status={key} className={filter === key ? "is-active" : ""} aria-selected={filter === key} onClick={() => setFilter(key)}>
                <strong>{count}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? <p className="rec-approve-empty">{filter === "submitted" ? "Nothing is waiting for review." : "No reports in this list."}</p> : queueGroups(shown).map((group) => (
            <section key={group.label} className="rec-approve-day">
              <h2>{group.label}</h2>
              <div className="rec-approve-table">
                {group.items.map((item) => (
                  <button key={item.$id} type="button" className="rec-approve-row" onClick={() => onOpen(item.$id)}>
                    <span className="rec-approve-time">{[item.startTime, item.endTime].filter(Boolean).join(" – ") || "Time not set"}</span>
                    <span>
                      <strong>{item.title || "Session"}</strong>
                      <span>{[item.authorName, item.hall].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={`rec-approve-status rec-approve-status-${item.status}`}>{STATUS[item.status] || item.status}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      {confirmApprove && report ? (
        <RecConfirmDialog
          title="Approve report"
          confirmLabel="Approve"
          busy={busy}
          onClose={() => { if (!busy) setConfirmApprove(false) }}
          onConfirm={async () => {
            try {
              await onApprove()
              setConfirmApprove(false)
            } catch {
              /* the desk already shows the error */
            }
          }}
        >
          <div className="rec-confirm-subject">
            <strong>{report.title || "Session"}</strong>
            <span>{[report.authorName, report.hall].filter(Boolean).join(" · ")}</span>
          </div>
        </RecConfirmDialog>
      ) : null}
    </div>
  )
}

function ApproverReview({ report, comments, busy, onClose, onComment, onReturn, onApprove }) {
  const html = rapporteurDocumentHtml({ ...report, content: report.content || {} })
  const waiting = report.status === "submitted"
  return (
    <article className="rec-approve-read">
      <div className="rec-approve-read-doc">
        <div className="rec-approve-review-bar">
          <button type="button" className="plain" onClick={onClose}>Reports</button>
          <div>
            <h2>{report.title || "Session"}</h2>
            <p>{[report.authorName, report.hall, report.sessionDate, [report.startTime, report.endTime].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="rec-approve-review-actions">
            <span className={`rec-approve-status rec-approve-status-${report.status}`}>{STATUS[report.status] || report.status}</span>
            <button type="button" className="plain" onClick={() => downloadRapporteurReport(report)}>Download</button>
          </div>
        </div>
        <div className="rec-doc-canvas">
          <div className="rec-doc-sheet" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
      <aside className="rec-approve-panel">
        <p className="rec-approve-panel-label">Review</p>
        {(report.mediaLinks || []).length ? (
          <div className="rec-rapport-media">
            {report.mediaLinks.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.label || item.url}</a>)}
          </div>
        ) : null}
        {(comments || []).length ? comments.map((comment) => (
          <div className="comment" key={comment.$id}>
            <b>{comment.authorName}</b>
            <span className="quiet"> · {comment.authorRole === "approver" ? "Approver" : "Rapporteur"}</span>
            <p>{comment.message}</p>
          </div>
        )) : <p className="quiet">No comments yet.</p>}
        {waiting || report.status === "returned" ? (
          <CommentBox busy={busy} onComment={onComment} onReturn={waiting ? onReturn : null} onApprove={waiting ? onApprove : null} />
        ) : null}
      </aside>
    </article>
  )
}

export default function RecRapporteurDesk({ initialConferenceId = "", initialReportId = "" }) {
  const [conferences, setConferences] = useState([])
  const [conferenceId, setConferenceId] = useState(initialConferenceId)
  const [workspace, setWorkspace] = useState(null)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [extraOpen, setExtraOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState(null)
  const [view, setView] = useState("people")
  const [reportFocus, setReportFocus] = useState("")
  const [form, setForm] = useState(emptyForm)
  const [extra, setExtra] = useState({ title: "", hall: "Achwa", date: "", startTime: "", endTime: "", mediaLinks: "" })

  useEffect(() => {
    let stop = false
    fetchJson("/api/rec/rapporteur/workspace")
      .then((data) => {
        if (stop) return
        setConferences(data.conferences || [])
        setConferenceId((current) => current || data.conferences?.[0]?.$id || "")
      })
      .catch((err) => { if (!stop) setError(err.message) })
    return () => { stop = true }
  }, [])

  useEffect(() => {
    if (!conferenceId) return undefined
    let stop = false
    fetchJson(`/api/rec/rapporteur/workspace?conferenceId=${encodeURIComponent(conferenceId)}`)
      .then((data) => { if (!stop) setWorkspace(data) })
      .catch((err) => { if (!stop) setError(err.message) })
    return () => { stop = true }
  }, [conferenceId])

  useEffect(() => {
    if (!initialReportId) return undefined
    let stop = false
    fetchJson(`/api/rec/rapporteur/review?reportId=${encodeURIComponent(initialReportId)}`)
      .then((data) => { if (!stop) setDetail(data) })
      .catch((err) => { if (!stop) setError(err.message) })
    return () => { stop = true }
  }, [initialReportId])

  useEffect(() => {
    if (!detail?.report?.$id || (detail.report.status !== "submitted" && detail.report.status !== "returned")) return undefined
    const timer = setInterval(() => {
      fetchJson(`/api/rec/rapporteur/review?reportId=${encodeURIComponent(detail.report.$id)}`)
        .then((data) => setDetail((current) => current?.report?.$id === data.report.$id ? data : current))
        .catch(() => null)
    }, 8000)
    return () => clearInterval(timer)
  }, [detail?.report?.$id, detail?.report?.status])

  async function reload() {
    const data = await fetchJson(`/api/rec/rapporteur/workspace?conferenceId=${encodeURIComponent(conferenceId)}`)
    setWorkspace(data)
  }

  function editAssignment(item) {
    setForm({
      assignmentId: item.$id,
      name: item.name || "",
      email: item.email || "",
      organization: item.organization || "",
      phone: item.phone || "",
      hall: item.hall || "Achwa",
      status: item.status || "active",
      accessStart: toLocalValue(item.accessStartsAt),
      accessEnd: toLocalValue(item.accessEndsAt),
    })
    setFormOpen(true)
    setError("")
  }

  async function saveAssignment(event) {
    event.preventDefault()
    const accessStartsAt = toDateTime(form.accessStart)
    const accessEndsAt = toDateTime(form.accessEnd)
    if (accessStartsAt === null || accessEndsAt === null) {
      setError("Enter a complete start or end, or leave it blank.")
      return
    }
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const payload = {
        ...form,
        conferenceId,
        accessStartsAt,
        accessEndsAt,
      }
      const saved = await fetchJson("/api/rec/rapporteur/assignments", {
        method: form.assignmentId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      })
      setForm(emptyForm)
      setFormOpen(false)
      setNotice(saved.notice || (form.assignmentId ? "Rapporteur updated." : "Rapporteur added."))
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeAssignment() {
    const item = pendingRemove
    if (!item) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await fetchJson(`/api/rec/rapporteur/assignments?assignmentId=${encodeURIComponent(item.$id)}`, { method: "DELETE" })
      if (form.assignmentId === item.$id) {
        setFormOpen(false)
        setForm(emptyForm)
      }
      setPendingRemove(null)
      setNotice("Rapporteur removed.")
      await reload()
    } catch (err) {
      setError(err.message)
      setPendingRemove(null)
    } finally {
      setBusy(false)
    }
  }

  async function addSession(event) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await fetchJson("/api/rec/rapporteur/extras", { method: "POST", body: JSON.stringify({ ...extra, conferenceId }) })
      setExtra({ title: "", hall: extra.hall, date: "", startTime: "", endTime: "", mediaLinks: "" })
      setExtraOpen(false)
      setNotice("Session added.")
      await reload()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setBusy(false)
    }
  }

  async function openReport(reportId) {
    setError("")
    setNotice("")
    setDetail(await fetchJson(`/api/rec/rapporteur/review?reportId=${encodeURIComponent(reportId)}`))
  }

  async function act(action, message) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await fetchJson("/api/rec/rapporteur/review", {
        method: "POST",
        body: JSON.stringify({ action, reportId: detail.report.$id, message }),
      })
      if (result.notice) setNotice(result.notice)
      if (result.comments) setDetail((current) => ({ ...current, comments: result.comments }))
      if (result.status) {
        setDetail(await fetchJson(`/api/rec/rapporteur/review?reportId=${encodeURIComponent(detail.report.$id)}`))
        await reload()
      }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setBusy(false)
    }
  }

  const halls = workspace?.halls || []
  const hallSessions = (workspace?.sessions || []).filter((session) => session.hall === form.hall)
  const canAssign = Boolean(workspace?.canAssign)
  const assignments = workspace?.assignments || []
  const reports = workspace?.reports || []
  const visibleReports = reportFocus
    ? reports.filter((report) => report.authorEmail === reportFocus)
    : reports
  const showingPeople = canAssign && view === "people"

  if (!workspace) {
    return (
      <div className="rec-approve-shell">
        <aside className="rec-approve-nav">
          <img className="rec-side-logo" src="/NREP.png" alt="NREP" width="72" height="72" />
          <div className="rec-approve-brand">
            <small>REC26 &amp; Expo</small>
            <strong>Approver</strong>
          </div>
        </aside>
        <div className="rec-approve-main" />
      </div>
    )
  }

  return (
    <>
      <ApproverDesk
        conferences={conferences}
        conferenceId={conferenceId}
        onConference={(next) => {
          setConferenceId(next)
          setDetail(null)
          setReportFocus("")
        }}
        approverName={workspace.approver?.name || ""}
        focusName={reportFocus ? (visibleReports[0]?.authorName || "Reports") : ""}
        onClearFocus={() => { setReportFocus(""); setDetail(null) }}
        reports={visibleReports}
        detail={detail}
        error={error}
        notice={notice}
        busy={busy}
        onOpen={openReport}
        onClose={() => setDetail(null)}
        onComment={(message) => act("comment", message)}
        onReturn={(message) => act("return", message)}
        onApprove={() => act("approve")}
        onPeople={canAssign ? () => { setView("people"); setDetail(null); setReportFocus("") } : undefined}
        onShowQueue={() => { setView("reports"); setReportFocus("") }}
        showingPeople={showingPeople}
        people={showingPeople ? (
          <section className="rec-approve-day">
            <div className="rec-approve-people-head">
              <h1>Rapporteurs</h1>
              <button type="button" className="rec-btn rec-btn-primary" onClick={() => { setForm({ ...emptyForm, hall: halls[0] || "Achwa" }); setFormOpen(true); setError("") }}>
                <FontAwesomeIcon icon={faPlus} />
                Add Rapporteur
              </button>
            </div>
            <div className="rec-approve-table">
              {assignments.length === 0 ? <p className="rec-approve-empty">No rapporteurs yet.</p> : assignments.map((item) => (
                <article key={item.$id} className="rec-approve-person">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{[item.email, item.organization, item.hall].filter(Boolean).join(" · ")}</span>
                    <span>{accessSummary(item)}</span>
                  </div>
                  <div className="rec-approve-person-actions">
                    <Link className="rec-approve-action rec-approve-action-open" href={`/reporting?assignment=${item.$id}`} target="_blank" rel="noopener noreferrer">
                      <FontAwesomeIcon icon={faUpRightFromSquare} />
                      Dashboard
                    </Link>
                    {reports.some((report) => report.authorEmail === item.email) ? (
                      <button type="button" className="rec-approve-action rec-approve-action-reports" onClick={() => { setReportFocus(item.email); setView("reports"); setDetail(null) }}>
                        <FontAwesomeIcon icon={faBookOpen} />
                        Reports
                      </button>
                    ) : null}
                    <button type="button" className="rec-approve-action rec-approve-action-edit" onClick={() => editAssignment(item)} disabled={busy}>
                      <FontAwesomeIcon icon={faPenToSquare} />
                      Edit
                    </button>
                    <button type="button" className="rec-approve-action rec-approve-action-delete" onClick={() => setPendingRemove(item)} disabled={busy}>
                      <FontAwesomeIcon icon={faTrash} />
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      />
      {formOpen ? (
          <DeskModal
            title={form.assignmentId ? "Edit Rapporteur" : "Add Rapporteur"}
            busy={busy}
            onClose={() => { if (!busy) { setFormOpen(false); setForm(emptyForm) } }}
            footer={(
              <>
                <button type="button" className="rec-btn rec-btn-outline" onClick={() => { setFormOpen(false); setForm(emptyForm) }} disabled={busy}>Cancel</button>
                <button type="submit" form="rapporteur-editor-form" className="rec-btn rec-btn-primary" disabled={busy}>
                  {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
                  {form.assignmentId ? "Update Rapporteur" : "Add Rapporteur"}
                </button>
              </>
            )}
          >
            <form id="rapporteur-editor-form" className="rec-grid" onSubmit={saveAssignment}>
              <div>
                <span className="rec-label">Access window</span>
                <p className="rec-muted mb-2">Leave blank for no limit.</p>
                <div className="rec-grid rec-grid-two">
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="rapporteur-start">Starts</label>
                    <input id="rapporteur-start" className="rec-input" type="datetime-local" value={form.accessStart} onChange={(event) => setForm({ ...form, accessStart: event.target.value })} />
                  </div>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="rapporteur-end">Ends</label>
                    <input id="rapporteur-end" className="rec-input" type="datetime-local" value={form.accessEnd} onChange={(event) => setForm({ ...form, accessEnd: event.target.value })} />
                  </div>
                </div>
              </div>
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="rapporteur-name">Name</label>
                  <input id="rapporteur-name" className="rec-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus />
                </div>
                <div className="rec-field">
                  <label className="rec-label" htmlFor="rapporteur-email">Email</label>
                  <input id="rapporteur-email" className="rec-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
                </div>
              </div>
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="rapporteur-organization">Organization</label>
                  <input id="rapporteur-organization" className="rec-input" value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} />
                </div>
                <div className="rec-field">
                  <label className="rec-label" htmlFor="rapporteur-phone">Phone</label>
                  <input id="rapporteur-phone" className="rec-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                </div>
              </div>
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="rapporteur-status">Access Status</label>
                  <select id="rapporteur-status" className="rec-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="rec-field">
                  <label className="rec-label" htmlFor="rapporteur-hall">Hall</label>
                  <select id="rapporteur-hall" className="rec-select" value={form.hall} onChange={(event) => setForm({ ...form, hall: event.target.value })}>
                    {halls.map((hall) => <option key={hall}>{hall}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="rec-panel-header rec-scanning-list-header">
                  <span className="rec-label mb-0">Sessions in {form.hall}</span>
                  <button type="button" className="rec-btn rec-btn-outline" onClick={() => { setExtra({ ...extra, hall: form.hall }); setExtraOpen(true) }}>
                    <FontAwesomeIcon icon={faPlus} />
                    Unplanned session
                  </button>
                </div>
                <div className="rec-scanning-list mt-2">
                  {hallSessions.length ? hallSessions.map((session) => (
                    <div key={`${session.title}-${session.sessionDate}-${session.startTime}`} className="rec-scanning-row">
                      <div>
                        <div className="rec-row-title">{session.title}</div>
                        <div className="rec-row-desc">{[session.sessionDate, session.startTime && session.endTime && session.startTime !== session.endTime ? `${session.startTime}–${session.endTime}` : session.startTime].filter(Boolean).join(" · ")}</div>
                      </div>
                    </div>
                  )) : (
                    <div className="rec-empty-state-compact">No planned sessions in this hall.</div>
                  )}
                </div>
              </div>
            </form>
          </DeskModal>
        ) : null}

        {extraOpen ? (
          <DeskModal
            title="Unplanned session"
            busy={busy}
            onClose={() => { if (!busy) setExtraOpen(false) }}
            footer={(
              <>
                <button type="button" className="rec-btn rec-btn-outline" onClick={() => setExtraOpen(false)} disabled={busy}>Cancel</button>
                <button type="submit" form="rapporteur-session-form" className="rec-btn rec-btn-primary" disabled={busy}>
                  {busy ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
                  Add Session
                </button>
              </>
            )}
          >
            <form id="rapporteur-session-form" className="rec-grid" onSubmit={addSession}>
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="extra-title">Title</label>
                  <input id="extra-title" className="rec-input" value={extra.title} onChange={(event) => setExtra({ ...extra, title: event.target.value })} required autoFocus />
                </div>
                <div className="rec-field">
                  <label className="rec-label" htmlFor="extra-hall">Hall</label>
                  <select id="extra-hall" className="rec-select" value={extra.hall} onChange={(event) => setExtra({ ...extra, hall: event.target.value })}>
                    {halls.map((hall) => <option key={hall}>{hall}</option>)}
                  </select>
                </div>
              </div>
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="extra-date">Date</label>
                  <input id="extra-date" className="rec-input" value={extra.date} onChange={(event) => setExtra({ ...extra, date: event.target.value })} />
                </div>
                <div className="rec-field">
                  <label className="rec-label" htmlFor="extra-start">Start</label>
                  <input id="extra-start" className="rec-input" value={extra.startTime} onChange={(event) => setExtra({ ...extra, startTime: event.target.value })} />
                </div>
              </div>
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="extra-end">End</label>
                  <input id="extra-end" className="rec-input" value={extra.endTime} onChange={(event) => setExtra({ ...extra, endTime: event.target.value })} />
                </div>
                <div className="rec-field">
                  <label className="rec-label" htmlFor="extra-media">Media links</label>
                  <input id="extra-media" className="rec-input" value={extra.mediaLinks} onChange={(event) => setExtra({ ...extra, mediaLinks: event.target.value })} />
                </div>
              </div>
            </form>
          </DeskModal>
        ) : null}

        {pendingRemove ? (
          <RecConfirmDialog
            title="Remove rapporteur"
            confirmLabel="Remove"
            busy={busy}
            onClose={() => { if (!busy) setPendingRemove(null) }}
            onConfirm={removeAssignment}
          >
            <div className="rec-confirm-subject">
              <strong>{pendingRemove.name}</strong>
              <span>{pendingRemove.email}{pendingRemove.hall ? ` · ${pendingRemove.hall}` : ""}</span>
            </div>
          </RecConfirmDialog>
        ) : null}
    </>
  )
}
