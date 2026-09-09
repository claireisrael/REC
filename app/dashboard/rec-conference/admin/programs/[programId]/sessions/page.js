"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getRecProgramById } from "@/lib/appwrite/rec-programmes"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import ProgramSessionsManager from "@/components/rec-registration/ProgramSessionsManager"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowLeft, faCalendarAlt, faClock, faExclamationTriangle, faList } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import { useParams } from "next/navigation"
import "../../../../rec-dashboard.css"

export default function ProgramSessionsPage() {
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES
  } = useAuth()
  const appwriteServices = useAppwrite()
  const params = useParams()
  const programId = params.programId

  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState(null)
  const [conference, setConference] = useState(null)
  const [error, setError] = useState(null)

  // Check permissions
  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'edit')
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  useEffect(() => {
    const loadProgramData = async () => {
      if (!appwriteServices || !programId) return

      try {
        // Load program data
        const programData = await getRecProgramById(programId, appwriteServices)
        setProgram(programData)

        // Load conference data
        const conferencesResponse = await getAllRecConferences(appwriteServices)
        const conferenceData = conferencesResponse.documents.find(
          conf => conf.$id === programData.conferenceId
        )
        setConference(conferenceData)

      } catch (err) {
        console.error("Error loading program data:", err)
        setError("Error loading program data. Please try again.")
      } finally {
        setLoading(false)
      }
    }

    loadProgramData()
  }, [appwriteServices, programId])

  // Check permissions first (before loading check)
  if (!hasRecAccess && !isSeniorManager()) {
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

  if (!canEditRec && !isSeniorManager()) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert">
          <FontAwesomeIcon icon={faCalendarAlt} size="2x" className="mb-3" />
          <h4 className="rec-alert-title">Insufficient Access</h4>
          <p>You have <strong>{userPermissionLevel}</strong> access to REC Conference.</p>
          <p>Session management requires EDITOR level access or higher.</p>
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

  // Loading check
  if (loading) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-spinner-wrap">
          <div className="rec-spinner" aria-hidden="true" />
          <p className="mt-3">Loading program sessions...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-danger">
          <h4 className="rec-alert-title">Error Loading Program</h4>
          <p>{error}</p>
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

  if (!program) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-warning">
          <h4 className="rec-alert-title">Program Not Found</h4>
          <p>The requested program could not be found.</p>
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

  return (
    <div className="rec-dashboard-container">
      <nav className="rec-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard/rec-conference">REC Conference</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href="/dashboard/rec-conference/admin/programs">Programs</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <span>{program.title} - Sessions</span>
      </nav>

      <div className="rec-dashboard-header rec-page-bar">
        <div>
          <h2 className="rec-header-gradient mb-1">
            <FontAwesomeIcon icon={faCalendarAlt} />
            Program Sessions Management
          </h2>
          <p className="rec-muted mb-0">
            Manage sessions for <strong>{program.title}</strong>
          </p>
          <div className="rec-chip-list mt-2">
            {conference && <span className="rec-chip">Conference: {conference.title}</span>}
            {userPermissionLevel && !isSeniorManager() && (
              <span className="rec-permission-badge">{userPermissionLevel} Access</span>
            )}
          </div>
        </div>
        <div className="rec-page-actions">
          <Link href={`/dashboard/rec-conference/admin/programs/${programId}/sessions/timeslots`} className="rec-btn rec-btn-outline">
            <FontAwesomeIcon icon={faClock} />
            View Time Slots
          </Link>
          <Link href="/dashboard/rec-conference/admin/programs" className="rec-btn rec-btn-outline">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to Programs
          </Link>
        </div>
      </div>

      <section className="rec-panel mb-4">
        <div className="rec-panel-body">
          <div className="rec-page-bar">
            <div>
              <h3 className="rec-panel-title">
                <FontAwesomeIcon icon={faList} />
                {program.title}
              </h3>
              {program.description && <p className="rec-muted mb-0 mt-2">{program.description}</p>}
            </div>
            <div className="rec-stats-grid">
              <div className="rec-stat-tile">
                <span className="rec-stat-number">{program.daysCount}</span>
                <span className="rec-stat-label">Days</span>
              </div>
              <div className="rec-stat-tile">
                <span className="rec-stat-number">{program.venueHalls?.length || 0}</span>
                <span className="rec-stat-label">Venues</span>
              </div>
              <div className="rec-stat-tile">
                <span className={`rec-status rec-status-${(program.status || "").toLowerCase()}`}>{program.status}</span>
                <span className="rec-stat-label">Status</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ProgramSessionsManager program={program} conference={conference} />

      <div className="rec-alert mt-4">
        <h6 className="rec-alert-title">
          <FontAwesomeIcon icon={faCalendarAlt} className="me-2" />
          Program-Specific Session Management
        </h6>
        <p className="mb-0 rec-muted">
          Sessions are managed within the program context. Days and venues are automatically populated from the program configuration.
          All sessions belong to this specific program.
        </p>
      </div>
    </div>
  )
}
