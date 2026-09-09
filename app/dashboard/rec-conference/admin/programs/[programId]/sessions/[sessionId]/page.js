"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Query } from "appwrite"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faBuilding,
  faCalendarAlt,
  faCalendarDays,
  faClock,
  faEnvelope,
  faExclamationTriangle,
  faIdBadge,
  faInfoCircle,
  faList,
  faUsers,
  faUser,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import { getRecProgramById, generateProgramDays } from "@/lib/appwrite/rec-programmes"
import {
  getRecSessionById,
  getStatusConfig,
  parseRecSessionUpdateHistory,
  SESSION_STATUS,
} from "@/lib/appwrite/rec-sessions"
import "../../../../../rec-dashboard.css"

const KAMPALA_TIME_ZONE = "Africa/Kampala"

const getRecSessionStatusClass = (status) => {
  if (status === SESSION_STATUS.PUBLISHED) return "rec-status rec-status-published"
  if (status === SESSION_STATUS.ARCHIVED) return "rec-status rec-status-archived"
  return "rec-status rec-status-draft"
}

const normalizeDateOnlyValue = (dateValue = "") => {
  const match = String(dateValue).match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ""
}

const hasExplicitTimezone = (dateTime = "") => /(?:Z|[+-]\d{2}:\d{2})$/.test(dateTime)

const normalizeDateTimeLocalValue = (dateTime = "") => {
  const match = String(dateTime).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/)
  if (!match) return ""
  return `${match[1]}T${match[2]}`
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
    if (part.type !== "literal") acc[part.type] = part.value
    return acc
  }, {})

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

const getKampalaDateTimeLocalValue = (dateTime) => {
  if (!dateTime) return ""

  if (hasExplicitTimezone(dateTime)) {
    const date = new Date(dateTime)
    if (!Number.isNaN(date.getTime())) return formatDateForKampalaInput(date)
  }

  return normalizeDateTimeLocalValue(dateTime)
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

const formatTime = (dateTime) => {
  if (!dateTime) return "TBD"

  try {
    const kampalaDateTime = getKampalaDateTimeLocalValue(dateTime)
    const timePart = kampalaDateTime.split("T")[1]
    if (!timePart) return "Invalid Time"

    const [hoursValue, minutesValue] = timePart.split(":")
    const kampalaHours = Number(hoursValue)
    const kampalaMinutes = Number(minutesValue)
    if (Number.isNaN(kampalaHours) || Number.isNaN(kampalaMinutes)) return "Invalid Time"

    const period = kampalaHours >= 12 ? "PM" : "AM"
    const displayHours = kampalaHours === 0 ? 12 : kampalaHours > 12 ? kampalaHours - 12 : kampalaHours
    return `${displayHours.toString().padStart(2, "0")}:${kampalaMinutes.toString().padStart(2, "0")} ${period}`
  } catch (error) {
    console.error("Error formatting session time:", error)
    return "Invalid Time"
  }
}

const getDateTimeLocalTimestamp = (dateTime) => {
  const normalized = normalizeDateTimeLocalValue(dateTime)
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return Number.NaN

  const [, year, month, day, hours, minutes] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes))
}

const formatDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return "TBD"

  const startTimestamp = hasExplicitTimezone(startTime) ? new Date(startTime).getTime() : getDateTimeLocalTimestamp(startTime)
  const endTimestamp = hasExplicitTimezone(endTime) ? new Date(endTime).getTime() : getDateTimeLocalTimestamp(endTime)
  if (Number.isNaN(startTimestamp) || Number.isNaN(endTimestamp)) return "Invalid Duration"

  let totalMinutes = Math.round((endTimestamp - startTimestamp) / 60000)
  if (totalMinutes < 0) totalMinutes += 24 * 60

  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  return `${mins}m`
}

const getProfileDisplayName = (profile, fallbackId = "") => (
  profile?.name || profile?.email || fallbackId || "Unknown user"
)

const getProfileSubtitle = (profile, fallbackId = "") => {
  if (!profile) return fallbackId ? `User ID: ${fallbackId}` : "User ID was not stored"
  return [profile.email, profile.roleName || profile.systemRole, profile.departmentName].filter(Boolean).join(" / ") || `User ID: ${profile.userId || profile.$id}`
}

export default function RecProgramSessionDetailsPage() {
  const params = useParams()
  const programId = params.programId
  const sessionId = params.sessionId
  const appwriteServices = useAppwrite()
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES
  } = useAuth()

  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState(null)
  const [conference, setConference] = useState(null)
  const [session, setSession] = useState(null)
  const [profilesByUserId, setProfilesByUserId] = useState({})
  const [error, setError] = useState(null)

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "edit")
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)
  const hasAccess = hasRecAccess || isSeniorManager()
  const canViewDetails = canEditRec || isSeniorManager()

  const buildProgramDays = (programData = program, conferenceData = conference) => {
    const configuredDays = Array.isArray(conferenceData?.days) ? conferenceData.days : []
    const dayCount = Number(programData?.daysCount) || configuredDays.length
    if (!dayCount || dayCount < 1) return []

    const fallbackStartDate = normalizeDateOnlyValue(conferenceData?.startDate)
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
      }
    })
  }

  const fetchSessionProfiles = async (sessionDocument) => {
    const profileIds = [...new Set([
      sessionDocument.createdBy,
      ...parseRecSessionUpdateHistory(sessionDocument.updateHistory).map((entry) => entry.userId)
    ].filter(Boolean))]

    if (!profileIds.length) return {}

    const profiles = new Map()
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

    return Object.fromEntries(profiles)
  }

  useEffect(() => {
    if (!appwriteServices || !programId || !sessionId || !hasAccess || !canViewDetails) return

    let cancelled = false
    const loadSessionDetails = async () => {
      setLoading(true)
      setError(null)

      try {
        const [programData, sessionData, conferencesResponse] = await Promise.all([
          getRecProgramById(programId, appwriteServices),
          getRecSessionById(sessionId, appwriteServices),
          getAllRecConferences(appwriteServices),
        ])

        if (sessionData.programId !== programId) {
          throw new Error("This session does not belong to the selected program.")
        }

        const conferenceData = (conferencesResponse.documents || []).find((item) => item.$id === programData.conferenceId) || null
        const profileMap = await fetchSessionProfiles(sessionData)
        if (cancelled) return

        setProgram(programData)
        setSession(sessionData)
        setConference(conferenceData)
        setProfilesByUserId(profileMap)
      } catch (loadError) {
        console.error("Error loading session details:", loadError)
        if (!cancelled) setError(loadError.message || "Error loading session details. Please try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSessionDetails()

    return () => {
      cancelled = true
    }
    // Fetching is tied to route IDs, permissions, and the Appwrite client instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appwriteServices, programId, sessionId, hasAccess, canViewDetails])

  if (!hasAccess) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-warning">
          <FontAwesomeIcon icon={faExclamationTriangle} size="2x" className="mb-3" />
          <h4 className="rec-alert-title">Access Restricted</h4>
          <p>You do not have permission to access REC Conference program sessions.</p>
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

  if (!canViewDetails) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert">
          <FontAwesomeIcon icon={faCalendarAlt} size="2x" className="mb-3" />
          <h4 className="rec-alert-title">Insufficient Access</h4>
          <p>You have <strong>{userPermissionLevel}</strong> access to REC Conference.</p>
          <p>Session details require EDITOR level access or higher.</p>
          <div className="rec-page-actions rec-page-actions-left">
            <Link href="/dashboard/rec-conference/admin/programs" className="rec-btn rec-btn-primary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to Programs
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
          <p className="mt-3">Loading session details...</p>
        </div>
      </div>
    )
  }

  if (error || !program || !session) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-danger">
          <h4 className="rec-alert-title">Error Loading Session</h4>
          <p>{error || "The requested session could not be found."}</p>
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

  const statusConfig = getStatusConfig(session.status)
  const programDays = buildProgramDays()
  const selectedDay = programDays.find((day) => day.value === Number(session.day))
  const updateHistory = parseRecSessionUpdateHistory(session.updateHistory).slice().reverse()
  const creatorProfile = session.createdBy ? profilesByUserId[session.createdBy] : null

  return (
    <div className="rec-dashboard-container">
      <nav className="rec-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard/rec-conference">REC Conference</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href="/dashboard/rec-conference/admin/programs">Programs</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href={`/dashboard/rec-conference/admin/programs/${programId}/sessions`}>{program.title} Sessions</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <span>Session Details</span>
      </nav>

      <div className="rec-dashboard-header rec-page-bar">
        <div>
          <h2 className="rec-header-gradient mb-1">
            <FontAwesomeIcon icon={faCalendarAlt} />
            Session Details
          </h2>
          <p className="rec-muted mb-0">
            Full session profile, creator, and update history for <strong>{program.title}</strong>
          </p>
          <div className="rec-chip-list mt-2">
            {conference && <span className="rec-chip">Conference: {conference.title}</span>}
            {userPermissionLevel && !isSeniorManager() && (
              <span className="rec-permission-badge">{userPermissionLevel} Access</span>
            )}
          </div>
        </div>
        <div className="rec-page-actions">
          <Link href={`/dashboard/rec-conference/admin/programs/${programId}/sessions`} className="rec-btn rec-btn-outline">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to Sessions
          </Link>
        </div>
      </div>

      <section className="rec-session-details-page-card">
        <div className="rec-session-details-hero">
          <div className="rec-session-details-heading">
            <span className="rec-session-details-kicker">
              <FontAwesomeIcon icon={faList} />
              Program Session
            </span>
            <h3>{session.title || "Untitled Session"}</h3>
            <div className="rec-chip-list">
              <span className="rec-chip">
                <FontAwesomeIcon icon={faCalendarAlt} />
                Day {session.day}
              </span>
              <span className={getRecSessionStatusClass(session.status)}>
                {statusConfig.icon}
                {statusConfig.label}
              </span>
              {session.theme && (
                <span className="rec-chip">
                  <FontAwesomeIcon icon={faList} />
                  {session.theme}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rec-session-details-body">
          <section className="rec-session-schedule-strip" aria-label="Session schedule summary">
            <div>
              <span>Starts</span>
              <strong>{formatTime(session.startTime)}</strong>
            </div>
            <div>
              <span>Ends</span>
              <strong>{formatTime(session.toTime)}</strong>
            </div>
            <div>
              <span>Duration</span>
              <strong>{formatDuration(session.startTime, session.toTime)}</strong>
            </div>
            <div>
              <span>Date</span>
              <strong>{selectedDay?.label || "No date configured"}</strong>
            </div>
          </section>

          <section className="rec-session-detail-grid" aria-label="Session metadata">
            <article className="rec-session-detail-card">
              <FontAwesomeIcon icon={faBuilding} />
              <div>
                <span>Venue</span>
                <strong>{session.venueHall || "To be determined"}</strong>
              </div>
            </article>
            <article className="rec-session-detail-card">
              <FontAwesomeIcon icon={faUsers} />
              <div>
                <span>Organizer</span>
                <strong>{session.organizer || "To be determined"}</strong>
              </div>
            </article>
            <article className="rec-session-detail-card rec-session-detail-card-wide">
              <FontAwesomeIcon icon={faUser} />
              <div>
                <span>Created By</span>
                <strong>{getProfileDisplayName(creatorProfile, session.createdBy)}</strong>
                <small>{getProfileSubtitle(creatorProfile, session.createdBy)}</small>
              </div>
            </article>
          </section>

          {session.preamble || session.speakers ? (
            <section className="rec-session-content-grid" aria-label="Session content">
              {session.preamble && (
                <article className="rec-session-content-panel">
                  <h4>
                    <FontAwesomeIcon icon={faInfoCircle} />
                    Session Abstract
                  </h4>
                  <div className="rec-rich-text-scroll" dangerouslySetInnerHTML={{ __html: session.preamble }} />
                </article>
              )}
              {session.speakers && (
                <article className="rec-session-content-panel">
                  <h4>
                    <FontAwesomeIcon icon={faUsers} />
                    Speakers & Participants
                  </h4>
                  <div className="rec-rich-text-scroll" dangerouslySetInnerHTML={{ __html: session.speakers }} />
                </article>
              )}
            </section>
          ) : (
            <div className="rec-alert mb-0">
              <strong>No abstract or speaker notes have been added for this session.</strong>
            </div>
          )}

          <section className="rec-session-history-panel" aria-label="Session update history">
            <div className="rec-session-history-header">
              <h4>
                <FontAwesomeIcon icon={faClock} />
                Full Update History
              </h4>
              <span className="rec-chip">
                {updateHistory.length} {updateHistory.length === 1 ? "edit" : "edits"}
              </span>
            </div>
            {updateHistory.length > 0 ? (
              <ol className="rec-session-history-list rec-session-history-list-full">
                {updateHistory.map((entry, index) => {
                  const profile = entry.userId ? profilesByUserId[entry.userId] : null
                  return (
                    <li key={`${entry.userId || "unknown"}-${entry.updatedAt}-${index}`}>
                      <span className="rec-session-history-marker">{updateHistory.length - index}</span>
                      <div className="rec-session-history-person">
                        <strong>{getProfileDisplayName(profile, entry.userId)}</strong>
                        <small>{getProfileSubtitle(profile, entry.userId)}</small>
                      </div>
                      <time dateTime={entry.updatedAt}>{formatDateTime(entry.updatedAt)}</time>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="rec-session-history-empty">
                No edits have been recorded since update history tracking was enabled.
              </p>
            )}
          </section>

          <section className="rec-session-audit-strip" aria-label="Session audit information">
            <div>
              <FontAwesomeIcon icon={faIdBadge} />
              <span>Session ID</span>
              <strong>{session.$id}</strong>
            </div>
            <div>
              <FontAwesomeIcon icon={faEnvelope} />
              <span>Creator ID</span>
              <strong>{session.createdBy || "Not captured"}</strong>
            </div>
            <div>
              <FontAwesomeIcon icon={faCalendarDays} />
              <span>Created</span>
              <strong>{formatDateTime(session.createdAt || session.$createdAt)}</strong>
            </div>
            <div>
              <FontAwesomeIcon icon={faClock} />
              <span>Last Updated</span>
              <strong>{formatDateTime(session.updatedAt || session.$updatedAt)}</strong>
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
