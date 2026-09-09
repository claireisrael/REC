"use client"

import { useState, useEffect } from "react"
import { Query } from "appwrite"
import { Button, Form, Row, Col, Modal, Spinner } from "@/components/ui/portal-kit"
import Link from "next/link"
import { useAppwrite } from "@/lib/appwrite/provider"
import { useAuth } from "@/lib/auth/auth-provider"
import {
  createRecSession,
  updateRecSession,
  deleteRecSession,
  getSessionsByProgram,
  parseRecSessionUpdateHistory,
  SESSION_STATUS,
  getStatusConfig
} from "@/lib/appwrite/rec-sessions"
import {
  generateProgramDays,
} from "@/lib/appwrite/rec-programmes"
import { getProgramTimeBlocks } from "@/lib/appwrite/rec-program-time-blocks"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faPlus, faEdit, faTrash, faEye, faSearch, faClock,
  faUsers, faCalendarAlt, faBuilding,
} from "@fortawesome/free-solid-svg-icons"
import RichTextEditor, { RichTextUtils } from '@/components/ui/RichTextEditor'
import {
  SESSION_SPAN_TYPES,
  SESSION_SPAN_TYPE_LABELS,
  createDefaultProgramTimeBlocks,
  deriveSessionTimingFromBlocks,
  formatBlockTimeRange,
  formatMinutesAsTimeInput,
  getBlocksForSessionSpan,
  isSessionAllowedBlock,
  isVenueAllowedForBlock,
  parseTimeToMinutes,
  sortTimeBlocks,
} from "@/lib/rec-conference/schedule"

const KAMPALA_TIME_ZONE = "Africa/Kampala"

const getRecSessionStatusClass = (status) => {
  if (status === SESSION_STATUS.PUBLISHED) return "rec-status rec-status-published"
  if (status === SESSION_STATUS.ARCHIVED) return "rec-status rec-status-archived"
  return "rec-status rec-status-draft"
}

export default function ProgramSessionsManager({ program, conference }) {
  const appwriteServices = useAppwrite()
  const { user } = useAuth()

  const [sessions, setSessions] = useState([])
  const [timeBlocks, setTimeBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterDay, setFilterDay] = useState("")

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)

  // Form data for create/edit
  const [formData, setFormData] = useState({
    programId: program?.$id || "",
    day: 1,
    startTime: "",
    toTime: "",
    venueHall: "",
    theme: "",
    title: "",
    preamble: "",
    organizer: "",
    speakers: "",
    status: SESSION_STATUS.DRAFT,
    sessionSpanType: SESSION_SPAN_TYPES.SINGLE_BLOCK,
    timeBlockIds: [],
  })

  // Rich text content states
  const [preambleContent, setPreambleContent] = useState("")
  const [speakersContent, setSpeakersContent] = useState("")

  // Fetch sessions for this program
  const fetchSessions = async () => {
    if (!appwriteServices || !program) return

    setLoading(true)
    setError(null)

    try {
      const response = await getSessionsByProgram(program.$id, appwriteServices)
      const sessionDocuments = response.documents || []
      const creatorProfiles = await fetchCreatorProfiles(sessionDocuments)
      setSessions(enrichSessionsWithCreators(sessionDocuments, creatorProfiles))
    } catch (err) {
      setError("Error fetching sessions. Please try again.")
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  // Handle form input change
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const fetchCreatorProfiles = async (sessionDocuments) => {
    const profileIds = [...new Set(sessionDocuments.flatMap((session) => [
      session.createdBy,
      ...parseRecSessionUpdateHistory(session.updateHistory).map((entry) => entry.userId)
    ]).filter(Boolean))]
    if (!profileIds.length) return new Map()

    const profiles = new Map()
    try {
      for (let index = 0; index < profileIds.length; index += 100) {
        const batch = profileIds.slice(index, index + 100)
        const response = await appwriteServices.databases.listDocuments(
          appwriteServices.config.databaseId,
          appwriteServices.config.usersCollectionId,
          [Query.equal("userId", batch), Query.limit(100)]
        )
        ;(response.documents || []).forEach((profile) => {
          if (profile.userId) profiles.set(profile.userId, profile)
          if (profile.$id) profiles.set(profile.$id, profile)
        })
        const legacyResponse = await appwriteServices.databases.listDocuments(
          appwriteServices.config.databaseId,
          appwriteServices.config.usersCollectionId,
          [Query.equal("$id", batch), Query.limit(100)]
        )
        ;(legacyResponse.documents || []).forEach((profile) => {
          if (profile.userId) profiles.set(profile.userId, profile)
          if (profile.$id) profiles.set(profile.$id, profile)
        })
      }
    } catch (creatorError) {
      console.error("Error fetching session creator profiles:", creatorError)
    }
    return profiles
  }

  const enrichSessionsWithCreators = (sessionDocuments, creatorProfiles) => (
    sessionDocuments.map((session) => {
      const creatorProfile = session.createdBy ? creatorProfiles.get(session.createdBy) : null
      const updateHistoryEntries = parseRecSessionUpdateHistory(session.updateHistory)
      return {
        ...session,
        creatorProfile: creatorProfile || null,
        createdByName: creatorProfile?.name || creatorProfile?.email || session.createdBy || "",
        profilesByUserId: Object.fromEntries(creatorProfiles),
        updateHistoryEntries,
      }
    })
  )

  const fetchTimeBlocks = async (days = programDays) => {
    if (!appwriteServices || !program) return

    try {
      const response = await getProgramTimeBlocks(program.$id, appwriteServices)
      const persistedBlocks = response.documents || []
      setTimeBlocks(persistedBlocks.length > 0
        ? persistedBlocks
        : createDefaultProgramTimeBlocks({ program, conference, programDays: days }))
    } catch (err) {
      console.error("Fetch schedule blocks error:", err)
      setTimeBlocks(createDefaultProgramTimeBlocks({ program, conference, programDays: days }))
    }
  }

  const hasExplicitTimezone = (dateTime = "") => /(?:Z|[+-]\d{2}:\d{2})$/.test(dateTime)

  const normalizeDateTimeLocalValue = (dateTime = "") => {
    const match = dateTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/)
    if (!match) return ""

    return `${match[1]}T${match[2]}`
  }

  const normalizeDateOnlyValue = (dateValue = "") => {
    const match = String(dateValue).match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : ""
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

  const formatDateForKampalaInput = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: KAMPALA_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
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

    return normalizeDateTimeLocalValue(dateTime)
  }

  const getKampalaTimeInputValue = (dateTime) => {
    const kampalaDateTime = getKampalaDateTimeLocalValue(dateTime)
    return kampalaDateTime.split("T")[1] || ""
  }

  const getDateTimeLocalTimestamp = (dateTime) => {
    const normalized = normalizeDateTimeLocalValue(dateTime)
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
    if (!match) return Number.NaN

    const [, year, month, day, hours, minutes] = match
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes)
    )
  }

  const formatDayDate = (dateValue) => {
    const normalized = normalizeDateOnlyValue(dateValue)
    if (!normalized) return ""

    const [year, month, day] = normalized.split("-").map(Number)
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC"
    }).format(new Date(Date.UTC(year, month - 1, day)))
  }

  const buildProgramDays = () => {
    const configuredDays = Array.isArray(conference?.days) ? conference.days : []
    const dayCount = Number(program?.daysCount) || configuredDays.length
    if (!dayCount || dayCount < 1) return []

    const fallbackStartDate = getKampalaDateOnlyValue(conference?.startDate)
    const fallbackDays = generateProgramDays(dayCount)

    return Array.from({ length: dayCount }, (_, index) => {
      const dayNumber = index + 1
      const configuredDay = configuredDays[index] || {}
      const date = normalizeDateOnlyValue(configuredDay.date) || addDaysToDateValue(fallbackStartDate, index)
      const dateLabel = formatDayDate(date)
      const baseLabel = configuredDay.label || fallbackDays[index]?.label || `Day ${dayNumber}`

      return {
        value: dayNumber,
        label: dateLabel ? `${baseLabel} (${dateLabel})` : baseLabel,
        date,
        theme: configuredDay.theme || ""
      }
    })
  }

  const programDays = buildProgramDays()

  // Initialize component
  useEffect(() => {
    if (!program) return

    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      fetchSessions()
      fetchTimeBlocks(programDays)
    })

    return () => {
      cancelled = true
    }
    // Program day construction and session refresh are intentionally tied to these source objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, conference, appwriteServices])

  const getProgramDay = (dayValue) => programDays.find(day => day.value === Number(dayValue))

  const getProgramDayDate = (dayValue) => getProgramDay(dayValue)?.date || ""

  const getSelectedDayDateText = (dayValue) => {
    const date = getProgramDayDate(dayValue)
    return date ? formatDayDate(date) : "No date configured for this day"
  }

  // Convert from stored Kampala time back to time input format
  const convertFromKampalaTime = (kampalaDateTime) => {
    if (!kampalaDateTime) return ""

    try {
      return getKampalaTimeInputValue(kampalaDateTime)
    } catch (error) {
      console.error('Error converting from Kampala time:', error)
      return kampalaDateTime
    }
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      programId: program.$id,
      day: programDays[0]?.value || 1,
      startTime: "",
      toTime: "",
      venueHall: "",
      theme: "",
      title: "",
      preamble: "",
      organizer: "",
      speakers: "",
      status: SESSION_STATUS.DRAFT,
      sessionSpanType: SESSION_SPAN_TYPES.SINGLE_BLOCK,
      timeBlockIds: [],
    })
    setPreambleContent("")
    setSpeakersContent("")
  }

  // Handle create session
  const handleCreate = async (e) => {
    e.preventDefault()
    setError(null)
    setCreating(true)

    try {
      // Validation
      if (!formData.title.trim()) {
        setError("Session title is required")
        return
      }

      const selectedDayDate = getProgramDayDate(formData.day)
      if (!selectedDayDate) {
        setError("Selected conference day does not have a configured date")
        return
      }

      const schedule = deriveSessionSchedule()
      if (!schedule.valid) {
        setError(schedule.error || "Select a valid schedule block for this session")
        return
      }

      // Convert times to Kampala timezone and create session data
      const sessionData = {
        ...formData,
        startTime: schedule.startTime,
        toTime: schedule.toTime,
        timeBlockIds: schedule.timeBlockIds,
        sessionSpanType: formData.sessionSpanType || SESSION_SPAN_TYPES.SINGLE_BLOCK,
        preamble: preambleContent,
        speakers: speakersContent
      }

      const creatorUserId = getCurrentAccountUserId()
      if (!creatorUserId) {
        setError("Unable to identify the current user. Please refresh and try again.")
        return
      }

      await createRecSession(sessionData, appwriteServices, creatorUserId)
      await fetchSessions()
      setShowCreateModal(false)
      resetForm()
      setSuccess("Session created successfully!")
    } catch (err) {
      setError(err.message || "Error creating session. Please try again.")
      console.error("Create error:", err)
    } finally {
      setCreating(false)
    }
  }

  // Handle edit session
  const handleEdit = (session) => {
    setSelectedSession(session)
    setFormData({
      programId: session.programId,
      day: session.day,
      startTime: convertFromKampalaTime(session.startTime),
      toTime: convertFromKampalaTime(session.toTime),
      venueHall: session.venueHall || "",
      theme: session.theme || "",
      title: session.title || "",
      preamble: session.preamble || "",
      organizer: session.organizer || "",
      speakers: session.speakers || "",
      status: session.status,
      sessionSpanType: session.sessionSpanType || SESSION_SPAN_TYPES.CUSTOM,
      timeBlockIds: Array.isArray(session.timeBlockIds) ? session.timeBlockIds : [],
    })

    // Set rich text content from session data
    setPreambleContent(session.preamble || "")
    setSpeakersContent(session.speakers || "")

    setShowEditModal(true)
  }

  // Handle update session
  const handleUpdate = async (e) => {
    e.preventDefault()
    setError(null)
    setUpdating(true)

    try {
      // Same validation as create
      if (!formData.title.trim()) {
        setError("Session title is required")
        return
      }

      const selectedDayDate = getProgramDayDate(formData.day)
      if (!selectedDayDate) {
        setError("Selected conference day does not have a configured date")
        return
      }

      const schedule = deriveSessionSchedule()
      if (!schedule.valid) {
        setError(schedule.error || "Select a valid schedule block for this session")
        return
      }

      // Convert times to Kampala timezone and create update data
      const updateData = {
        ...formData,
        startTime: schedule.startTime,
        toTime: schedule.toTime,
        timeBlockIds: schedule.timeBlockIds,
        sessionSpanType: formData.sessionSpanType || SESSION_SPAN_TYPES.SINGLE_BLOCK,
        preamble: preambleContent,
        speakers: speakersContent
      }

      const updaterUserId = getCurrentAccountUserId()
      if (!updaterUserId) {
        setError("Unable to identify the current user. Please refresh and try again.")
        return
      }

      await updateRecSession(selectedSession.$id, updateData, appwriteServices, updaterUserId)
      await fetchSessions()
      setShowEditModal(false)
      resetForm()
      setSelectedSession(null)
      setSuccess("Session updated successfully!")
    } catch (err) {
      setError("Error updating session. Please try again.")
      console.error("Update error:", err)
    } finally {
      setUpdating(false)
    }
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedSession) return

    setDeleting(true)

    try {
      await deleteRecSession(selectedSession.$id, appwriteServices)
      await fetchSessions()
      setShowDeleteModal(false)
      setSelectedSession(null)
      setSuccess("Session deleted successfully!")
    } catch (err) {
      setError("Error deleting session. Please try again.")
      console.error("Delete error:", err)
    } finally {
      setDeleting(false)
    }
  }

  // Get filtered sessions
  const getFilteredSessions = () => {
    let filtered = sessions

    if (searchTerm.trim()) {
      filtered = filtered.filter(session =>
        session.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.theme?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.organizer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        session.venueHall?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (filterStatus) {
      filtered = filtered.filter(session => session.status === filterStatus)
    }

    if (filterDay) {
      filtered = filtered.filter(session => session.day === parseInt(filterDay))
    }

    return filtered
  }

  // Format time for display in Africa/Kampala.
  const formatTime = (dateTime) => {
    if (!dateTime) return "TBD"

    try {
      const kampalaDateTime = getKampalaDateTimeLocalValue(dateTime)
      const timePart = kampalaDateTime.split("T")[1]
      if (!timePart) {
        return "Invalid Time"
      }

      const [hoursValue, minutesValue] = timePart.split(":")
      const kampalaHours = Number(hoursValue)
      const kampalaMinutes = Number(minutesValue)

      if (Number.isNaN(kampalaHours) || Number.isNaN(kampalaMinutes)) {
        return "Invalid Time"
      }

      // Convert to 12-hour format
      const period = kampalaHours >= 12 ? 'PM' : 'AM'
      let displayHours = kampalaHours === 0 ? 12 : kampalaHours > 12 ? kampalaHours - 12 : kampalaHours

      return `${displayHours.toString().padStart(2, '0')}:${kampalaMinutes.toString().padStart(2, '0')} ${period}`
    } catch (error) {
      console.error('Error formatting time:', error, 'for datetime:', dateTime)
      return "Invalid Time"
    }
  }

  // Format duration between start and end time
  const formatDuration = (startTime, endTime) => {
    if (!startTime || !endTime) return "TBD"

    try {
      let startTimestamp
      let endTimestamp

      if (hasExplicitTimezone(startTime) && hasExplicitTimezone(endTime)) {
        startTimestamp = new Date(startTime).getTime()
        endTimestamp = new Date(endTime).getTime()
      } else {
        startTimestamp = getDateTimeLocalTimestamp(startTime)
        endTimestamp = getDateTimeLocalTimestamp(endTime)
      }

      if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) {
        return "Invalid Duration"
      }

      let totalMinutes = Math.round((endTimestamp - startTimestamp) / 60000)
      if (totalMinutes < 0) {
        totalMinutes += 24 * 60
      }

      const hours = Math.floor(totalMinutes / 60)
      const mins = totalMinutes % 60

      if (hours > 0) {
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
      }
      return `${mins}m`
    } catch (error) {
      console.error('Error calculating duration:', error)
      return "Invalid Duration"
    }
  }

  const filteredSessions = getFilteredSessions()

  const getTimeBlockIdentity = (block) => block.$id || block.localId

  const getAvailableSessionBlocks = (dayValue, venueHall = formData.venueHall) => (
    sortTimeBlocks(timeBlocks).filter((block) => (
      Number(block.day) === Number(dayValue) &&
      isSessionAllowedBlock(block) &&
      isVenueAllowedForBlock(block, venueHall)
    ))
  )

  const getSelectedBlockIds = (data = formData) => {
    const ids = Array.isArray(data.timeBlockIds) ? data.timeBlockIds.filter(Boolean) : []
    if (ids.length > 0) return ids

    const firstBlock = getAvailableSessionBlocks(data.day, data.venueHall)[0]
    return firstBlock ? [getTimeBlockIdentity(firstBlock)] : []
  }

  const formatDateTime = (dateTime) => {
    if (!dateTime) return "Not captured"
    const date = new Date(dateTime)
    if (Number.isNaN(date.getTime())) return "Not captured"
    return new Intl.DateTimeFormat("en-UG", {
      timeZone: KAMPALA_TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)
  }

  const getSessionProfileByUserId = (session, userId) => (
    userId ? session?.profilesByUserId?.[userId] || null : null
  )

  const getProfileDisplayName = (profile, fallbackId = "") => (
    profile?.name || profile?.email || fallbackId || "Unknown user"
  )

  const getSessionUpdateHistory = (session) => (
    Array.isArray(session?.updateHistoryEntries)
      ? session.updateHistoryEntries
      : parseRecSessionUpdateHistory(session?.updateHistory)
  )

  const getRecentSessionUpdates = (session) => (
    getSessionUpdateHistory(session).slice(-5).reverse()
  )

  const getCurrentAccountUserId = () => user?.userId || user?.accountId || user?.id || ""

  const deriveSessionSchedule = (data = formData) => {
    const dayDate = getProgramDayDate(data.day)
    const spanType = data.sessionSpanType || SESSION_SPAN_TYPES.SINGLE_BLOCK

    return deriveSessionTimingFromBlocks({
      day: data.day,
      date: dayDate,
      venueHall: data.venueHall,
      spanType,
      selectedBlockIds: getSelectedBlockIds(data),
      customStartMinutes: parseTimeToMinutes(data.startTime),
      customEndMinutes: parseTimeToMinutes(data.toTime),
      timeBlocks,
    })
  }

  const handleScheduleContextChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
      timeBlockIds: [],
      startTime: "",
      toTime: "",
    }))
  }

  const handleSpanTypeChange = (spanType) => {
    const availableBlocks = getAvailableSessionBlocks(formData.day, formData.venueHall)
    const firstBlock = availableBlocks[0]
    const firstBlockId = firstBlock ? getTimeBlockIdentity(firstBlock) : ""

    setFormData((prev) => ({
      ...prev,
      sessionSpanType: spanType,
      timeBlockIds: [SESSION_SPAN_TYPES.SINGLE_BLOCK, SESSION_SPAN_TYPES.CUSTOM].includes(spanType) && firstBlockId ? [firstBlockId] : [],
      startTime: spanType === SESSION_SPAN_TYPES.CUSTOM && firstBlock ? formatMinutesAsTimeInput(firstBlock.startMinutes) : "",
      toTime: spanType === SESSION_SPAN_TYPES.CUSTOM && firstBlock ? formatMinutesAsTimeInput(firstBlock.endMinutes) : "",
    }))
  }

  const handleSingleBlockChange = (blockId) => {
    const block = timeBlocks.find((item) => getTimeBlockIdentity(item) === blockId)
    setFormData((prev) => ({
      ...prev,
      timeBlockIds: blockId ? [blockId] : [],
      startTime: prev.sessionSpanType === SESSION_SPAN_TYPES.CUSTOM && block ? formatMinutesAsTimeInput(block.startMinutes) : prev.startTime,
      toTime: prev.sessionSpanType === SESSION_SPAN_TYPES.CUSTOM && block ? formatMinutesAsTimeInput(block.endMinutes) : prev.toTime,
    }))
  }

  const toggleSessionBlock = (blockId) => {
    setFormData((prev) => {
      const currentIds = Array.isArray(prev.timeBlockIds) ? prev.timeBlockIds : []
      return {
        ...prev,
        timeBlockIds: currentIds.includes(blockId)
          ? currentIds.filter((item) => item !== blockId)
          : [...currentIds, blockId],
      }
    })
  }

  const renderScheduleControls = () => {
    const spanType = formData.sessionSpanType || SESSION_SPAN_TYPES.SINGLE_BLOCK
    const availableBlocks = getAvailableSessionBlocks(formData.day, formData.venueHall)
    const selectedBlockIds = getSelectedBlockIds()
    const previewBlocks = getBlocksForSessionSpan({
      day: formData.day,
      venueHall: formData.venueHall,
      spanType,
      selectedBlockIds,
      timeBlocks,
    })
    const isCustom = spanType === SESSION_SPAN_TYPES.CUSTOM
    const isSingle = spanType === SESSION_SPAN_TYPES.SINGLE_BLOCK || isCustom
    const isMulti = spanType === SESSION_SPAN_TYPES.MULTI_BLOCK

    return (
      <section className="rec-panel mb-3">
        <div className="rec-panel-body">
          <div className="rec-grid rec-grid-two">
            <Form.Group className="mb-3">
              <Form.Label>Schedule Span *</Form.Label>
              <Form.Select value={spanType} onChange={(event) => handleSpanTypeChange(event.target.value)} required>
                {Object.entries(SESSION_SPAN_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">
                Sessions can only use blocks where sessions are allowed.
              </Form.Text>
            </Form.Group>

            {isSingle && (
              <Form.Group className="mb-3">
                <Form.Label>Session Block *</Form.Label>
                <Form.Select
                  value={selectedBlockIds[0] || ""}
                  onChange={(event) => handleSingleBlockChange(event.target.value)}
                  required
                >
                  <option value="">Select block...</option>
                  {availableBlocks.map((block) => (
                    <option key={getTimeBlockIdentity(block)} value={getTimeBlockIdentity(block)}>
                      {formatBlockTimeRange(block)} - {block.label}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            )}
          </div>

          {isCustom && (
            <div className="rec-grid rec-grid-two">
              <Form.Group className="mb-3">
                <Form.Label>Custom Start Time *</Form.Label>
                <Form.Control
                  type="time"
                  value={formData.startTime}
                  onChange={(event) => handleInputChange("startTime", event.target.value)}
                  step="60"
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Custom End Time *</Form.Label>
                <Form.Control
                  type="time"
                  value={formData.toTime}
                  onChange={(event) => handleInputChange("toTime", event.target.value)}
                  step="60"
                  required
                />
              </Form.Group>
            </div>
          )}

          {isMulti && (
            <div className="mb-3">
              <span className="rec-label">Select Session Blocks</span>
              <div className="rec-checkbox-grid">
                {availableBlocks.map((block) => {
                  const blockId = getTimeBlockIdentity(block)
                  return (
                    <label key={blockId} className="rec-checkbox-option">
                      <input
                        type="checkbox"
                        checked={selectedBlockIds.includes(blockId)}
                        onChange={() => toggleSessionBlock(blockId)}
                      />
                      <span>{formatBlockTimeRange(block)} - {block.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rec-alert mb-0">
            {previewBlocks.length > 0 ? (
              <div>
                <strong>Scheduled blocks:</strong>
                <div className="rec-chip-list mt-2">
                  {previewBlocks.map((block) => (
                    <span key={getTimeBlockIdentity(block)} className="rec-chip">
                      {formatBlockTimeRange(block)} - {block.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mb-0">No valid session blocks are available for the selected day and venue.</p>
            )}
          </div>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <div className="rec-spinner-wrap">
        <div className="rec-spinner" aria-hidden="true" />
        <p className="mt-3">Loading sessions...</p>
      </div>
    )
  }

  return (
    <>
      <div className="rec-stats-grid rec-stats-grid-four mb-4">
        <div className="rec-stat-tile">
          <span className="rec-stat-number">{sessions.length}</span>
          <span className="rec-stat-label">Total Sessions</span>
        </div>
        <div className="rec-stat-tile">
          <span className="rec-stat-number">{sessions.filter(s => s.status === SESSION_STATUS.PUBLISHED).length}</span>
          <span className="rec-stat-label">Published</span>
        </div>
        <div className="rec-stat-tile">
          <span className="rec-stat-number">{sessions.filter(s => s.status === SESSION_STATUS.DRAFT).length}</span>
          <span className="rec-stat-label">Drafts</span>
        </div>
        <div className="rec-stat-tile">
          <span className="rec-stat-number">{program.daysCount}</span>
          <span className="rec-stat-label">Program Days</span>
        </div>
      </div>

      <section className="rec-panel mb-4">
        <div className="rec-panel-body">
          <div className="rec-session-toolbar">
            <label className="rec-field">
              <span className="rec-label">Search Sessions</span>
              <div className="rec-search">
                <FontAwesomeIcon icon={faSearch} />
                <input
                  className="rec-input"
                  placeholder="Search title, theme, organizer, venue..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </label>

            <label className="rec-field">
              <span className="rec-label">Status</span>
              <select
                className="rec-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                {Object.values(SESSION_STATUS).map(status => (
                  <option key={status} value={status}>
                    {getStatusConfig(status).label}
                  </option>
                ))}
              </select>
            </label>

            <label className="rec-field">
              <span className="rec-label">Day</span>
              <select
                className="rec-select"
                value={filterDay}
                onChange={(e) => setFilterDay(e.target.value)}
              >
                <option value="">All Days</option>
                {programDays.map(day => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="rec-btn rec-btn-outline"
              onClick={() => {
                setSearchTerm("")
                setFilterStatus("")
                setFilterDay("")
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
            <FontAwesomeIcon icon={faCalendarAlt} />
            Program Sessions
            <span className="rec-muted">({program.title})</span>
          </h3>
          <div className="rec-page-actions">
            <button
              type="button"
              className="rec-btn rec-btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              <FontAwesomeIcon icon={faPlus} />
              New Session
            </button>
          </div>
        </div>

        <div className="rec-panel-body p-0">
          {error && (
            <div className="rec-alert rec-alert-danger m-3 mb-0">
              <div className="rec-page-bar">
                <p className="mb-0">{error}</p>
                <button type="button" className="rec-icon-button" onClick={() => setError(null)} aria-label="Dismiss error">
                  x
                </button>
              </div>
            </div>
          )}
          {success && (
            <div className="rec-alert rec-alert-success m-3 mb-0">
              <div className="rec-page-bar">
                <p className="mb-0">{success}</p>
                <button type="button" className="rec-icon-button" onClick={() => setSuccess(null)} aria-label="Dismiss success">
                  x
                </button>
              </div>
            </div>
          )}

          {filteredSessions.length === 0 ? (
            <div className="rec-empty-state">
              <FontAwesomeIcon icon={faCalendarAlt} size="3x" />
              <h5 className="rec-empty-title">No Sessions Found</h5>
              <p className="rec-muted">Create your first session for this program.</p>
              <button type="button" className="rec-btn rec-btn-primary" onClick={() => setShowCreateModal(true)}>
                <FontAwesomeIcon icon={faPlus} />
                Create First Session
              </button>
            </div>
          ) : (
            <div className="rec-table-wrap rec-responsive-table">
              <table className="rec-table">
                <thead>
                  <tr>
                    <th>Day & Time</th>
                    <th>Session Details</th>
                    <th>Venue & Organizer</th>
                    <th>Status</th>
                    <th>Recent Updates</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => {
                    const statusConfig = getStatusConfig(session.status)
                    const recentUpdates = getRecentSessionUpdates(session)
                    return (
                      <tr key={session.$id}>
                        <td data-label="Day & Time">
                          <div className="rec-session-time-stack">
                            <span className="rec-chip">Day {session.day}</span>
                            <span className="rec-help-text">
                              <FontAwesomeIcon icon={faClock} />
                              {formatTime(session.startTime)} - {formatTime(session.toTime)}
                            </span>
                            <span className="rec-help-text">{formatDuration(session.startTime, session.toTime)}</span>
                          </div>
                        </td>
                        <td data-label="Session Details">
                          <div>
                            <strong className="rec-row-title">{session.title}</strong>
                            {session.theme && (
                              <span className="rec-chip mt-2">
                                {session.theme}
                              </span>
                            )}
                            {session.preamble && (
                              <p className="rec-row-desc mb-0">
                                {RichTextUtils.truncateHtml(session.preamble, 80)}
                              </p>
                            )}
                          </div>
                        </td>
                        <td data-label="Venue & Organizer">
                          <div className="rec-grid" style={{ gap: 6 }}>
                            {session.venueHall && (
                              <div className="rec-help-text">
                                <FontAwesomeIcon icon={faBuilding} className="me-1" />
                                {session.venueHall}
                              </div>
                            )}
                            {session.organizer && (
                              <div className="rec-help-text">
                                <FontAwesomeIcon icon={faUsers} className="me-1" />
                                {session.organizer}
                              </div>
                            )}
                          </div>
                        </td>
                        <td data-label="Status">
                          <span className={getRecSessionStatusClass(session.status)}>
                            {statusConfig.icon}
                            {statusConfig.label}
                          </span>
                        </td>
                        <td data-label="Recent Updates">
                          <div className="rec-session-recent-updates">
                            {recentUpdates.length > 0 ? (
                              <>
                                {recentUpdates.map((entry, index) => {
                                  const profile = getSessionProfileByUserId(session, entry.userId)
                                  return (
                                    <div key={`${entry.userId || "unknown"}-${entry.updatedAt}-${index}`} className="rec-session-recent-update">
                                      <strong>{getProfileDisplayName(profile, entry.userId)}</strong>
                                      <span>{formatDateTime(entry.updatedAt)}</span>
                                    </div>
                                  )
                                })}
                                <Link
                                  href={`/dashboard/rec-conference/admin/programs/${program.$id}/sessions/${session.$id}`}
                                  className="rec-session-history-link"
                                >
                                  View all history
                                </Link>
                              </>
                            ) : (
                              <span className="rec-help-text">No edits recorded</span>
                            )}
                          </div>
                        </td>
                        <td data-label="Actions">
                          <div className="rec-page-actions rec-page-actions-left">
                            <Link
                              href={`/dashboard/rec-conference/admin/programs/${program.$id}/sessions/${session.$id}`}
                              className="rec-icon-button"
                              title="View Details"
                            >
                              <FontAwesomeIcon icon={faEye} />
                            </Link>
                            <button
                              type="button"
                              className="rec-icon-button"
                              onClick={() => handleEdit(session)}
                              title="Edit Session"
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            <button
                              type="button"
                              className="rec-icon-button rec-icon-button-danger"
                              onClick={() => {
                                setSelectedSession(session)
                                setShowDeleteModal(true)
                              }}
                              title="Delete Session"
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Create Session Modal */}
      <Modal
        show={showCreateModal}
        onHide={() => !creating && setShowCreateModal(false)}
        size="xl"
        backdrop={creating ? "static" : true}
        keyboard={!creating}
      >
        <Modal.Header closeButton>
          <Modal.Title>Create New Session</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreate}>
          <Modal.Body>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Day *</Form.Label>
                  <Form.Select
                    value={formData.day}
                    onChange={(e) => handleScheduleContextChange('day', parseInt(e.target.value))}
                    required
                  >
                    {programDays.map(day => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </Form.Select>
                  <small className="text-muted">
                    Date: {getSelectedDayDateText(formData.day)}
                  </small>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Venue Hall</Form.Label>
                  <Form.Select
                    value={formData.venueHall}
                    onChange={(e) => handleScheduleContextChange('venueHall', e.target.value)}
                  >
                    <option value="">Select venue...</option>
                    {program.venueHalls && program.venueHalls.map((venue, index) => (
                      <option key={index} value={venue}>
                        {venue}
                      </option>
                    ))}
                  </Form.Select>
                  <small className="text-muted">From program configuration</small>
                </Form.Group>
              </Col>
            </Row>

            {renderScheduleControls()}

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Session Title *</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Enter session title"
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Theme</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.theme}
                    onChange={(e) => handleInputChange('theme', e.target.value)}
                    placeholder="e.g., Research & Data Management"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Organizer</Form.Label>
              <Form.Control
                type="text"
                value={formData.organizer}
                onChange={(e) => handleInputChange('organizer', e.target.value)}
                placeholder="e.g., MUBS"
              />
            </Form.Group>

            <RichTextEditor
              label="Session Preamble/Abstract"
              value={preambleContent}
              onChange={setPreambleContent}
              placeholder="Enter session abstract or preamble..."
              minHeight={100}
              className="mb-3"
              defaultAlignment="justify"
            />

            <RichTextEditor
              label="Speakers & Participants"
              value={speakersContent}
              onChange={setSpeakersContent}
              placeholder="e.g., Session Chair: Dr. Jane Doe, Discussants: John Smith, Mary Johnson"
              minHeight={100}
              className="mb-3"
            />

            <Form.Group className="mb-3">
              <Form.Label>Status</Form.Label>
              <Form.Select
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
              >
                {Object.values(SESSION_STATUS).map(status => {
                  const config = getStatusConfig(status)
                  return (
                    <option key={status} value={status}>
                      {config.icon} {config.label}
                    </option>
                  )
                })}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Creating...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faPlus} className="me-1" />
                  Create Session
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Edit Session Modal - Similar to create but with update logic */}
      <Modal
        show={showEditModal}
        onHide={() => !updating && setShowEditModal(false)}
        size="xl"
        backdrop={updating ? "static" : true}
        keyboard={!updating}
      >
        <Modal.Header closeButton>
          <Modal.Title>Edit Session</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleUpdate}>
          <Modal.Body>
            {/* Same form fields as create modal */}
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Day *</Form.Label>
                  <Form.Select
                    value={formData.day}
                    onChange={(e) => handleScheduleContextChange('day', parseInt(e.target.value))}
                    required
                  >
                    {programDays.map(day => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </Form.Select>
                  <small className="text-muted">
                    Date: {getSelectedDayDateText(formData.day)}
                  </small>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Venue Hall</Form.Label>
                  <Form.Select
                    value={formData.venueHall}
                    onChange={(e) => handleScheduleContextChange('venueHall', e.target.value)}
                  >
                    <option value="">Select venue...</option>
                    {program.venueHalls && program.venueHalls.map((venue, index) => (
                      <option key={index} value={venue}>
                        {venue}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {renderScheduleControls()}

            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Session Title *</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Enter session title"
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Theme</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.theme}
                    onChange={(e) => handleInputChange('theme', e.target.value)}
                    placeholder="e.g., Research & Data Management"
                  />
                </Form.Group>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Organizer</Form.Label>
              <Form.Control
                type="text"
                value={formData.organizer}
                onChange={(e) => handleInputChange('organizer', e.target.value)}
                placeholder="e.g., MUBS"
              />
            </Form.Group>

            <RichTextEditor
              label="Session Preamble/Abstract"
              value={preambleContent}
              onChange={setPreambleContent}
              placeholder="Enter session abstract or preamble..."
              minHeight={100}
              className="mb-3"
              defaultAlignment="justify"
            />

            <RichTextEditor
              label="Speakers & Participants"
              value={speakersContent}
              onChange={setSpeakersContent}
              placeholder="e.g., Session Chair: Dr. Jane Doe, Discussants: John Smith, Mary Johnson"
              minHeight={100}
              className="mb-3"
            />

            <Form.Group className="mb-3">
              <Form.Label>Status</Form.Label>
              <Form.Select
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
              >
                {Object.values(SESSION_STATUS).map(status => {
                  const config = getStatusConfig(status)
                  return (
                    <option key={status} value={status}>
                      {config.icon} {config.label}
                    </option>
                  )
                })}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowEditModal(false)}
              disabled={updating}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={updating}>
              {updating ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Updating...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faEdit} className="me-1" />
                  Update Session
                </>
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        show={showDeleteModal}
        onHide={() => !deleting && setShowDeleteModal(false)}
        backdrop={deleting ? "static" : true}
        keyboard={!deleting}
      >
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this session? This action cannot be undone.
          {selectedSession && (
            <div className="mt-3 p-3 bg-light rounded">
              <strong>Session:</strong> {selectedSession.title}<br />
              <strong>Day:</strong> {selectedSession.day}<br />
              <strong>Time:</strong> {formatTime(selectedSession.startTime)} - {formatTime(selectedSession.toTime)}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowDeleteModal(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Deleting...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faTrash} className="me-1" />
                Delete Session
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
