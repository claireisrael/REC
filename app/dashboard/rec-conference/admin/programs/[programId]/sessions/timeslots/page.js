"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faArrowsLeftRight,
  faBuilding,
  faChevronLeft,
  faChevronRight,
  faClock,
  faExclamationTriangle,
  faFileCsv,
  faFilePdf,
  faList,
  faTimes,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import { getRecProgramById } from "@/lib/appwrite/rec-programmes"
import { getSessionsByProgram, getStatusConfig } from "@/lib/appwrite/rec-sessions"
import { getProgramTimeBlocks } from "@/lib/appwrite/rec-program-time-blocks"
import { exportRecTimetableCsv, exportRecTimetablePdf } from "@/lib/rec-conference/timetable-pdf"
import {
  TIME_BLOCK_TYPE_LABELS,
  createDefaultProgramTimeBlocks,
  formatBlockTimeRange,
  isSessionAllowedBlock,
  isVenueAllowedForBlock,
  sessionOccupiesBlock,
  sortTimeBlocks,
} from "@/lib/rec-conference/schedule"
import "../../../../../rec-dashboard.css"

const KAMPALA_TIME_ZONE = "Africa/Kampala"
const CONFERENCE_START_HOUR = 8
const CONFERENCE_END_HOUR = 17

const hasExplicitTimezone = (dateTime = "") => /(?:Z|[+-]\d{2}:\d{2})$/.test(dateTime)

const normalizeDateOnlyValue = (dateValue = "") => {
  const match = String(dateValue).match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ""
}

const formatDateForKampalaInput = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KAMPALA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value
    }
    return acc
  }, {})

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const getKampalaDateTimeLocalValue = (dateTime) => {
  if (!dateTime) return ""

  if (hasExplicitTimezone(dateTime)) {
    const date = new Date(dateTime)
    if (!Number.isNaN(date.getTime())) {
      return formatDateForKampalaInput(date)
    }
  }

  const match = String(dateTime).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?/)
  return match ? `${match[1]}T${match[2]}` : ""
}

const getKampalaDateOnlyValue = (dateTime) => {
  if (!dateTime) return ""

  if (hasExplicitTimezone(dateTime)) {
    const date = new Date(dateTime)
    if (!Number.isNaN(date.getTime())) {
      return formatDateForKampalaInput(date).split("T")[0]
    }
  }

  return normalizeDateOnlyValue(dateTime)
}

const addDaysToDateValue = (dateValue, daysToAdd) => {
  const normalized = normalizeDateOnlyValue(dateValue)
  if (!normalized) return ""

  const [year, month, day] = normalized.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd))
  return date.toISOString().split("T")[0]
}

const formatDayDate = (dateValue) => {
  const normalized = normalizeDateOnlyValue(dateValue)
  if (!normalized) return "Date not configured"

  const [year, month, day] = normalized.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

const formatTime = (dateTime) => {
  const kampalaDateTime = getKampalaDateTimeLocalValue(dateTime)
  const timePart = kampalaDateTime.split("T")[1]
  if (!timePart) return "TBD"

  const [hoursValue, minutesValue] = timePart.split(":")
  const hours = Number(hoursValue)
  const minutes = Number(minutesValue)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "TBD"

  const period = hours >= 12 ? "PM" : "AM"
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  return `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`
}

const formatDuration = (startMs, endMs) => {
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "TBD"

  const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

const formatHourLabel = (hour) => {
  const period = hour >= 12 ? "PM" : "AM"
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${String(displayHour).padStart(2, "0")}:00 ${period}`
}

const formatSlotRange = (hour) => `${formatHourLabel(hour)} - ${formatHourLabel(hour + 1)}`

const getKampalaMinutesOfDay = (dateTime) => {
  const timePart = getKampalaDateTimeLocalValue(dateTime).split("T")[1]
  if (!timePart) return Number.NaN

  const [hours, minutes] = timePart.split(":").map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.NaN

  return (hours * 60) + minutes
}

const buildProgramDays = (program, conference) => {
  const configuredDays = Array.isArray(conference?.days) ? conference.days : []
  const dayCount = Number(program?.daysCount) || configuredDays.length
  if (!dayCount || dayCount < 1) return []

  const fallbackStartDate = getKampalaDateOnlyValue(conference?.startDate)

  return Array.from({ length: dayCount }, (_, index) => {
    const dayNumber = index + 1
    const configuredDay = configuredDays[index] || {}
    const date = normalizeDateOnlyValue(configuredDay.date) || addDaysToDateValue(fallbackStartDate, index)
    const baseLabel = configuredDay.label || `Day ${dayNumber}`

    return {
      value: dayNumber,
      label: date ? `${baseLabel} (${formatDayDate(date)})` : baseLabel,
      date,
    }
  })
}

const getDateTimeMs = (dateTime) => {
  const date = new Date(dateTime)
  return date.getTime()
}

const getRecStatusClass = (status) => `rec-status rec-status-${String(status || "").toLowerCase()}`

const isBlockVisibleForVenues = (block, venues = []) => (
  venues.some((venue) => isVenueAllowedForBlock(block, venue))
)

export default function ProgramSessionTimeSlotsPage() {
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES,
  } = useAuth()
  const appwriteServices = useAppwrite()
  const params = useParams()
  const programId = params.programId

  const [program, setProgram] = useState(null)
  const [conference, setConference] = useState(null)
  const [sessions, setSessions] = useState([])
  const [timeBlocks, setTimeBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dayFilter, setDayFilter] = useState("")
  const [venueFilter, setVenueFilter] = useState("")
  const [selectedCell, setSelectedCell] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportModalType, setExportModalType] = useState(null)
  const [selectedExportDays, setSelectedExportDays] = useState([])
  const [selectedExportVenues, setSelectedExportVenues] = useState([])

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "edit")
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  useEffect(() => {
    const loadData = async () => {
      if (!appwriteServices || !programId) return

      setLoading(true)
      setError(null)

      try {
        const programData = await getRecProgramById(programId, appwriteServices)
        const [conferencesResponse, sessionsResponse, blocksResponse] = await Promise.all([
          getAllRecConferences(appwriteServices),
          getSessionsByProgram(programId, appwriteServices),
          getProgramTimeBlocks(programId, appwriteServices),
        ])

        const conferenceData = conferencesResponse.documents.find((conf) => conf.$id === programData.conferenceId) || null
        setProgram(programData)
        setConference(conferenceData)
        setSessions(sessionsResponse.documents || [])
        setTimeBlocks((blocksResponse.documents || []).length > 0
          ? blocksResponse.documents
          : createDefaultProgramTimeBlocks({
              program: programData,
              conference: conferenceData,
              programDays: buildProgramDays(programData, conferenceData),
            }))
      } catch (err) {
        console.error("Error loading session time slots:", err)
        setError("Error loading session time slots. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [appwriteServices, programId])

  const programDays = useMemo(() => buildProgramDays(program, conference), [program, conference])

  const venueOptions = useMemo(() => {
    const venues = new Set()

    if (Array.isArray(program?.venueHalls)) {
      program.venueHalls.forEach((venue) => {
        if (venue) venues.add(venue)
      })
    }

    sessions.forEach((session) => {
      if (session.venueHall) venues.add(session.venueHall)
    })

    return Array.from(venues).sort((a, b) => a.localeCompare(b))
  }, [program, sessions])

  const slotRows = useMemo(() => {
    const dayLookup = new Map(programDays.map((day) => [day.value, day]))

    const rows = sessions.map((session) => {
      const startMs = getDateTimeMs(session.startTime)
      const endMs = getDateTimeMs(session.toTime)
      const dayNumber = Number(session.day)
      const day = dayLookup.get(dayNumber)

      return {
        ...session,
        dayNumber,
        dayLabel: day?.label || `Day ${session.day || "TBD"}`,
        date: day?.date || getKampalaDateTimeLocalValue(session.startTime).split("T")[0] || "",
        venueKey: session.venueHall || "Unassigned",
        startMs,
        endMs,
        startMinutes: getKampalaMinutesOfDay(session.startTime),
        endMinutes: getKampalaMinutesOfDay(session.toTime),
        conflictIds: [],
      }
    })

    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const first = rows[i]
        const second = rows[j]
        const sameDay = first.dayNumber === second.dayNumber
        const sameVenue = first.venueKey === second.venueKey
        const hasValidTimes = !Number.isNaN(first.startMs) && !Number.isNaN(first.endMs) && !Number.isNaN(second.startMs) && !Number.isNaN(second.endMs)
        const overlaps = hasValidTimes && first.startMs < second.endMs && second.startMs < first.endMs

        if (sameDay && sameVenue && overlaps) {
          first.conflictIds.push(second.$id)
          second.conflictIds.push(first.$id)
        }
      }
    }

    return rows.sort((a, b) => {
      if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber
      const venueCompare = a.venueKey.localeCompare(b.venueKey)
      if (venueCompare !== 0) return venueCompare
      return a.startMs - b.startMs
    })
  }, [programDays, sessions])

  const visibleRows = useMemo(() => {
    return slotRows.filter((row) => {
      const matchesDay = !dayFilter || String(row.dayNumber) === dayFilter
      const matchesVenue = !venueFilter || row.venueKey === venueFilter
      return matchesDay && matchesVenue
    })
  }, [dayFilter, slotRows, venueFilter])

  const visibleDays = useMemo(() => {
    if (dayFilter) {
      return programDays.filter((day) => String(day.value) === dayFilter)
    }

    return programDays
  }, [dayFilter, programDays])

  const visibleVenues = useMemo(() => {
    return venueFilter ? venueOptions.filter((venue) => venue === venueFilter) : venueOptions
  }, [venueFilter, venueOptions])

  useEffect(() => {
    setSelectedExportVenues(visibleVenues)
  }, [visibleVenues])

  useEffect(() => {
    setSelectedExportDays(visibleDays.map((day) => day.value))
  }, [visibleDays])

  const timeSlots = useMemo(() => {
    return Array.from(
      { length: CONFERENCE_END_HOUR - CONFERENCE_START_HOUR },
      (_, index) => CONFERENCE_START_HOUR + index
    )
  }, [])

  const scheduleRowsByDay = useMemo(() => {
    const byDay = new Map()

    sortTimeBlocks(timeBlocks).forEach((block) => {
      const day = Number(block.day)
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day).push(block)
    })

    return byDay
  }, [timeBlocks])

  const getCellSessions = (dayNumber, venue, hour) => {
    const slotStart = hour * 60
    const slotEnd = (hour + 1) * 60

    return visibleRows.filter((row) => (
      row.dayNumber === dayNumber &&
      row.venueKey === venue &&
      !Number.isNaN(row.startMinutes) &&
      !Number.isNaN(row.endMinutes) &&
      row.startMinutes < slotEnd &&
      row.endMinutes > slotStart
    ))
  }

  const getBlockCellSessions = (dayNumber, venue, block) => (
    visibleRows.filter((row) => (
      row.dayNumber === Number(dayNumber) &&
      row.venueKey === venue &&
      sessionOccupiesBlock(row, block)
    ))
  )

  const conflictCount = slotRows.filter((row) => row.conflictIds.length > 0).length
  const selectedDaysForExport = programDays.filter((day) => selectedExportDays.includes(day.value))
  const exportInProgress = exportingPdf || exportingCsv
  const exportTypeLabel = exportModalType === "csv" ? "CSV" : "PDF"

  const scrollTimetable = (dayValue, direction) => {
    const element = document.getElementById(`rec-timetable-${dayValue}`)
    if (!element) return

    element.scrollBy({
      left: direction * Math.max(320, element.clientWidth * 0.7),
      behavior: "smooth",
    })
  }

  const openExportModal = (type) => {
    setSelectedCell(null)
    setSelectedExportDays((visibleDays.length ? visibleDays : programDays).map((day) => day.value))
    setSelectedExportVenues(visibleVenues.length ? visibleVenues : venueOptions)
    setExportModalType(type)
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)
    setError(null)

    try {
      await exportRecTimetablePdf({
        programTitle: program?.title,
        conferenceTitle: conference?.title,
        days: selectedDaysForExport,
        venues: selectedExportVenues,
        timeBlocks,
        rows: slotRows.map((row) => ({
          ...row,
          startTimeLabel: formatTime(row.startTime),
          endTimeLabel: formatTime(row.toTime),
          statusLabel: getStatusConfig(row.status).label,
        })),
        fileName: `${program?.title || "REC"}_${selectedExportVenues.length === 1 ? selectedExportVenues[0] : "Selected_Venues"}_Time_Slots`,
      })
      setExportModalType(null)
    } catch (err) {
      console.error("Error exporting time slots PDF:", err)
      setError(err.message || "Failed to export time slots PDF.")
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportCsv = () => {
    setExportingCsv(true)
    setError(null)

    try {
      exportRecTimetableCsv({
        programTitle: program?.title,
        conferenceTitle: conference?.title,
        days: selectedDaysForExport,
        venues: selectedExportVenues,
        timeBlocks,
        rows: slotRows.map((row) => ({
          ...row,
          startTimeLabel: formatTime(row.startTime),
          endTimeLabel: formatTime(row.toTime),
          statusLabel: getStatusConfig(row.status).label,
        })),
        fileName: `${program?.title || "REC"}_${selectedExportVenues.length === 1 ? selectedExportVenues[0] : "Selected_Venues"}_Time_Slots`,
      })
      setExportModalType(null)
    } catch (err) {
      console.error("Error exporting time slots CSV:", err)
      setError(err.message || "Failed to export time slots CSV.")
    } finally {
      setExportingCsv(false)
    }
  }

  const toggleExportVenue = (venue) => {
    setSelectedExportVenues((current) => (
      current.includes(venue)
        ? current.filter((item) => item !== venue)
        : [...current, venue]
    ))
  }

  const toggleExportDay = (dayValue) => {
    setSelectedExportDays((current) => (
      current.includes(dayValue)
        ? current.filter((item) => item !== dayValue)
        : [...current, dayValue]
    ))
  }

  const handleConfirmExport = async () => {
    if (exportModalType === "csv") {
      handleExportCsv()
      return
    }

    await handleExportPdf()
  }

  if (!hasRecAccess && !isSeniorManager()) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-warning">
          <FontAwesomeIcon icon={faExclamationTriangle} size="2x" className="mb-3" />
          <h4 className="rec-alert-title">Access Restricted</h4>
          <p>You do not have permission to access REC Conference program time slots.</p>
          <div className="rec-page-actions rec-page-actions-left">
            <Link href="/dashboard/rec-conference" className="rec-btn rec-btn-primary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to REC Conference
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!canEditRec && !isSeniorManager()) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert">
          <FontAwesomeIcon icon={faClock} size="2x" className="mb-3" />
          <h4 className="rec-alert-title">Insufficient Access</h4>
          <p>You have <strong>{userPermissionLevel}</strong> access to REC Conference.</p>
          <p>Time slot review requires EDITOR level access or higher.</p>
          <div className="rec-page-actions rec-page-actions-left">
            <Link href={`/dashboard/rec-conference/admin/programs/${programId}/sessions`} className="rec-btn rec-btn-primary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to Sessions
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-spinner-wrap">
          <div className="rec-spinner" aria-hidden="true" />
          <p className="mt-3">Loading time slots...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-danger">
          <h4 className="rec-alert-title">Error Loading Time Slots</h4>
          <p>{error}</p>
          <div className="rec-page-actions rec-page-actions-left">
            <Link href={`/dashboard/rec-conference/admin/programs/${programId}/sessions`} className="rec-btn rec-btn-primary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to Sessions
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rec-dashboard-container">
      <nav className="rec-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard/rec-conference">REC Conference</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href="/dashboard/rec-conference/admin/programs">Programs</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href={`/dashboard/rec-conference/admin/programs/${programId}/sessions`}>Sessions</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <span>Time Slots</span>
      </nav>

      <div className="rec-dashboard-header rec-page-bar">
        <div>
          <h2 className="rec-header-gradient mb-1">
            <FontAwesomeIcon icon={faClock} />
            Occupied Time Slots
          </h2>
          <p className="rec-muted mb-0">
            Review scheduled sessions for <strong>{program?.title}</strong>
          </p>
          {conference && <span className="rec-chip mt-2">Conference: {conference.title}</span>}
        </div>
        <div className="rec-page-actions">
          <button
            type="button"
            className="rec-btn rec-btn-primary"
            onClick={() => openExportModal("pdf")}
            disabled={exportInProgress || programDays.length === 0 || venueOptions.length === 0}
          >
            <FontAwesomeIcon icon={faFilePdf} />
            {exportingPdf ? "Exporting..." : "Export PDF"}
          </button>
          <button
            type="button"
            className="rec-btn rec-btn-outline"
            onClick={() => openExportModal("csv")}
            disabled={exportInProgress || programDays.length === 0 || venueOptions.length === 0}
          >
            <FontAwesomeIcon icon={faFileCsv} />
            {exportingCsv ? "Exporting..." : "Export CSV"}
          </button>
          <Link href={`/dashboard/rec-conference/admin/programs/${programId}/sessions`} className="rec-btn rec-btn-outline">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to Sessions
          </Link>
        </div>
      </div>

      <div className="rec-stats-grid rec-stats-grid-four mb-4">
        <div className="rec-stat-tile">
          <span className="rec-stat-number">{slotRows.length}</span>
          <span className="rec-stat-label">Occupied Slots</span>
        </div>
        <div className="rec-stat-tile">
          <span className="rec-stat-number" style={{ color: conflictCount > 0 ? "#dc2626" : "#059669" }}>
            {conflictCount}
          </span>
          <span className="rec-stat-label">Conflict Flags</span>
        </div>
        <div className="rec-stat-tile">
          <span className="rec-stat-number">{programDays.length}</span>
          <span className="rec-stat-label">Conference Days</span>
        </div>
        <div className="rec-stat-tile">
          <span className="rec-stat-number">{venueOptions.length}</span>
          <span className="rec-stat-label">Venues</span>
        </div>
      </div>

      <section className="rec-panel mb-4">
        <div className="rec-panel-body">
          <div className="rec-toolbar">
            <label className="rec-field">
              <span className="rec-label">Filter by Day</span>
              <select className="rec-select" value={dayFilter} onChange={(event) => setDayFilter(event.target.value)}>
                <option value="">All Days</option>
                {programDays.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="rec-field">
              <span className="rec-label">Filter by Venue</span>
              <select className="rec-select" value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}>
                <option value="">All Venues</option>
                {venueOptions.map((venue) => (
                  <option key={venue} value={venue}>
                    {venue}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="rec-btn rec-btn-outline"
              onClick={() => {
                setDayFilter("")
                setVenueFilter("")
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      <section className="rec-panel">
        <div className="rec-panel-header">
          <h3 className="rec-panel-title">
            <FontAwesomeIcon icon={faList} />
            Hall-Time Grid
          </h3>
          <span className={`rec-status ${conflictCount > 0 ? "rec-status-archived" : "rec-status-published"}`}>
            {conflictCount > 0 ? `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}` : "No conflicts"}
          </span>
        </div>
        <div>
          {visibleDays.length === 0 ? (
            <div className="rec-empty-state">
              <FontAwesomeIcon icon={faClock} size="3x" />
              <h5 className="rec-empty-title">No conference days found</h5>
              <p className="rec-muted mb-0">Configure conference days before using the timetable grid.</p>
            </div>
          ) : visibleVenues.length === 0 ? (
            <div className="rec-empty-state">
              <FontAwesomeIcon icon={faBuilding} size="3x" />
              <h5 className="rec-empty-title">No venues configured</h5>
              <p className="rec-muted mb-0">Add venue halls to the program before using the timetable grid.</p>
            </div>
          ) : (
            visibleDays.map((day) => {
              const dayScheduleRows = (scheduleRowsByDay.get(Number(day.value)) || [])
                .filter((block) => isBlockVisibleForVenues(block, visibleVenues))
              const usesScheduleRows = dayScheduleRows.length > 0
              const firstScheduleRow = dayScheduleRows[0]
              const lastScheduleRow = dayScheduleRows[dayScheduleRows.length - 1]

              return (
              <div key={day.value} className="rec-timetable-day">
                <div className="rec-page-bar mb-3">
                  <div>
                    <h4 className="rec-row-title mb-1">{day.label}</h4>
                    <p className="rec-muted mb-1">
                      Grid range: {usesScheduleRows ? `${formatBlockTimeRange(firstScheduleRow).split(" - ")[0]} - ${formatBlockTimeRange(lastScheduleRow).split(" - ")[1]}` : `${formatHourLabel(CONFERENCE_START_HOUR)} - ${formatHourLabel(CONFERENCE_END_HOUR)}`} Africa/Kampala
                    </p>
                    <span className="rec-scroll-hint">
                      <FontAwesomeIcon icon={faArrowsLeftRight} />
                      Scroll inside the grid to view more halls
                    </span>
                  </div>
                  <div className="rec-scroll-controls">
                    <span className="rec-chip">
                      {visibleRows.filter((row) => row.dayNumber === day.value).length} session slots
                    </span>
                    <button
                      type="button"
                      className="rec-scroll-button"
                      onClick={() => scrollTimetable(day.value, -1)}
                      aria-label={`Scroll ${day.label} grid left`}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <button
                      type="button"
                      className="rec-scroll-button"
                      onClick={() => scrollTimetable(day.value, 1)}
                      aria-label={`Scroll ${day.label} grid right`}
                    >
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                  </div>
                </div>

                <div
                  id={`rec-timetable-${day.value}`}
                  className="rec-timetable-scroll-frame"
                  tabIndex={0}
                  aria-label={`${day.label} hall-time timetable`}
                >
                  <div className="rec-timetable-width" style={{ width: Math.max(760, (visibleVenues.length * 220) + 140) }}>
                    <table className="rec-timetable">
                    <thead>
                      <tr>
                        <th className="rec-time-cell">Time</th>
                        {visibleVenues.map((venue) => (
                          <th key={venue}>
                            <FontAwesomeIcon icon={faBuilding} className="me-2" />
                            {venue}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {usesScheduleRows ? dayScheduleRows.map((block) => (
                        <tr key={`${day.value}-${block.$id || block.localId}`}>
                          <td className="rec-time-cell">
                            <div className="rec-row-title">{formatBlockTimeRange(block)}</div>
                            <small className="rec-muted">{block.label}</small>
                            <div className="rec-chip mt-2">{TIME_BLOCK_TYPE_LABELS[block.type] || block.type}</div>
                          </td>
                          {visibleVenues.map((venue) => {
                            const venueAllowed = isVenueAllowedForBlock(block, venue)
                            const blockAllowsSessions = isSessionAllowedBlock(block)
                            const cellSessions = blockAllowsSessions && venueAllowed ? getBlockCellSessions(day.value, venue, block) : []
                            const hasConflict = cellSessions.some((session) => session.conflictIds.length > 0)
                            const selectedBlock = { day, venue, block, sessions: cellSessions }
                            const cellIsInteractive = venueAllowed

                            return (
                              <td
                                key={`${day.value}-${venue}-${block.$id || block.localId}`}
                                className={`rec-slot-cell ${hasConflict ? "rec-slot-conflict" : ""} ${!blockAllowsSessions && venueAllowed ? "rec-slot-activity" : ""} ${!venueAllowed ? "rec-slot-not-applicable" : ""}`}
                                role={cellIsInteractive ? "button" : undefined}
                                tabIndex={cellIsInteractive ? 0 : undefined}
                                onClick={() => {
                                  if (cellIsInteractive) setSelectedCell(selectedBlock)
                                }}
                                onKeyDown={(event) => {
                                  if (cellIsInteractive && (event.key === "Enter" || event.key === " ")) {
                                    setSelectedCell(selectedBlock)
                                  }
                                }}
                              >
                                {!venueAllowed ? (
                                  <div className="rec-slot-empty" aria-hidden="true" />
                                ) : !blockAllowsSessions ? (
                                  <div className="rec-session-pill rec-session-pill-activity">
                                    <div className="rec-session-title">{block.label}</div>
                                    <div className="rec-help-text">{TIME_BLOCK_TYPE_LABELS[block.type] || block.type}</div>
                                  </div>
                                ) : cellSessions.length === 0 ? (
                                  <div className="rec-slot-empty">Available</div>
                                ) : (
                                  <div className="rec-session-stack">
                                    {cellSessions.map((session) => {
                                      const statusConfig = getStatusConfig(session.status)
                                      const sessionHasConflict = session.conflictIds.length > 0

                                      return (
                                        <div
                                          key={session.$id}
                                          className={`rec-session-pill ${sessionHasConflict ? "rec-session-pill-conflict" : ""}`}
                                        >
                                          <div className="rec-session-title">{session.title || "Untitled Session"}</div>
                                          <div className="rec-help-text">
                                            {formatTime(session.startTime)} - {formatTime(session.toTime)}
                                          </div>
                                          <div className="rec-chip-list mt-2">
                                            <span className={getRecStatusClass(session.status)}>{statusConfig.label}</span>
                                            {sessionHasConflict && <span className="rec-status rec-status-archived">Overlap</span>}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      )) : timeSlots.map((hour) => (
                        <tr key={`${day.value}-${hour}`}>
                          <td className="rec-time-cell">
                            <div className="rec-row-title">{formatHourLabel(hour)}</div>
                            <small className="rec-muted">{formatSlotRange(hour)}</small>
                          </td>
                          {visibleVenues.map((venue) => {
                            const cellSessions = getCellSessions(day.value, venue, hour)
                            const hasConflict = cellSessions.some((session) => session.conflictIds.length > 0)

                            return (
                              <td
                                key={`${day.value}-${venue}-${hour}`}
                                className={`rec-slot-cell ${hasConflict ? "rec-slot-conflict" : ""}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedCell({ day, venue, hour, sessions: cellSessions })}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    setSelectedCell({ day, venue, hour, sessions: cellSessions })
                                  }
                                }}
                              >
                                {cellSessions.length === 0 ? (
                                  <div className="rec-slot-empty">Available</div>
                                ) : (
                                  <div className="rec-session-stack">
                                    {cellSessions.map((session) => {
                                      const statusConfig = getStatusConfig(session.status)
                                      const sessionHasConflict = session.conflictIds.length > 0

                                      return (
                                        <div
                                          key={session.$id}
                                          className={`rec-session-pill ${sessionHasConflict ? "rec-session-pill-conflict" : ""}`}
                                        >
                                          <div className="rec-session-title">{session.title || "Untitled Session"}</div>
                                          <div className="rec-help-text">
                                            {formatTime(session.startTime)} - {formatTime(session.toTime)}
                                          </div>
                                          <div className="rec-chip-list mt-2">
                                            <span className={getRecStatusClass(session.status)}>{statusConfig.label}</span>
                                            {sessionHasConflict && <span className="rec-status rec-status-archived">Overlap</span>}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </div>
              </div>
              )
            })
          )}
        </div>
      </section>

      {exportModalType && (
        <div className="rec-modal-backdrop" role="presentation">
          <div className="rec-modal rec-modal-wide" role="dialog" aria-modal="true" aria-labelledby="timeslot-export-modal-title">
            <div className="rec-modal-header rec-page-bar">
              <div>
                <h3 id="timeslot-export-modal-title" className="rec-panel-title">
                  <FontAwesomeIcon icon={exportModalType === "csv" ? faFileCsv : faFilePdf} />
                  Export {exportTypeLabel} Timetable
                </h3>
                <p className="rec-muted mb-0 mt-2">
                  Choose the days and halls to include. The current grid filters are preselected.
                </p>
              </div>
              <button
                type="button"
                className="rec-icon-button"
                onClick={() => setExportModalType(null)}
                aria-label="Close export settings"
                disabled={exportInProgress}
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            <div className="rec-modal-body">
              <div className="rec-export-options rec-export-options-modal">
                <div className="rec-page-bar">
                  <div>
                    <span className="rec-label">Conference Days</span>
                    <p className="rec-help-text mb-0">Select the days that should appear in this export.</p>
                  </div>
                  <div className="rec-page-actions">
                    <button type="button" className="rec-btn rec-btn-outline" onClick={() => setSelectedExportDays(visibleDays.map((day) => day.value))}>
                      Current View
                    </button>
                    <button type="button" className="rec-btn rec-btn-outline" onClick={() => setSelectedExportDays(programDays.map((day) => day.value))}>
                      Select All
                    </button>
                    <button type="button" className="rec-btn rec-btn-outline" onClick={() => setSelectedExportDays([])}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="rec-checkbox-grid">
                  {programDays.map((day) => (
                    <label key={day.value} className="rec-checkbox-option">
                      <input
                        type="checkbox"
                        checked={selectedExportDays.includes(day.value)}
                        onChange={() => toggleExportDay(day.value)}
                      />
                      <span>{day.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="rec-export-options rec-export-options-modal">
                <div className="rec-page-bar">
                  <div>
                    <span className="rec-label">Halls</span>
                    <p className="rec-help-text mb-0">Select the venue columns that should appear in this export.</p>
                  </div>
                  <div className="rec-page-actions">
                    <button type="button" className="rec-btn rec-btn-outline" onClick={() => setSelectedExportVenues(visibleVenues)}>
                      Current View
                    </button>
                    <button type="button" className="rec-btn rec-btn-outline" onClick={() => setSelectedExportVenues(venueOptions)}>
                      Select All
                    </button>
                    <button type="button" className="rec-btn rec-btn-outline" onClick={() => setSelectedExportVenues([])}>
                      Clear
                    </button>
                  </div>
                </div>
                <div className="rec-checkbox-grid">
                  {venueOptions.map((venue) => (
                    <label key={venue} className="rec-checkbox-option">
                      <input
                        type="checkbox"
                        checked={selectedExportVenues.includes(venue)}
                        onChange={() => toggleExportVenue(venue)}
                      />
                      <span>{venue}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="rec-modal-footer">
              <button
                type="button"
                className="rec-btn rec-btn-outline"
                onClick={() => setExportModalType(null)}
                disabled={exportInProgress}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rec-btn rec-btn-primary"
                onClick={handleConfirmExport}
                disabled={exportInProgress || selectedDaysForExport.length === 0 || selectedExportVenues.length === 0}
              >
                <FontAwesomeIcon icon={exportModalType === "csv" ? faFileCsv : faFilePdf} />
                {exportInProgress ? "Exporting..." : `Export ${exportTypeLabel}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCell && (
        <div className="rec-modal-backdrop" role="presentation">
          <div className="rec-modal rec-modal-wide" role="dialog" aria-modal="true" aria-labelledby="timeslot-modal-title">
            <div className="rec-modal-header rec-page-bar">
              <h3 id="timeslot-modal-title" className="rec-panel-title">
                {selectedCell.venue} - {selectedCell.block ? formatBlockTimeRange(selectedCell.block) : formatSlotRange(selectedCell.hour)}
              </h3>
              <button type="button" className="rec-icon-button" onClick={() => setSelectedCell(null)} aria-label="Close">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="rec-modal-body">
              <div className="rec-chip-list mb-3">
                <span className="rec-chip">{selectedCell.day.label}</span>
                {selectedCell.block && <span className="rec-chip">{selectedCell.block.label}</span>}
                <span className="rec-chip">Africa/Kampala</span>
              </div>

              {selectedCell.block && !isSessionAllowedBlock(selectedCell.block) ? (
                <div className="rec-alert">
                  <h5 className="rec-row-title mb-1">{selectedCell.block.label}</h5>
                  <p className="mb-0">{TIME_BLOCK_TYPE_LABELS[selectedCell.block.type] || selectedCell.block.type}</p>
                </div>
              ) : selectedCell.sessions.length === 0 ? (
                <div className="rec-alert rec-alert-success">
                  <p className="mb-0">This hall is available for the selected time slot.</p>
                </div>
              ) : (
                <div className="rec-grid">
                  {selectedCell.sessions.map((session) => {
                    const statusConfig = getStatusConfig(session.status)
                    const hasConflict = session.conflictIds.length > 0

                    return (
                      <div key={session.$id} className={`rec-panel ${hasConflict ? "rec-slot-conflict" : ""}`}>
                        <div className="rec-panel-body">
                          <div className="rec-page-bar">
                            <div>
                              <h5 className="rec-row-title mb-1">{session.title || "Untitled Session"}</h5>
                              {session.theme && <p className="rec-muted mb-2">{session.theme}</p>}
                              <div className="rec-help-text">
                                <FontAwesomeIcon icon={faClock} className="me-2" />
                                {formatTime(session.startTime)} - {formatTime(session.toTime)}
                                <span className="mx-2">|</span>
                                {formatDuration(session.startMs, session.endMs)}
                              </div>
                              {session.organizer && (
                                <div className="rec-help-text mt-1">Organizer: {session.organizer}</div>
                              )}
                            </div>
                            <div className="rec-chip-list">
                              <span className={getRecStatusClass(session.status)}>{statusConfig.label}</span>
                              {hasConflict && <span className="rec-status rec-status-archived">Overlaps {session.conflictIds.length}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
