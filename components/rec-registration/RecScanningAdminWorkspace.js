"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faBan,
  faBarcode,
  faChartLine,
  faCheckCircle,
  faEnvelope,
  faIdBadge,
  faLink,
  faPaperPlane,
  faPenToSquare,
  faPlus,
  faQrcode,
  faRefresh,
  faSave,
  faSquare,
  faSquareCheck,
  faSpinner,
  faUserShield,
  faUsersGear,
  faTrash,
  faWandMagicSparkles,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import { getRecBadgeViewPath, REC_2026_SCANNER_HALLS } from "@/lib/rec-conference/scanning-rules.mjs"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import RecConfirmDialog from "@/components/rec-registration/RecConfirmDialog"

const eventTypes = [
  { value: "conference_entry", label: "Conference Entrance" },
  { value: "lunch", label: "Lunch" },
  { value: "session_entry", label: "Session Entrance" },
  { value: "custom", label: "Custom Event" },
]

const scanRules = [
  { value: "once_per_event", label: "One accepted scan per event" },
  { value: "once_per_day", label: "One accepted scan per day" },
  { value: "multiple", label: "Record every valid scan" },
]

const operatorStatuses = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "revoked", label: "Revoked" },
]

const emptyEventForm = {
  name: "",
  type: "conference_entry",
  day: "",
  date: "",
  startTimeValue: "",
  endTimeValue: "",
  venue: "",
  scanRule: "once_per_event",
  allowedRegistrationTypes: [],
  allowedDaysAttending: [],
  isActive: true,
}

const emptyOperatorForm = {
  name: "",
  email: "",
  organization: "",
  phone: "",
  status: "active",
  allowedEventTypes: [],
  allowedEventIds: [],
  allowedVenues: [],
  allowedDays: [],
  accessStartDate: "",
  accessStartTime: "",
  accessEndDate: "",
  accessEndTime: "",
}

const emptyTeraAccessForm = {
  accessStartDate: "",
  accessStartTime: "",
  accessEndDate: "",
  accessEndTime: "",
  allowedDays: [],
}

const typeLabels = Object.fromEntries(eventTypes.map((type) => [type.value, type.label]))
const ruleLabels = Object.fromEntries(scanRules.map((rule) => [rule.value, rule.label]))
const destructiveDeleteConfirmation = "DELETE_SCAN_EVENT_DATA"

function normalizeTimeValue(time) {
  const value = String(time || "").trim()
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value
  return ""
}

function toDateTime(date, time) {
  if (!date) return ""
  const timePart = normalizeTimeValue(time)
  if (!timePart) return ""
  return `${date}T${timePart}+03:00`
}

function hasCompleteTeraWindow(form) {
  return Boolean(form?.accessStartDate && form?.accessStartTime && form?.accessEndDate && form?.accessEndTime)
}

function hasPartialTeraWindow(form) {
  const filled = [
    form?.accessStartDate,
    form?.accessStartTime,
    form?.accessEndDate,
    form?.accessEndTime,
  ].filter(Boolean).length
  return filled > 0 && filled < 4
}

function formatDate(value) {
  if (!value) return "Not set"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  })
}

function formatList(values, fallback = "None") {
  return Array.isArray(values) && values.length ? values.join(", ") : fallback
}

function toKampalaFormParts(value) {
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
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  }
}

function mapEventToForm(scanEvent) {
  const start = toKampalaFormParts(scanEvent.startTime)
  const end = toKampalaFormParts(scanEvent.endTime)
  return {
    name: scanEvent.name || "",
    type: scanEvent.type || "conference_entry",
    day: scanEvent.day ? String(scanEvent.day) : "",
    date: scanEvent.date || start.date || end.date || "",
    startTimeValue: start.time,
    endTimeValue: end.time,
    venue: scanEvent.venue || "",
    scanRule: scanEvent.scanRule || "once_per_event",
    allowedRegistrationTypes: scanEvent.allowedRegistrationTypes || [],
    allowedDaysAttending: scanEvent.allowedDaysAttending || [],
    isActive: scanEvent.isActive !== false,
  }
}

function mapOperatorToForm(operator) {
  const start = toKampalaFormParts(operator.accessStartsAt)
  const end = toKampalaFormParts(operator.accessEndsAt)
  return {
    name: operator.name || "",
    email: operator.email || "",
    organization: operator.organization || "",
    phone: operator.phone || "",
    status: operator.status || "active",
    allowedEventTypes: operator.allowedEventTypes || [],
    allowedEventIds: operator.allowedEventIds || [],
    allowedVenues: operator.allowedVenues || [],
    allowedDays: operator.allowedDays || [],
    accessStartDate: start.date,
    accessStartTime: start.time,
    accessEndDate: end.date,
    accessEndTime: end.time,
  }
}

function AccessWindowFields({
  idPrefix,
  startDate,
  startTime,
  endDate,
  endTime,
  onChange,
  autoFocus = false,
}) {
  return (
    <div className="rec-access-window">
      <div className="rec-grid rec-grid-two">
        <div className="rec-field">
          <label className="rec-label" htmlFor={`${idPrefix}-start-date`}>Start date</label>
          <input
            id={`${idPrefix}-start-date`}
            className="rec-input"
            type="date"
            value={startDate}
            autoFocus={autoFocus}
            onChange={(event) => onChange({ startDate: event.target.value })}
          />
        </div>
        <div className="rec-field">
          <label className="rec-label" htmlFor={`${idPrefix}-start-time`}>Start time</label>
          <input
            id={`${idPrefix}-start-time`}
            className="rec-input"
            type="time"
            value={startTime}
            onChange={(event) => onChange({ startTime: event.target.value })}
          />
        </div>
      </div>
      <div className="rec-grid rec-grid-two">
        <div className="rec-field">
          <label className="rec-label" htmlFor={`${idPrefix}-end-date`}>End date</label>
          <input
            id={`${idPrefix}-end-date`}
            className="rec-input"
            type="date"
            value={endDate}
            onChange={(event) => onChange({ endDate: event.target.value })}
          />
        </div>
        <div className="rec-field">
          <label className="rec-label" htmlFor={`${idPrefix}-end-time`}>End time</label>
          <input
            id={`${idPrefix}-end-time`}
            className="rec-input"
            type="time"
            value={endTime}
            onChange={(event) => onChange({ endTime: event.target.value })}
          />
        </div>
      </div>
    </div>
  )
}

function isTeraOperatorEmail(email) {
  return String(email || "").toLowerCase().endsWith("@tera.rec.local")
}

function defaultTeraAccessForm(conference) {
  const days = conference?.days || []
  return {
    accessStartDate: "",
    accessStartTime: "",
    accessEndDate: "",
    accessEndTime: "",
    allowedDays: days.map((_, index) => String(index + 1)),
  }
}

function operatorAccessSummary(operator) {
  return (
    <>
      {operator.accessStartsAt ? `Starts ${formatDate(operator.accessStartsAt)}` : "Starts immediately"}
      {operator.accessEndsAt ? ` · Ends ${formatDate(operator.accessEndsAt)}` : " · No expiry"}
      {operator.lastLoginAt
        ? ` · ${operator.deviceKind === "tera_hid" ? "Last used" : "Last login"} ${formatDate(operator.lastLoginAt)}`
        : (operator.deviceKind === "tera_hid" ? " · Not used yet" : " · Never signed in")}
    </>
  )
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "Request failed")
  return payload
}

function AccessMessage({ title, children }) {
  return (
    <div className="rec-dashboard-container">
      <div className="rec-access-wrap">
        <div className="rec-alert text-center">
          <FontAwesomeIcon icon={faUserShield} size="3x" className="mb-4" style={{ color: "#d99a00" }} />
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

function ScannerManagementModal({ modalId, title, busy = false, onClose, children, footer }) {
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
      <div
        className="rec-modal rec-modal-wide rec-scanning-management-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${modalId}-title`}
      >
        <div className="rec-modal-header rec-modal-header-flex">
          <h3 id={`${modalId}-title`} className="rec-modal-title rec-modal-title-dark">{title}</h3>
          <button
            type="button"
            className="rec-icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label={`Close ${title}`}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="rec-modal-body">{children}</div>
        {footer && <div className="rec-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export default function RecScanningAdminWorkspace({ activeView = "events", initialConferenceId = "" }) {
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES,
  } = useAuth()
  const appwriteServices = useAppwrite()

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "manage")
  const isSenior = isSeniorManager()
  const permissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  const [conferences, setConferences] = useState([])
  const [conferenceId, setConferenceId] = useState("")
  const [events, setEvents] = useState([])
  const [eventPager, setEventPager] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 })
  const [eventPage, setEventPage] = useState(1)
  const [eventLimit, setEventLimit] = useState(10)
  const [operators, setOperators] = useState([])
  const [operatorPager, setOperatorPager] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 })
  const [operatorPage, setOperatorPage] = useState(1)
  const [operatorLimit, setOperatorLimit] = useState(25)
  const [badgeRegistry, setBadgeRegistry] = useState({
    documents: [],
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
    counts: { total: 0, withBadge: 0, withoutBadge: 0, revoked: 0 },
  })
  const [badgePage, setBadgePage] = useState(1)
  const [badgeLimit, setBadgeLimit] = useState(25)
  const [badgeStatus, setBadgeStatus] = useState("without_badge")
  const [badgeSearchInput, setBadgeSearchInput] = useState("")
  const [badgeSearch, setBadgeSearch] = useState("")
  const [selectedBadgeRegistrations, setSelectedBadgeRegistrations] = useState([])
  const [selectedEventIds, setSelectedEventIds] = useState([])
  const [eventForm, setEventForm] = useState(emptyEventForm)
  const [editingEventId, setEditingEventId] = useState("")
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [operatorForm, setOperatorForm] = useState(emptyOperatorForm)
  const [editingOperatorId, setEditingOperatorId] = useState("")
  const [operatorModalOpen, setOperatorModalOpen] = useState(false)
  const [teraModalOpen, setTeraModalOpen] = useState(false)
  const [teraAccessForm, setTeraAccessForm] = useState(emptyTeraAccessForm)
  const [modalError, setModalError] = useState("")
  const [bulkDeleteState, setBulkDeleteState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [confirmDialog, setConfirmDialog] = useState(null)

  const selectedConference = useMemo(
    () => conferences.find((conference) => conference.$id === conferenceId) || null,
    [conferences, conferenceId]
  )

  const dayOptions = selectedConference?.days || []
  const venueOptions = useMemo(
    () => Array.from(new Set([
      ...REC_2026_SCANNER_HALLS,
      "Main Entrance",
      ...events.map((event) => event.venue),
      ...operators.flatMap((operator) => operator.allowedVenues || []),
    ].filter(Boolean))).sort(),
    [events, operators]
  )
  const visibleEventIds = useMemo(() => events.map((event) => event.$id).filter(Boolean), [events])
  const allVisibleEventsSelected = visibleEventIds.length > 0
    && visibleEventIds.every((eventId) => selectedEventIds.includes(eventId))

  const loadConferences = useCallback(async () => {
    let rows = []
    try {
      const data = await fetchJson("/api/rec/scanning/conferences")
      rows = data.documents || []
    } catch (error) {
      if (!appwriteServices) throw error
      const response = await getAllRecConferences(appwriteServices)
      rows = (response.documents || []).map((conference) => ({
        $id: conference.$id,
        year: conference.year,
        title: conference.title,
        shortName: conference.shortName,
        startDate: conference.startDate,
        endDate: conference.endDate,
        location: conference.location,
        venue: conference.venue,
        days: conference.days || [],
        isActive: conference.isActive,
      }))
    }
    setConferences(rows)
    setConferenceId((current) => (
      current
      || rows.find((conference) => conference.$id === initialConferenceId)?.$id
      || rows.find((conference) => conference.isActive)?.$id
      || rows[0]?.$id
      || ""
    ))
  }, [appwriteServices, initialConferenceId])

  const loadWorkspace = useCallback(async () => {
    if (!conferenceId) return
    setError("")
    const badgeParams = new URLSearchParams({
      conferenceId,
      page: String(badgePage),
      limit: String(badgeLimit),
      status: badgeStatus,
      search: badgeSearch,
    })
    const eventParams = new URLSearchParams({
      conferenceId,
      page: activeView === "operators" ? "1" : String(eventPage),
      limit: activeView === "operators" ? "100" : String(eventLimit),
    })
    const operatorParams = new URLSearchParams({
      conferenceId,
      page: String(operatorPage),
      limit: String(operatorLimit),
    })
    const shouldLoadEvents = activeView === "events" || activeView === "operators"
    const [eventData, operatorData, badgeData] = await Promise.all([
      shouldLoadEvents
        ? fetchJson(`/api/rec/scanning/events?${eventParams.toString()}`)
        : Promise.resolve({ documents: [], total: 0, page: 1, limit: eventLimit, totalPages: 1 }),
      activeView === "operators"
        ? fetchJson(`/api/rec/scanning/operators?${operatorParams.toString()}`)
        : Promise.resolve({ documents: [], total: 0, page: 1, limit: operatorLimit, totalPages: 1 }),
      activeView === "badges"
        ? fetchJson(`/api/rec/scanning/badges?${badgeParams.toString()}`)
        : Promise.resolve(null),
    ])
    setEvents(eventData.documents || [])
    setEventPager({
      total: eventData.total || 0,
      page: eventData.page || eventPage,
      limit: eventData.limit || eventLimit,
      totalPages: eventData.totalPages || 1,
    })
    setOperators(operatorData.documents || [])
    setOperatorPager({
      total: operatorData.total || 0,
      page: operatorData.page || operatorPage,
      limit: operatorData.limit || operatorLimit,
      totalPages: operatorData.totalPages || 1,
    })
    if (badgeData) {
      setBadgeRegistry(badgeData)
      setSelectedBadgeRegistrations((previous) => {
        const visibleIds = new Set((badgeData.documents || []).map((row) => row.registration?.$id).filter(Boolean))
        return previous.filter((id) => visibleIds.has(id))
      })
    }
  }, [activeView, badgeLimit, badgePage, badgeSearch, badgeStatus, conferenceId, eventLimit, eventPage, operatorLimit, operatorPage])

  useEffect(() => {
    if (!hasRecAccess && !isSenior) return
    if (!canManageRec && !isSenior) return

    let cancelled = false
    const init = async () => {
      setLoading(true)
      setError("")
      try {
        await loadConferences()
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load scanning setup.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [canManageRec, hasRecAccess, isSenior, loadConferences])

  useEffect(() => {
    if (!conferenceId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        await loadWorkspace()
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load scanning workspace.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [conferenceId, loadWorkspace])

  const refresh = async () => {
    setLoading(true)
    try {
      await loadWorkspace()
    } catch (err) {
      setError(err.message || "Refresh failed.")
    } finally {
      setLoading(false)
    }
  }

  const saveEvent = async (event) => {
    event.preventDefault()
    if (!conferenceId) return
    setSaving("event")
    setModalError("")
    setSuccess("")
    try {
      const dayIndex = Number(eventForm.day) - 1
      const selectedDay = dayOptions[dayIndex]
      const targetDate = eventForm.date || selectedDay?.date || ""
      const payload = {
        ...eventForm,
        conferenceId,
        date: targetDate,
        startTime: toDateTime(targetDate, eventForm.startTimeValue),
        endTime: toDateTime(targetDate, eventForm.endTimeValue),
      }
      await fetchJson(editingEventId ? `/api/rec/scanning/events/${editingEventId}` : "/api/rec/scanning/events", {
        method: editingEventId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      setEventForm(emptyEventForm)
      setEditingEventId("")
      setEventModalOpen(false)
      setSuccess(editingEventId ? "Scan event updated." : "Scan event created.")
      try {
        await loadWorkspace()
      } catch (refreshError) {
        setError(refreshError.message || "The scan event was saved, but the event list could not be refreshed.")
      }
    } catch (err) {
      setModalError(err.message || "Failed to save scan event.")
    } finally {
      setSaving("")
    }
  }

  const openNewScanEvent = () => {
    setEditingEventId("")
    setEventForm(emptyEventForm)
    setModalError("")
    setSuccess("")
    setEventModalOpen(true)
  }

  const editScanEvent = (scanEvent) => {
    setEditingEventId(scanEvent.$id)
    setEventForm(mapEventToForm(scanEvent))
    setModalError("")
    setSuccess("")
    setEventModalOpen(true)
  }

  const cancelEventEdit = () => {
    if (saving === "event") return
    setEditingEventId("")
    setEventForm(emptyEventForm)
    setModalError("")
    setEventModalOpen(false)
  }

  const toggleEventStatus = async (scanEvent) => {
    setSaving(scanEvent.$id)
    setError("")
    try {
      await fetchJson(`/api/rec/scanning/events/${scanEvent.$id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !scanEvent.isActive }),
      })
      await loadWorkspace()
    } catch (err) {
      setError(err.message || "Failed to update scan event.")
    } finally {
      setSaving("")
    }
  }

  const toggleEventSelection = (eventId) => {
    setSelectedEventIds((previous) => (
      previous.includes(eventId)
        ? previous.filter((id) => id !== eventId)
        : [...previous, eventId]
    ))
  }

  const toggleAllVisibleEvents = () => {
    setSelectedEventIds((previous) => {
      if (allVisibleEventsSelected) {
        return previous.filter((eventId) => !visibleEventIds.includes(eventId))
      }
      return Array.from(new Set([...previous, ...visibleEventIds]))
    })
  }

  const openBulkEventDelete = (eventIds = selectedEventIds) => {
    const normalizedIds = Array.from(new Set(eventIds.filter(Boolean)))
    if (!normalizedIds.length) return
    setBulkDeleteState({ phase: "confirm", eventIds: normalizedIds, report: null, error: "" })
    setError("")
    setSuccess("")
  }

  const closeBulkEventDelete = () => {
    if (saving === "bulk-delete" || saving === "bulk-force-delete") return
    setBulkDeleteState(null)
  }

  const refreshEventsAfterDeletion = async (deleted = []) => {
    const deletedIds = new Set(deleted.map((item) => item.eventId))
    setSelectedEventIds((previous) => previous.filter((eventId) => !deletedIds.has(eventId)))
    const deletedVisibleCount = visibleEventIds.filter((eventId) => deletedIds.has(eventId)).length
    if (events.length > 0 && deletedVisibleCount === events.length && eventPage > 1) {
      setEventPage((previous) => Math.max(1, previous - 1))
      return
    }
    await loadWorkspace()
  }

  const runBulkEventDelete = async ({ deleteScanData = false } = {}) => {
    if (!bulkDeleteState) return
    const eventIds = deleteScanData
      ? (bulkDeleteState.report?.blocked || []).map((item) => item.eventId)
      : bulkDeleteState.eventIds
    if (!eventIds.length) return

    const savingKey = deleteScanData ? "bulk-force-delete" : "bulk-delete"
    setSaving(savingKey)
    setBulkDeleteState((previous) => ({ ...previous, error: "" }))
    try {
      const report = await fetchJson("/api/rec/scanning/events/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conferenceId,
          eventIds,
          deleteScanData,
          ...(deleteScanData ? { confirmation: destructiveDeleteConfirmation } : {}),
        }),
      })
      await refreshEventsAfterDeletion(report.deleted || [])

      if (!deleteScanData && report.requiresConfirmation) {
        setBulkDeleteState((previous) => ({
          ...previous,
          phase: "review",
          report,
          error: "",
        }))
        return
      }

      const initialReport = deleteScanData ? bulkDeleteState.report : null
      const completedReport = initialReport
        ? {
            requested: initialReport.requested,
            deleteScanData: true,
            deleted: [...(initialReport.deleted || []), ...(report.deleted || [])],
            blocked: report.blocked || [],
            failed: [...(initialReport.failed || []), ...(report.failed || [])],
            scanRecordsDeleted: report.scanRecordsDeleted || 0,
            requiresConfirmation: false,
          }
        : report

      setBulkDeleteState((previous) => ({
        ...previous,
        phase: "complete",
        report: completedReport,
        error: "",
      }))
      const deletedCount = completedReport.deleted?.length || 0
      setSuccess(deletedCount > 0
        ? `${deletedCount} scan event${deletedCount === 1 ? "" : "s"} deleted.`
        : "")
    } catch (err) {
      setBulkDeleteState((previous) => ({
        ...previous,
        error: err.message || "Failed to delete the selected scan events.",
      }))
    } finally {
      setSaving("")
    }
  }

  const deleteScanEvent = (scanEvent) => openBulkEventDelete([scanEvent.$id])

  const generateDefaults = async () => {
    if (!conferenceId) return
    setSaving("defaults")
    setError("")
    setSuccess("")
    try {
      const data = await fetchJson("/api/rec/scanning/events/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conferenceId, includeSessions: true }),
      })
      setSuccess(`Generated ${data.count || 0} default scan events.`)
      await loadWorkspace()
    } catch (err) {
      setError(err.message || "Failed to generate defaults.")
    } finally {
      setSaving("")
    }
  }

  const saveOperator = async (event) => {
    event.preventDefault()
    if (!conferenceId) return
    setSaving("operator")
    setModalError("")
    setSuccess("")
    try {
      const isEditing = Boolean(editingOperatorId)
      await fetchJson(isEditing ? `/api/rec/scanning/operators/${editingOperatorId}` : "/api/rec/scanning/operators", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...operatorForm,
          conferenceId,
          accessStartsAt: toDateTime(operatorForm.accessStartDate, operatorForm.accessStartTime),
          accessEndsAt: toDateTime(operatorForm.accessEndDate, operatorForm.accessEndTime),
        }),
      })
      setOperatorForm(emptyOperatorForm)
      setEditingOperatorId("")
      setOperatorModalOpen(false)
      setSuccess(isEditing ? "Scanner operator updated. Access changes take effect immediately." : "Scanner operator added.")
      try {
        await loadWorkspace()
      } catch (refreshError) {
        setError(refreshError.message || "The scanner operator was saved, but the operator list could not be refreshed.")
      }
    } catch (err) {
      setModalError(err.message || "Failed to save scanner operator.")
    } finally {
      setSaving("")
    }
  }

  const openNewScannerOperator = () => {
    setEditingOperatorId("")
    setOperatorForm(emptyOperatorForm)
    setModalError("")
    setSuccess("")
    setOperatorModalOpen(true)
  }

  const editScannerOperator = (operator) => {
    setEditingOperatorId(operator.$id)
    setOperatorForm(mapOperatorToForm(operator))
    setModalError("")
    setSuccess("")
    setOperatorModalOpen(true)
  }

  const cancelOperatorEdit = () => {
    if (saving === "operator") return
    setEditingOperatorId("")
    setOperatorForm(emptyOperatorForm)
    setModalError("")
    setOperatorModalOpen(false)
  }

  const openTeraRegister = () => {
    setTeraAccessForm(defaultTeraAccessForm(selectedConference))
    setModalError("")
    setError("")
    setSuccess("")
    setTeraModalOpen(true)
  }

  const cancelTeraRegister = () => {
    if (saving === "tera") return
    setTeraModalOpen(false)
    setTeraAccessForm(emptyTeraAccessForm)
    setModalError("")
  }

  const registerTeraScanners = async (event) => {
    event?.preventDefault?.()
    if (!conferenceId) return
    if (hasPartialTeraWindow(teraAccessForm)) {
      setModalError("Enter start date, start time, end date, and end time to apply the same window to every Tera. Leave all four blank to keep each station's current times.")
      return
    }

    const applyWindow = hasCompleteTeraWindow(teraAccessForm)
    setSaving("tera")
    setModalError("")
    setError("")
    setSuccess("")
    try {
      const data = await fetchJson("/api/rec/scanning/operators/sync-tera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conferenceId,
          ...(applyWindow
            ? {
                accessStartsAt: toDateTime(teraAccessForm.accessStartDate, teraAccessForm.accessStartTime),
                accessEndsAt: toDateTime(teraAccessForm.accessEndDate, teraAccessForm.accessEndTime),
              }
            : {}),
          allowedDays: teraAccessForm.allowedDays,
        }),
      })
      setTeraModalOpen(false)
      setTeraAccessForm(emptyTeraAccessForm)
      const created = data.created || 0
      const updated = data.updated || 0
      const windowText = applyWindow || data.appliedAccessWindow
        ? " The same access window was applied to all stations. You can still edit one Tera if it needs different times."
        : " Each station kept the access times already saved on it."
      setSuccess(`${created ? `Registered ${created} new Tera scanner${created === 1 ? "" : "s"} and refreshed ${updated} existing station${updated === 1 ? "" : "s"}.` : `All ${updated} Tera stations are already registered and were refreshed.`}${windowText}`)
      await loadWorkspace()
    } catch (err) {
      setModalError(err.message || "Failed to register Tera barcode scanners.")
    } finally {
      setSaving("")
    }
  }

  const deleteScannerOperator = (operator) => {
    setConfirmDialog({
      title: "Delete scanner operator",
      confirmLabel: "Delete operator",
      busyKey: `operator:${operator.$id}`,
      body: (
        <>
          <p>
            This will remove the operator from the scanner roster, sign out their devices, and invalidate outstanding access codes.
            Historical scan records will be kept.
          </p>
          <div className="rec-confirm-subject">
            <strong>{operator.name || "Unnamed operator"}</strong>
            <span>{operator.email || operator.deviceSerial || "No email on file"}</span>
          </div>
        </>
      ),
      onConfirm: () => performDeleteScannerOperator(operator),
    })
  }

  const performDeleteScannerOperator = async (operator) => {
    const savingKey = `operator:${operator.$id}`
    setSaving(savingKey)
    setError("")
    setSuccess("")
    try {
      const data = await fetchJson(`/api/rec/scanning/operators/${operator.$id}`, { method: "DELETE" })
      const sessionText = data.revokedSessions ? ` ${data.revokedSessions} scanner session${data.revokedSessions === 1 ? " was" : "s were"} revoked.` : ""
      setSuccess(`Scanner operator deleted.${sessionText}`)
      setConfirmDialog(null)
      if (editingOperatorId === operator.$id) cancelOperatorEdit()
      if (operators.length === 1 && operatorPage > 1) {
        setOperatorPage((previous) => Math.max(1, previous - 1))
        return
      }
      await loadWorkspace()
    } catch (err) {
      setError(err.message || "Failed to delete scanner operator.")
      setConfirmDialog(null)
    } finally {
      setSaving("")
    }
  }

  const toggleBadgeSelection = (registrationId) => {
    setSelectedBadgeRegistrations((previous) => (
      previous.includes(registrationId)
        ? previous.filter((id) => id !== registrationId)
        : [...previous, registrationId]
    ))
  }

  const toggleAllVisibleBadges = () => {
    const visibleIds = (badgeRegistry.documents || []).map((row) => row.registration?.$id).filter(Boolean)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedBadgeRegistrations.includes(id))
    setSelectedBadgeRegistrations(allSelected ? [] : visibleIds)
  }

  const issueBadges = async (registrationIds, { sendEmail = true } = {}) => {
    if (!conferenceId || !registrationIds.length) return
    setSaving("badges")
    setError("")
    setSuccess("")
    try {
      const data = await fetchJson("/api/rec/scanning/badges/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conferenceId, registrationIds, sendEmail }),
      })
      const sentText = sendEmail ? " and emailed" : ""
      const failedText = data.failed ? ` ${data.failed} failed.` : ""
      const emailFailedText = data.emailFailed ? ` ${data.emailFailed} email${data.emailFailed === 1 ? "" : "s"} failed to send.` : ""
      setSuccess(`${data.issued || 0} badge${data.issued === 1 ? "" : "s"} generated${sentText}.${failedText}${emailFailedText}`)
      setSelectedBadgeRegistrations([])
      await loadWorkspace()
    } catch (err) {
      setError(err.message || "Failed to generate badges.")
    } finally {
      setSaving("")
    }
  }

  const issueVisibleMissingBadges = () => {
    const missingIds = (badgeRegistry.documents || [])
      .filter((row) => !row.badge?.isActive)
      .map((row) => row.registration?.$id)
      .filter(Boolean)
    issueBadges(missingIds, { sendEmail: true })
  }

  const revokeBadge = (row) => {
    if (!row?.badge?.$id || !conferenceId) return
    const registrantName = row.registration?.name || row.registration?.email || "this registrant"
    setConfirmDialog({
      title: "Revoke badge",
      confirmLabel: "Revoke badge",
      busyKey: row.badge.$id,
      body: (
        <>
          <p>
            Revoking this badge immediately invalidates the printed QR code. The registrant will not be able to pass scan points until a new badge is issued.
          </p>
          <div className="rec-confirm-subject">
            <strong>{registrantName}</strong>
            <span>{row.registration?.email || "No email on file"}</span>
          </div>
        </>
      ),
      onConfirm: () => performRevokeBadge(row),
    })
  }

  const performRevokeBadge = async (row) => {
    setSaving(row.badge.$id)
    setError("")
    setSuccess("")
    try {
      await fetchJson("/api/rec/scanning/badges/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conferenceId,
          registrationId: row.registration?.$id,
          tokenId: row.badge.$id,
          reason: "Revoked from scanner badge registry",
        }),
      })
      setSuccess("Badge revoked.")
      setConfirmDialog(null)
      await loadWorkspace()
    } catch (err) {
      setError(err.message || "Failed to revoke badge.")
      setConfirmDialog(null)
    } finally {
      setSaving("")
    }
  }

  if (!hasRecAccess && !isSenior) {
    return (
      <AccessMessage title="Access Restricted">
        <p>You do not have permission to access REC scanning setup.</p>
      </AccessMessage>
    )
  }

  if (!canManageRec && !isSenior) {
    return (
      <AccessMessage title="Insufficient Access">
        <p>
          You have <strong>{permissionLevel}</strong> access. Scanning setup requires manage access or senior manager access.
        </p>
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
            <span>Scanning</span>
          </div>
          <h2 className="rec-header-gradient mb-2">QR Scanning Control</h2>
          <p className="rec-muted mb-0">
            Configure conference scan points, external scanner access, badge tokens, and live attendance analytics.
          </p>
        </div>
        <div className="rec-page-actions">
          <Link href="/rec-scanner" target="_blank" className="rec-btn rec-btn-primary">
            <FontAwesomeIcon icon={faQrcode} />
            Open Scanner
          </Link>
          <button type="button" className="rec-icon-button" onClick={refresh} aria-label="Refresh scanning setup">
            <FontAwesomeIcon icon={faRefresh} />
          </button>
        </div>
      </div>

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

      <section className="rec-panel mb-4">
        <div className="rec-panel-body">
          <div className="rec-scanning-topbar">
            <div className="rec-field">
              <label className="rec-label" htmlFor="scan-conference">Conference</label>
              <select
                id="scan-conference"
                className="rec-select"
                value={conferenceId}
                onChange={(event) => {
                  setConferenceId(event.target.value)
                  setEditingEventId("")
                  setEventForm(emptyEventForm)
                  setEventModalOpen(false)
                  setEventPage(1)
                  setSelectedEventIds([])
                  setBulkDeleteState(null)
                  setEditingOperatorId("")
                  setOperatorForm(emptyOperatorForm)
                  setOperatorModalOpen(false)
                  setOperatorPage(1)
                  setModalError("")
                  setBadgePage(1)
                  setSelectedBadgeRegistrations([])
                }}
              >
                {conferences.map((conference) => (
                  <option key={conference.$id} value={conference.$id}>
                    {conference.title || formatRecEdition(conference.year)} {conference.isActive ? "(Active)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="rec-scanning-tabs" role="tablist" aria-label="Scanning management tabs">
              {[
                ["events", faIdBadge, "Scan Events"],
                ["operators", faUsersGear, "Scanner Operators"],
                ["badges", faQrcode, "Badge Registry"],
                ["analytics", faChartLine, "Analytics"],
              ].map(([key, icon, label]) => (
                <Link
                  key={key}
                  href={`/dashboard/rec-conference/admin/scanning/${key}${conferenceId ? `?conferenceId=${encodeURIComponent(conferenceId)}` : ""}`}
                  className={activeView === key ? "active" : ""}
                  aria-current={activeView === key ? "page" : undefined}
                >
                  <FontAwesomeIcon icon={icon} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rec-spinner-wrap">
          <div className="rec-spinner" />
          <p className="mt-3">Loading scanning workspace...</p>
        </div>
      ) : (
        <>
          {activeView === "events" && (
            <section className="rec-panel">
              <div className="rec-panel-header rec-scanning-list-header">
                <div>
                  <h3 className="rec-panel-title">
                    <FontAwesomeIcon icon={faIdBadge} />
                    Configured Events
                  </h3>
                  <p className="rec-muted mb-0 mt-1">Manage scan points and select multiple events for controlled deletion.</p>
                </div>
                <div className="rec-page-actions">
                  {selectedEventIds.length > 0 && (
                    <button type="button" className="rec-btn rec-btn-accent" onClick={() => openBulkEventDelete()}>
                      <FontAwesomeIcon icon={faTrash} />
                      Delete selected ({selectedEventIds.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className="rec-btn rec-btn-outline"
                    onClick={generateDefaults}
                    disabled={saving === "defaults" || !conferenceId}
                  >
                    {saving === "defaults" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faWandMagicSparkles} />}
                    Generate Defaults
                  </button>
                  <button type="button" className="rec-btn rec-btn-primary" onClick={openNewScanEvent}>
                    <FontAwesomeIcon icon={faPlus} />
                    New Scan Event
                  </button>
                </div>
              </div>
              <div className="rec-panel-body">
                <div className="rec-scanning-selection-bar">
                  <label className="rec-checkbox-option rec-scanning-select-page">
                    <input
                      type="checkbox"
                      checked={allVisibleEventsSelected}
                      onChange={toggleAllVisibleEvents}
                      disabled={!visibleEventIds.length}
                    />
                    Select this page
                  </label>
                  <div className="rec-page-actions">
                    <label className="rec-inline-control">
                      <span>Rows</span>
                      <select
                        className="rec-select"
                        value={eventLimit}
                        onChange={(event) => {
                          setEventLimit(Number(event.target.value))
                          setEventPage(1)
                        }}
                      >
                        {[10, 25, 50, 100].map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                    <span className="rec-permission-badge">{eventPager.total || 0} events</span>
                  </div>
                </div>
                <div className="rec-scanning-list">
                  {events.length === 0 ? (
                    <div className="rec-empty-state-compact">No scan events have been configured yet.</div>
                  ) : events.map((scanEvent) => {
                    const isSelected = selectedEventIds.includes(scanEvent.$id)
                    return (
                      <article key={scanEvent.$id} className={`rec-scanning-row rec-scanning-row-selectable${isSelected ? " is-selected" : ""}`}>
                        <label className="rec-scanning-row-selector" title={`Select ${scanEvent.name}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEventSelection(scanEvent.$id)}
                            aria-label={`Select ${scanEvent.name}`}
                          />
                        </label>
                        <div className="rec-scanning-row-content">
                          <div className="rec-row-title">{scanEvent.name}</div>
                          <div className="rec-row-desc">
                            {typeLabels[scanEvent.type] || scanEvent.type} · {ruleLabels[scanEvent.scanRule] || scanEvent.scanRule}
                            {scanEvent.venue ? ` · ${scanEvent.venue}` : ""}
                          </div>
                          <div className="rec-chip-list mt-2">
                            {scanEvent.day && <span className="rec-chip">Day {scanEvent.day}</span>}
                            {scanEvent.date && <span className="rec-chip">{scanEvent.date}</span>}
                            {scanEvent.startTime && <span className="rec-chip">{formatDate(scanEvent.startTime)}</span>}
                            {scanEvent.endTime && <span className="rec-chip">Ends {formatDate(scanEvent.endTime)}</span>}
                            <span className={`rec-status ${scanEvent.isCurrentlyOpen ? "rec-status-published" : "rec-status-draft"}`}>
                              {scanEvent.isCurrentlyOpen ? "Open now" : scanEvent.availabilityCode === "event_not_started" ? "Not started" : scanEvent.availabilityCode === "event_ended" ? "Ended" : "No time window"}
                            </span>
                          </div>
                        </div>
                        <div className="rec-row-actions">
                          <button
                            type="button"
                            className="rec-btn rec-btn-outline"
                            onClick={() => editScanEvent(scanEvent)}
                            disabled={saving === scanEvent.$id}
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`rec-btn ${scanEvent.isActive ? "rec-btn-outline" : "rec-btn-primary"}`}
                            onClick={() => toggleEventStatus(scanEvent)}
                            disabled={saving === scanEvent.$id}
                          >
                            {saving === scanEvent.$id ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCheckCircle} />}
                            {scanEvent.isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            className="rec-btn rec-btn-accent"
                            onClick={() => deleteScanEvent(scanEvent)}
                            disabled={saving === scanEvent.$id}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                            Delete
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
                <div className="rec-pagination-bar">
                  <span className="rec-muted">
                    Showing page {eventPager.page || eventPage} of {eventPager.totalPages || 1} · {eventPager.total || 0} configured
                    {selectedEventIds.length > 0 ? ` · ${selectedEventIds.length} selected` : ""}
                  </span>
                  <div className="rec-page-actions">
                    <button
                      type="button"
                      className="rec-btn rec-btn-outline"
                      disabled={eventPage <= 1 || loading}
                      onClick={() => setEventPage((previous) => Math.max(1, previous - 1))}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="rec-btn rec-btn-outline"
                      disabled={eventPage >= (eventPager.totalPages || 1) || loading}
                      onClick={() => setEventPage((previous) => Math.min(eventPager.totalPages || 1, previous + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeView === "operators" && (
            <section className="rec-panel">
                <div className="rec-panel-header rec-scanning-list-header">
                  <div>
                    <h3 className="rec-panel-title">
                      <FontAwesomeIcon icon={faUsersGear} />
                      Scanner Operators
                    </h3>
                    <p className="rec-muted mb-0 mt-1">
                      Four Teras sit at main entrance and six in halls. Exhibition, Rwizi, and Kazinga use phone scanners: add their email here, then they sign in with the emailed code.
                    </p>
                  </div>
                  <div className="rec-page-actions">
                    <label className="rec-inline-control">
                      <span>Rows</span>
                      <select
                        className="rec-select"
                        value={operatorLimit}
                        onChange={(event) => {
                          setOperatorLimit(Number(event.target.value))
                          setOperatorPage(1)
                        }}
                      >
                        {[10, 25, 50, 100].map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                    <span className="rec-permission-badge">{operatorPager.total || 0} operators</span>
                    <button
                      type="button"
                      className="rec-btn rec-btn-outline"
                      onClick={openTeraRegister}
                      disabled={saving === "tera" || !conferenceId}
                    >
                      {saving === "tera" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faBarcode} />}
                      Register Tera Scanners
                    </button>
                    <button type="button" className="rec-btn rec-btn-primary" onClick={openNewScannerOperator}>
                      <FontAwesomeIcon icon={faPlus} />
                      Add Scanner Operator
                    </button>
                  </div>
                </div>
                <div className="rec-panel-body">
                  <div className="rec-scanning-list">
                    {operators.length === 0 ? (
                      <div className="rec-empty-state-compact">No scanners have been added. Register the Tera barcode scanners or add an operator.</div>
                    ) : operators.map((operator) => (
                      <article key={operator.$id} className="rec-scanning-row">
                        <div>
                          <div className="rec-row-title">{operator.name}</div>
                          <div className="rec-row-desc">
                            {operator.deviceKind === "tera_hid"
                              ? `Tera HW0009 · SN ${operator.deviceSerial || operator.phone}`
                              : `${operator.email}${operator.organization ? ` · ${operator.organization}` : ""}`}
                          </div>
                          <div className="rec-chip-list mt-2">
                            <span className={`rec-status ${operator.status === "active" ? "rec-status-published" : "rec-status-archived"}`}>
                              {operator.status}
                            </span>
                            {operator.deviceKind === "tera_hid" && <span className="rec-chip">Barcode scanner</span>}
                            {operator.allowedEventTypes.length
                              ? operator.allowedEventTypes.map((type) => (
                                  <span key={type} className="rec-chip">{typeLabels[type] || type}</span>
                                ))
                              : <span className="rec-chip">All event types</span>}
                            {operator.allowedEventIds.length > 0 && (
                              <span className="rec-chip">{operator.allowedEventIds.length} assigned event{operator.allowedEventIds.length === 1 ? "" : "s"}</span>
                            )}
                            {operator.allowedVenues.length > 0 && <span className="rec-chip">{formatList(operator.allowedVenues)}</span>}
                            {operator.allowedDays.length > 0 && <span className="rec-chip">Days {formatList(operator.allowedDays)}</span>}
                          </div>
                          <div className="rec-row-desc mt-2">
                            {operatorAccessSummary(operator)}
                          </div>
                          {operator.deviceKind === "tera_hid" && (
                            <div className="rec-row-desc mt-1">
                              Unlocks at /rec-scanner by scanning this serial, then records against assigned events
                            </div>
                          )}
                        </div>
                        <div className="rec-row-actions">
                          <button
                            type="button"
                            className="rec-btn rec-btn-outline"
                            onClick={() => editScannerOperator(operator)}
                            disabled={saving === `operator:${operator.$id}` || saving === "operator"}
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rec-btn rec-btn-accent"
                            onClick={() => deleteScannerOperator(operator)}
                            disabled={saving === `operator:${operator.$id}` || saving === "operator"}
                          >
                            {saving === `operator:${operator.$id}` ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTrash} />}
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="rec-pagination-bar">
                    <span className="rec-muted">
                      Showing page {operatorPager.page || operatorPage} of {operatorPager.totalPages || 1} · {operatorPager.total || 0} configured
                    </span>
                    <div className="rec-page-actions">
                      <button
                        type="button"
                        className="rec-btn rec-btn-outline"
                        disabled={operatorPage <= 1 || loading}
                        onClick={() => setOperatorPage((previous) => Math.max(1, previous - 1))}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="rec-btn rec-btn-outline"
                        disabled={operatorPage >= (operatorPager.totalPages || 1) || loading}
                        onClick={() => setOperatorPage((previous) => Math.min(operatorPager.totalPages || 1, previous + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </section>
          )}

          {activeView === "badges" && (
            <section className="rec-panel">
              <div className="rec-panel-header">
                <div>
                  <h3 className="rec-panel-title">
                    <FontAwesomeIcon icon={faQrcode} />
                    Badge Registry
                  </h3>
                  <p className="rec-muted mb-0 mt-1">
                    Generate digital QR badges for registrants, email secure badge links, and revoke active badges when needed.
                  </p>
                </div>
                <div className="rec-page-actions">
                  <button
                    type="button"
                    className="rec-btn rec-btn-outline"
                    onClick={issueVisibleMissingBadges}
                    disabled={saving === "badges" || !(badgeRegistry.documents || []).some((row) => !row.badge?.isActive)}
                  >
                    {saving === "badges" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faPaperPlane} />}
                    Generate Visible Missing
                  </button>
                  <button
                    type="button"
                    className="rec-btn rec-btn-primary"
                    onClick={() => issueBadges(selectedBadgeRegistrations, { sendEmail: true })}
                    disabled={saving === "badges" || selectedBadgeRegistrations.length === 0}
                  >
                    {saving === "badges" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faEnvelope} />}
                    Generate Selected ({selectedBadgeRegistrations.length})
                  </button>
                </div>
              </div>
              <div className="rec-panel-body">
                <div className="rec-badge-stats">
                  <div className="rec-stat-tile">
                    <span className="rec-stat-number">{badgeRegistry.counts?.total || 0}</span>
                    <span className="rec-stat-label">Registered</span>
                  </div>
                  <div className="rec-stat-tile">
                    <span className="rec-stat-number">{badgeRegistry.counts?.withBadge || 0}</span>
                    <span className="rec-stat-label">With QR badge</span>
                  </div>
                  <div className="rec-stat-tile">
                    <span className="rec-stat-number">{badgeRegistry.counts?.withoutBadge || 0}</span>
                    <span className="rec-stat-label">Without QR badge</span>
                  </div>
                  <div className="rec-stat-tile">
                    <span className="rec-stat-number">{badgeRegistry.counts?.revoked || 0}</span>
                    <span className="rec-stat-label">Revoked</span>
                  </div>
                </div>

                <div className="rec-registration-toolbar rec-badge-toolbar">
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="badge-status-filter">Badge Status</label>
                    <select
                      id="badge-status-filter"
                      className="rec-select"
                      value={badgeStatus}
                      onChange={(event) => {
                        setBadgeStatus(event.target.value)
                        setBadgePage(1)
                        setSelectedBadgeRegistrations([])
                      }}
                    >
                      <option value="without_badge">Without QR Badge</option>
                      <option value="with_badge">With QR Badge</option>
                      <option value="revoked">Revoked</option>
                      <option value="all">All Registrants</option>
                    </select>
                  </div>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="badge-page-size">Rows</label>
                    <select
                      id="badge-page-size"
                      className="rec-select"
                      value={badgeLimit}
                      onChange={(event) => {
                        setBadgeLimit(Number(event.target.value))
                        setBadgePage(1)
                        setSelectedBadgeRegistrations([])
                      }}
                    >
                      {[10, 25, 50, 100].map((size) => (
                        <option key={size} value={size}>{size} per page</option>
                      ))}
                    </select>
                  </div>
                  <form
                    className="rec-field rec-badge-search"
                    onSubmit={(event) => {
                      event.preventDefault()
                      setBadgeSearch(badgeSearchInput)
                      setBadgePage(1)
                      setSelectedBadgeRegistrations([])
                    }}
                  >
                    <label className="rec-label" htmlFor="badge-search">Search Registrants</label>
                    <div className="rec-search">
                      <FontAwesomeIcon icon={faQrcode} />
                      <input
                        id="badge-search"
                        className="rec-input"
                        value={badgeSearchInput}
                        onChange={(event) => setBadgeSearchInput(event.target.value)}
                        placeholder="Name, email, organization..."
                      />
                      <button type="submit" className="rec-btn rec-btn-outline">Search</button>
                    </div>
                  </form>
                </div>

                {(badgeRegistry.documents || []).length === 0 ? (
                  <div className="rec-empty-state">
                    <FontAwesomeIcon icon={faQrcode} size="2x" />
                    <h4 className="rec-empty-title">No badge records found</h4>
                    <p>Change the badge status filter or search term.</p>
                  </div>
                ) : (
                  <div className="rec-table-wrap rec-responsive-table mt-3">
                    <table className="rec-table rec-badge-registry-table">
                      <thead>
                        <tr>
                          <th>
                            <button type="button" className="rec-table-check" onClick={toggleAllVisibleBadges} aria-label="Select visible registrants">
                              <FontAwesomeIcon
                                icon={
                                  (badgeRegistry.documents || []).length > 0 &&
                                  (badgeRegistry.documents || []).every((row) => selectedBadgeRegistrations.includes(row.registration?.$id))
                                    ? faSquareCheck
                                    : faSquare
                                }
                              />
                            </button>
                          </th>
                          <th>Registrant</th>
                          <th>Type</th>
                          <th>Badge</th>
                          <th>Last Email</th>
                          <th>Badge Link</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(badgeRegistry.documents || []).map((row) => {
                          const registration = row.registration || {}
                          const badge = row.badge || null
                          const selected = selectedBadgeRegistrations.includes(registration.$id)
                          const badgeViewPath = getRecBadgeViewPath(badge?.lastBadgeUrl)
                          return (
                            <tr key={registration.$id}>
                              <td data-label="Select">
                                <button
                                  type="button"
                                  className="rec-table-check"
                                  onClick={() => toggleBadgeSelection(registration.$id)}
                                  aria-label={`Select ${registration.name || registration.email || "registrant"}`}
                                >
                                  <FontAwesomeIcon icon={selected ? faSquareCheck : faSquare} />
                                </button>
                              </td>
                              <td data-label="Registrant">
                                <div className="rec-row-title">{registration.name || "Unnamed registrant"}</div>
                                <div className="rec-row-desc">{registration.email || "No email"}</div>
                                {registration.organization && <div className="rec-row-desc">{registration.organization}</div>}
                              </td>
                              <td data-label="Type">
                                <span className="rec-chip">{registration.registrationType || "Unknown"}</span>
                              </td>
                              <td data-label="Badge">
                                {badge?.isActive ? (
                                  <span className="rec-status rec-status-published">Active</span>
                                ) : badge?.revokedAt ? (
                                  <span className="rec-status rec-status-archived">Revoked</span>
                                ) : (
                                  <span className="rec-status rec-status-draft">Not generated</span>
                                )}
                                {badge?.issuedAt && (
                                  <div className="rec-row-desc mt-1">Issued {formatDate(badge.issuedAt)}</div>
                                )}
                                {badge?.badgeNumberLabel && (
                                  <div className="rec-row-desc mt-1">No. {badge.badgeNumberLabel}</div>
                                )}
                              </td>
                              <td data-label="Last Email">
                                {badge?.lastEmailSentAt ? (
                                  <>
                                    <div>{formatDate(badge.lastEmailSentAt)}</div>
                                    <div className="rec-row-desc">{badge.lastEmailSentTo || registration.email}</div>
                                  </>
                                ) : (
                                  <span className="rec-muted">Not emailed</span>
                                )}
                              </td>
                              <td data-label="Badge Link">
                                {badge?.isActive && badgeViewPath ? (
                                  <a href={badgeViewPath} target="_blank" rel="noopener noreferrer" className="rec-inline-link">
                                    <FontAwesomeIcon icon={faLink} />
                                    Open
                                  </a>
                                ) : (
                                  <span className="rec-muted">Unavailable</span>
                                )}
                              </td>
                              <td data-label="Actions">
                                <div className="rec-row-actions">
                                  <button
                                    type="button"
                                    className="rec-btn rec-btn-outline rec-btn-sm"
                                    onClick={() => issueBadges([registration.$id], { sendEmail: true })}
                                    disabled={saving === "badges"}
                                  >
                                    <FontAwesomeIcon icon={faEnvelope} />
                                    {badge?.isActive ? "Reissue" : "Generate"}
                                  </button>
                                  {badge?.isActive && (
                                    <button
                                      type="button"
                                      className="rec-btn rec-btn-accent rec-btn-sm"
                                      onClick={() => revokeBadge(row)}
                                      disabled={saving === badge.$id}
                                    >
                                      {saving === badge.$id ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faBan} />}
                                      Revoke
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="rec-pagination-bar">
                  <span className="rec-muted">
                    Showing page {badgeRegistry.page || badgePage} of {badgeRegistry.totalPages || 1} · {badgeRegistry.total || 0} matched
                  </span>
                  <div className="rec-page-actions">
                    <button
                      type="button"
                      className="rec-btn rec-btn-outline"
                      disabled={badgePage <= 1 || loading}
                      onClick={() => {
                        setBadgePage((previous) => Math.max(1, previous - 1))
                        setSelectedBadgeRegistrations([])
                      }}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="rec-btn rec-btn-outline"
                      disabled={badgePage >= (badgeRegistry.totalPages || 1) || loading}
                      onClick={() => {
                        setBadgePage((previous) => Math.min(badgeRegistry.totalPages || 1, previous + 1))
                        setSelectedBadgeRegistrations([])
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

        </>
      )}

      {eventModalOpen && (
        <ScannerManagementModal
          modalId="scan-event-editor"
          title={editingEventId ? "Edit Scan Event" : "Create Scan Event"}
          busy={saving === "event"}
          onClose={cancelEventEdit}
          footer={(
            <>
              <button type="button" className="rec-btn rec-btn-outline" onClick={cancelEventEdit} disabled={saving === "event"}>
                Cancel
              </button>
              <button type="submit" form="scan-event-editor-form" className="rec-btn rec-btn-primary" disabled={saving === "event"}>
                {saving === "event" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
                {editingEventId ? "Update Scan Event" : "Create Scan Event"}
              </button>
            </>
          )}
        >
          <form id="scan-event-editor-form" className="rec-grid" onSubmit={saveEvent}>
            {modalError && (
              <div className="rec-alert rec-alert-danger">
                <p className="mb-0">{modalError}</p>
              </div>
            )}
            <div className="rec-field">
              <label className="rec-label" htmlFor="scan-event-name">Event Name</label>
              <input
                id="scan-event-name"
                className="rec-input"
                value={eventForm.name}
                onChange={(event) => setEventForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Main Entrance - Day 1"
                autoFocus
                required
              />
            </div>
            <div className="rec-grid rec-grid-two">
              <div className="rec-field">
                <label className="rec-label" htmlFor="scan-event-type">Type</label>
                <select
                  id="scan-event-type"
                  className="rec-select"
                  value={eventForm.type}
                  onChange={(event) => setEventForm((previous) => ({ ...previous, type: event.target.value }))}
                >
                  {eventTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              <div className="rec-field">
                <label className="rec-label" htmlFor="scan-event-rule">Rule</label>
                <select
                  id="scan-event-rule"
                  className="rec-select"
                  value={eventForm.scanRule}
                  onChange={(event) => setEventForm((previous) => ({ ...previous, scanRule: event.target.value }))}
                >
                  {scanRules.map((rule) => <option key={rule.value} value={rule.value}>{rule.label}</option>)}
                </select>
                <small className="rec-field-help">
                  {eventForm.scanRule === "multiple"
                    ? "Every valid scan is accepted and recorded."
                    : "A repeat scan is reported without creating another scan record."}
                </small>
              </div>
            </div>
            <div className="rec-grid rec-grid-two">
              <div className="rec-field">
                <label className="rec-label" htmlFor="scan-event-day">Conference Day</label>
                <select
                  id="scan-event-day"
                  className="rec-select"
                  value={eventForm.day}
                  onChange={(event) => {
                    const nextDay = event.target.value
                    const day = dayOptions[Number(nextDay) - 1]
                    setEventForm((previous) => ({ ...previous, day: nextDay, date: day?.date || previous.date }))
                  }}
                >
                  <option value="">No specific day</option>
                  {dayOptions.map((day, index) => (
                    <option key={day.date || day.label || index} value={index + 1}>
                      Day {index + 1} {day.label ? `- ${day.label}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rec-field">
                <label className="rec-label" htmlFor="scan-event-date">Date</label>
                <input
                  id="scan-event-date"
                  className="rec-input"
                  type="date"
                  value={eventForm.date}
                  onChange={(event) => setEventForm((previous) => ({ ...previous, date: event.target.value }))}
                />
              </div>
            </div>
            <div className="rec-grid rec-grid-two">
              <div className="rec-field">
                <label className="rec-label" htmlFor="scan-event-start">Start Time</label>
                <input
                  id="scan-event-start"
                  className="rec-input"
                  type="time"
                  value={eventForm.startTimeValue}
                  onChange={(event) => setEventForm((previous) => ({ ...previous, startTimeValue: event.target.value }))}
                />
              </div>
              <div className="rec-field">
                <label className="rec-label" htmlFor="scan-event-end">End Time</label>
                <input
                  id="scan-event-end"
                  className="rec-input"
                  type="time"
                  value={eventForm.endTimeValue}
                  onChange={(event) => setEventForm((previous) => ({ ...previous, endTimeValue: event.target.value }))}
                />
              </div>
            </div>
            <div className="rec-field">
              <label className="rec-label" htmlFor="scan-event-venue">Venue</label>
              <input
                id="scan-event-venue"
                className="rec-input"
                value={eventForm.venue}
                onChange={(event) => setEventForm((previous) => ({ ...previous, venue: event.target.value }))}
                placeholder="Achwa Hall, Exhibition Area, Main Gate..."
              />
            </div>
          </form>
        </ScannerManagementModal>
      )}

      {teraModalOpen && (
        <ScannerManagementModal
          modalId="tera-scanner-register"
          title="Register Tera Scanners"
          busy={saving === "tera"}
          onClose={cancelTeraRegister}
          footer={(
            <>
              <button type="button" className="rec-btn rec-btn-outline" onClick={cancelTeraRegister} disabled={saving === "tera"}>
                Cancel
              </button>
              <button type="submit" form="tera-scanner-register-form" className="rec-btn rec-btn-primary" disabled={saving === "tera"}>
                {saving === "tera" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faBarcode} />}
                Save Access Window
              </button>
            </>
          )}
        >
          <form id="tera-scanner-register-form" className="rec-grid" onSubmit={registerTeraScanners}>
            {modalError && (
              <div className="rec-alert rec-alert-danger">
                <p className="mb-0">{modalError}</p>
              </div>
            )}
            <p className="rec-muted mb-0">
              These 10 Teras are already assigned to halls. Use this form to refresh them, not to pick a hall.
              Leave all date and time fields blank to keep each station&apos;s current access window.
              Fill start date, start time, end date, and end time to give every Tera the same window.
              To change only one unit, close this and use Edit on that station.
            </p>
            <AccessWindowFields
              idPrefix="tera-access"
              startDate={teraAccessForm.accessStartDate}
              startTime={teraAccessForm.accessStartTime}
              endDate={teraAccessForm.accessEndDate}
              endTime={teraAccessForm.accessEndTime}
              onChange={({ startDate, startTime, endDate, endTime }) => {
                setTeraAccessForm((previous) => ({
                  ...previous,
                  ...(startDate !== undefined ? { accessStartDate: startDate } : {}),
                  ...(startTime !== undefined ? { accessStartTime: startTime } : {}),
                  ...(endDate !== undefined ? { accessEndDate: endDate } : {}),
                  ...(endTime !== undefined ? { accessEndTime: endTime } : {}),
                }))
              }}
            />
            {dayOptions.length > 0 && (
              <div>
                <span className="rec-label">Allowed Conference Days</span>
                <div className="rec-checkbox-grid rec-checkbox-grid-compact">
                  {dayOptions.map((day, index) => {
                    const dayValue = String(index + 1)
                    return (
                      <label key={dayValue} className="rec-checkbox-option">
                        <input
                          type="checkbox"
                          checked={teraAccessForm.allowedDays.includes(dayValue)}
                          onChange={(event) => {
                            setTeraAccessForm((previous) => ({
                              ...previous,
                              allowedDays: event.target.checked
                                ? [...previous.allowedDays, dayValue]
                                : previous.allowedDays.filter((value) => value !== dayValue),
                            }))
                          }}
                        />
                        {day.label || day.name || `Day ${dayValue}`}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </form>
        </ScannerManagementModal>
      )}

      {operatorModalOpen && (
        <ScannerManagementModal
          modalId="scanner-operator-editor"
          title={editingOperatorId
            ? (isTeraOperatorEmail(operatorForm.email) ? "Edit Tera Scanner" : "Edit Scanner Operator")
            : "Add Scanner Operator"}
          busy={saving === "operator"}
          onClose={cancelOperatorEdit}
          footer={(
            <>
              <button type="button" className="rec-btn rec-btn-outline" onClick={cancelOperatorEdit} disabled={saving === "operator"}>
                Cancel
              </button>
              <button type="submit" form="scanner-operator-editor-form" className="rec-btn rec-btn-primary" disabled={saving === "operator"}>
                {saving === "operator" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
                {editingOperatorId
                  ? (isTeraOperatorEmail(operatorForm.email) ? "Update Tera Scanner" : "Update Operator")
                  : "Add Operator"}
              </button>
            </>
          )}
        >
          <form id="scanner-operator-editor-form" className="rec-grid" onSubmit={saveOperator}>
            {modalError && (
              <div className="rec-alert rec-alert-danger">
                <p className="mb-0">{modalError}</p>
              </div>
            )}
            <div>
              <span className="rec-label">Access window</span>
              <p className="rec-muted mb-2">
                {isTeraOperatorEmail(operatorForm.email)
                  ? "Change the start and end times here. Serial, email, and hall stay locked because they belong to the hardware."
                  : "Scans outside this window are blocked. Leave blank for no time limit."}
              </p>
              <AccessWindowFields
                idPrefix="scanner-access"
                startDate={operatorForm.accessStartDate}
                startTime={operatorForm.accessStartTime}
                endDate={operatorForm.accessEndDate}
                endTime={operatorForm.accessEndTime}
                autoFocus={isTeraOperatorEmail(operatorForm.email)}
                onChange={({ startDate, startTime, endDate, endTime }) => {
                  setOperatorForm((previous) => ({
                    ...previous,
                    ...(startDate !== undefined ? { accessStartDate: startDate } : {}),
                    ...(startTime !== undefined ? { accessStartTime: startTime } : {}),
                    ...(endDate !== undefined ? { accessEndDate: endDate } : {}),
                    ...(endTime !== undefined ? { accessEndTime: endTime } : {}),
                  }))
                }}
              />
            </div>
            <div className="rec-grid rec-grid-two">
              <div className="rec-field">
                <label className="rec-label" htmlFor="scanner-name">Name</label>
                <input
                  id="scanner-name"
                  className="rec-input"
                  value={operatorForm.name}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, name: event.target.value }))}
                  autoFocus={!isTeraOperatorEmail(operatorForm.email)}
                  required
                />
              </div>
              <div className="rec-field">
                <label className="rec-label" htmlFor="scanner-email">Email</label>
                <input
                  id="scanner-email"
                  className="rec-input"
                  type="email"
                  value={operatorForm.email}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, email: event.target.value }))}
                  required
                  readOnly={isTeraOperatorEmail(operatorForm.email)}
                />
              </div>
            </div>
            <div className="rec-grid rec-grid-two">
              <div className="rec-field">
                <label className="rec-label" htmlFor="scanner-organization">Organization</label>
                <input
                  id="scanner-organization"
                  className="rec-input"
                  value={operatorForm.organization}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, organization: event.target.value }))}
                  readOnly={isTeraOperatorEmail(operatorForm.email)}
                />
              </div>
              <div className="rec-field">
                <label className="rec-label" htmlFor="scanner-phone">{isTeraOperatorEmail(operatorForm.email) ? "Serial" : "Phone"}</label>
                <input
                  id="scanner-phone"
                  className="rec-input"
                  value={operatorForm.phone}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, phone: event.target.value }))}
                  readOnly={isTeraOperatorEmail(operatorForm.email)}
                />
              </div>
            </div>
            <div className="rec-grid rec-grid-two">
              <div className="rec-field">
                <label className="rec-label" htmlFor="scanner-status">Access Status</label>
                <select
                  id="scanner-status"
                  className="rec-select"
                  value={operatorForm.status}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, status: event.target.value }))}
                >
                  {operatorStatuses.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </div>
              <div className="rec-field">
                <label className="rec-label" htmlFor="scanner-venue">Restrict to Venue</label>
                <select
                  id="scanner-venue"
                  className="rec-select"
                  value={operatorForm.allowedVenues[0] || ""}
                  onChange={(event) => setOperatorForm((previous) => ({ ...previous, allowedVenues: event.target.value ? [event.target.value] : [] }))}
                  disabled={isTeraOperatorEmail(operatorForm.email)}
                >
                  <option value="">All venues</option>
                  {venueOptions.map((venue) => <option key={venue} value={venue}>{venue}</option>)}
                </select>
              </div>
            </div>
            <div>
              <span className="rec-label">Allowed Event Types</span>
              <div className="rec-checkbox-grid rec-checkbox-grid-compact">
                {eventTypes.map((type) => (
                  <label key={type.value} className="rec-checkbox-option">
                    <input
                      type="checkbox"
                      checked={operatorForm.allowedEventTypes.includes(type.value)}
                      onChange={(event) => {
                        setOperatorForm((previous) => ({
                          ...previous,
                          allowedEventTypes: event.target.checked
                            ? [...previous.allowedEventTypes, type.value]
                            : previous.allowedEventTypes.filter((value) => value !== type.value),
                        }))
                      }}
                    />
                    {type.label}
                  </label>
                ))}
              </div>
            </div>
            {events.length > 0 && (
              <div>
                <span className="rec-label">Assigned Scan Events</span>
                <p className="rec-muted mb-2">Leave all unchecked to allow every event of the selected types. Check specific events to lock this Tera/operator to those points only.</p>
                <div className="rec-checkbox-grid rec-checkbox-grid-compact">
                  {events.map((scanEvent) => (
                    <label key={scanEvent.$id} className="rec-checkbox-option">
                      <input
                        type="checkbox"
                        checked={operatorForm.allowedEventIds.includes(scanEvent.$id)}
                        onChange={(event) => {
                          setOperatorForm((previous) => ({
                            ...previous,
                            allowedEventIds: event.target.checked
                              ? [...previous.allowedEventIds, scanEvent.$id]
                              : previous.allowedEventIds.filter((value) => value !== scanEvent.$id),
                          }))
                        }}
                      />
                      {scanEvent.name} {scanEvent.venue ? `· ${scanEvent.venue}` : ""}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {dayOptions.length > 0 && (
              <div>
                <span className="rec-label">Allowed Conference Days</span>
                <div className="rec-checkbox-grid rec-checkbox-grid-compact">
                  {dayOptions.map((day, index) => {
                    const dayValue = String(index + 1)
                    return (
                      <label key={dayValue} className="rec-checkbox-option">
                        <input
                          type="checkbox"
                          checked={operatorForm.allowedDays.includes(dayValue)}
                          onChange={(event) => {
                            setOperatorForm((previous) => ({
                              ...previous,
                              allowedDays: event.target.checked
                                ? [...previous.allowedDays, dayValue]
                                : previous.allowedDays.filter((value) => value !== dayValue),
                            }))
                          }}
                        />
                        {day.label || day.name || `Day ${dayValue}`}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </form>
        </ScannerManagementModal>
      )}

      {bulkDeleteState && (
        <ScannerManagementModal
          modalId="scan-event-bulk-delete"
          title={bulkDeleteState.phase === "confirm"
            ? "Delete Selected Scan Events"
            : bulkDeleteState.phase === "review"
              ? "Review Protected Scan Events"
              : "Scan Event Deletion Report"}
          busy={saving === "bulk-delete" || saving === "bulk-force-delete"}
          onClose={closeBulkEventDelete}
          footer={bulkDeleteState.phase === "confirm" ? (
            <>
              <button type="button" className="rec-btn rec-btn-outline" onClick={closeBulkEventDelete} disabled={saving === "bulk-delete"}>
                Cancel
              </button>
              <button type="button" className="rec-btn rec-btn-accent" onClick={() => runBulkEventDelete()} disabled={saving === "bulk-delete"}>
                {saving === "bulk-delete" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTrash} />}
                Check and Delete
              </button>
            </>
          ) : bulkDeleteState.phase === "review" ? (
            <>
              <button type="button" className="rec-btn rec-btn-outline" onClick={closeBulkEventDelete} disabled={saving === "bulk-force-delete"}>
                Keep Protected Events
              </button>
              <button type="button" className="rec-btn rec-btn-accent" onClick={() => runBulkEventDelete({ deleteScanData: true })} disabled={saving === "bulk-force-delete"}>
                {saving === "bulk-force-delete" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTrash} />}
                Delete Events and Scan Data
              </button>
            </>
          ) : (
            <button type="button" className="rec-btn rec-btn-primary" onClick={closeBulkEventDelete}>Done</button>
          )}
        >
          {bulkDeleteState.error && (
            <div className="rec-alert rec-alert-danger mb-3">
              <p className="mb-0">{bulkDeleteState.error}</p>
            </div>
          )}

          {bulkDeleteState.phase === "confirm" && (
            <div className="rec-grid">
              <div className="rec-alert rec-alert-warning">
                <strong>{bulkDeleteState.eventIds.length} scan event{bulkDeleteState.eventIds.length === 1 ? "" : "s"} selected</strong>
                <p className="mb-0 mt-2">
                  Events without scan history will be deleted immediately. Events with scan records will be skipped and returned for a separate confirmation.
                </p>
              </div>
              <p className="rec-muted mb-0">This first step never deletes attendance or scanner audit records.</p>
            </div>
          )}

          {bulkDeleteState.phase === "review" && (
            <div className="rec-grid">
              {(bulkDeleteState.report?.deleted || []).length > 0 && (
                <div className="rec-alert rec-alert-success">
                  <strong>{bulkDeleteState.report.deleted.length} event{bulkDeleteState.report.deleted.length === 1 ? " was" : "s were"} deleted safely.</strong>
                  <p className="mb-0 mt-2">These events had no scan history.</p>
                </div>
              )}
              <div className="rec-alert rec-alert-danger">
                <strong>{bulkDeleteState.report?.blocked?.length || 0} event{bulkDeleteState.report?.blocked?.length === 1 ? " has" : "s have"} linked scan data.</strong>
                <p className="mb-0 mt-2">
                  Continuing permanently deletes the events and all accepted, rejected, override, and audit scan records listed below. This reporting history cannot be restored.
                </p>
              </div>
              <div className="rec-bulk-delete-report-list">
                {(bulkDeleteState.report?.blocked || []).map((item) => (
                  <div key={item.eventId} className="rec-bulk-delete-report-row">
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.eventId}</span>
                    </div>
                    <span className="rec-permission-badge">{item.scanCount} scan record{item.scanCount === 1 ? "" : "s"}</span>
                  </div>
                ))}
              </div>
              {(bulkDeleteState.report?.failed || []).length > 0 && (
                <div className="rec-bulk-delete-failures">
                  <strong>Could not process {bulkDeleteState.report.failed.length} event{bulkDeleteState.report.failed.length === 1 ? "" : "s"}</strong>
                  {bulkDeleteState.report.failed.map((item) => <p key={item.eventId}>{item.name}: {item.message}</p>)}
                </div>
              )}
            </div>
          )}

          {bulkDeleteState.phase === "complete" && (
            <div className="rec-grid">
              <div className="rec-bulk-delete-summary">
                <div><strong>{bulkDeleteState.report?.deleted?.length || 0}</strong><span>Events deleted</span></div>
                <div><strong>{bulkDeleteState.report?.scanRecordsDeleted || 0}</strong><span>Scan records deleted</span></div>
                <div><strong>{bulkDeleteState.report?.failed?.length || 0}</strong><span>Could not delete</span></div>
              </div>
              {(bulkDeleteState.report?.failed || []).length > 0 ? (
                <div className="rec-bulk-delete-failures">
                  <strong>Events requiring attention</strong>
                  {bulkDeleteState.report.failed.map((item) => <p key={item.eventId}>{item.name}: {item.message}</p>)}
                </div>
              ) : (
                <div className="rec-alert rec-alert-success">
                  <p className="mb-0">The selected deletion operation completed successfully.</p>
                </div>
              )}
            </div>
          )}
        </ScannerManagementModal>
      )}

      {confirmDialog && (
        <RecConfirmDialog
          title={confirmDialog.title}
          confirmLabel={confirmDialog.confirmLabel}
          busy={saving === confirmDialog.busyKey}
          onClose={() => {
            if (saving === confirmDialog.busyKey) return
            setConfirmDialog(null)
          }}
          onConfirm={confirmDialog.onConfirm}
        >
          {confirmDialog.body}
        </RecConfirmDialog>
      )}
    </div>
  )
}
