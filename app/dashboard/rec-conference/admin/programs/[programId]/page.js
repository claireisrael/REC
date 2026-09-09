"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getRecProgramById, getProgramStatusConfig, generateProgramDays } from "@/lib/appwrite/rec-programmes"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowLeft, faBuilding, faCalendarAlt, faCalendarDays, faEdit, faInfoCircle, faTimes } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import React from "react"
import "../../../rec-dashboard.css"

export default function ProgramDetailsPage({ params }) {
  const router = useRouter()
  const unwrappedParams = React.use(params)
  const programId = unwrappedParams.programId

  const { isSeniorManager, canPerformModuleAction, MODULES } = useAuth()
  const appwriteServices = useAppwrite()
  
  const [program, setProgram] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Security Check
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'manage')
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'edit')
  
  const hasAccess = canManageRec || canEditRec || isSeniorManager()
  const canEdit = canManageRec || canEditRec || isSeniorManager()

  useEffect(() => {
    const fetchProgram = async () => {
      if (!appwriteServices || !hasAccess) return
      setLoading(true)
      try {
        const data = await getRecProgramById(programId, appwriteServices)
        if (!data) throw new Error("Program not found")
        setProgram(data)
      } catch (err) {
        console.error(err)
        setError("Failed to load program details.")
      } finally {
        setLoading(false)
      }
    }
    fetchProgram()
  }, [programId, appwriteServices, hasAccess])

  if (!hasAccess) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-danger">
          <h4 className="rec-alert-title">Access Restricted</h4>
          <p className="mb-0">You do not have permission to view programs.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-spinner-wrap">
          <div className="rec-spinner" aria-hidden="true" />
          <p className="mt-3">Loading program details...</p>
        </div>
      </div>
    )
  }

  if (!program) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-danger mb-4">
          <p className="mb-0">Program not found.</p>
        </div>
        <button className="rec-btn rec-btn-outline" onClick={() => router.push('/dashboard/rec-conference/admin/programs')}>
          Return to Programs
        </button>
      </div>
    )
  }

  const statusConfig = getProgramStatusConfig(program.status)
  const programDays = generateProgramDays(program.daysCount)

  return (
    <div className="rec-dashboard-container">
      <nav className="rec-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard/rec-conference">REC Dashboard</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href="/dashboard/rec-conference/admin/programs">Programs</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <span>Program Details</span>
      </nav>

      <div className="rec-dashboard-header rec-page-bar">
        <div>
          <h2 className="rec-header-gradient mb-1">
            {program.title}
          </h2>
          <div className="rec-chip-list mt-2">
            <span className={`rec-status rec-status-${(program.status || "").toLowerCase()}`}>
              {statusConfig.icon} {statusConfig.label}
            </span>
            {program.slug && <span className="rec-chip">Slug: {program.slug}</span>}
          </div>
        </div>
        
        <div className="rec-page-actions">
          {canEdit && (
            <button
              type="button"
              className="rec-btn rec-btn-outline"
              onClick={() => router.push(`/dashboard/rec-conference/admin/programs/edit/${programId}`)}
            >
              <FontAwesomeIcon icon={faEdit} />
              Edit Program
            </button>
          )}
          <button
            type="button"
            className="rec-btn rec-btn-primary"
            onClick={() => router.push(`/dashboard/rec-conference/admin/programs/${programId}/sessions`)}
          >
            <FontAwesomeIcon icon={faCalendarAlt} />
            Manage Sessions
          </button>
        </div>
      </div>

      {error && (
        <div className="rec-alert rec-alert-danger mb-4">
          <div className="rec-page-bar">
            <p className="mb-0">{error}</p>
            <button type="button" className="rec-icon-button" onClick={() => setError(null)} aria-label="Dismiss error">
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        </div>
      )}

      <section className="rec-panel">
        <div className="rec-panel-header">
          <h3 className="rec-panel-title">
            <FontAwesomeIcon icon={faInfoCircle} />
            Overview
          </h3>
        </div>
        <div className="rec-panel-body">
          <p className="rec-muted mb-4">{program.description || "No description provided."}</p>

          <div className="rec-grid rec-grid-two">
            <div className="rec-stat-tile">
              <div className="rec-icon-wrap rec-icon-primary">
                <FontAwesomeIcon icon={faCalendarDays} />
              </div>
              <h4 className="rec-row-title">Duration & Days</h4>
              <p className="rec-muted mb-3"><strong>Total Duration:</strong> {program.daysCount} days</p>
              <div className="rec-chip-list">
                {programDays.map((day) => (
                  <span key={day.value} className="rec-chip">
                    {day.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="rec-stat-tile">
              <div className="rec-icon-wrap rec-icon-accent">
                <FontAwesomeIcon icon={faBuilding} />
              </div>
              <h4 className="rec-row-title">Venue Halls</h4>
              <p className="rec-muted mb-3"><strong>Total Venues:</strong> {program.venueHalls?.length || 0}</p>
              <div className="rec-chip-list">
                {program.venueHalls && program.venueHalls.length > 0 ? (
                  program.venueHalls.map((venue) => (
                    <span key={venue} className="rec-chip">
                      {venue}
                    </span>
                  ))
                ) : (
                  <span className="rec-help-text">No venues defined</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="rec-form-actions">
        <button type="button" className="rec-btn rec-btn-outline" onClick={() => router.push('/dashboard/rec-conference/admin/programs')}>
          <FontAwesomeIcon icon={faArrowLeft} />
          Back to Programs List
        </button>
      </div>
    </div>
  )
}
