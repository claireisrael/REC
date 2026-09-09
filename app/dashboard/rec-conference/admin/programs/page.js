"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import RecProgramsManager from "@/components/rec-registration/RecProgramsManager"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowLeft, faExclamationTriangle, faList } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import "../../rec-dashboard.css"

export default function RecProgramsAdminPage() {
  const {
    user,
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES
  } = useAuth()
  const appwriteServices = useAppwrite()
  const [loading, setLoading] = useState(true)

  // Check permissions
  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'manage')
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  useEffect(() => {
    // Initialize loading state
    if (appwriteServices && user) {
      setLoading(false)
    }
  }, [appwriteServices, user])

  if (loading) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-spinner-wrap">
          <div className="rec-spinner" aria-hidden="true" />
          <p className="mt-3">Loading programs management...</p>
        </div>
      </div>
    )
  }

  // Check if user has permission to access programs
  if (!hasRecAccess && !isSeniorManager()) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-warning">
          <FontAwesomeIcon icon={faExclamationTriangle} size="2x" className="mb-3" />
          <h4 className="rec-alert-title">Access Restricted</h4>
          <p>You do not have permission to access REC Conference programs.</p>
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

  // Check if user has manage permission (programs require admin/manage access)
  if (!canManageRec && !isSeniorManager()) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert">
          <FontAwesomeIcon icon={faList} size="2x" className="mb-3" />
          <h4 className="rec-alert-title">Insufficient Access</h4>
          <p>You have <strong>{userPermissionLevel}</strong> access to REC Conference.</p>
          <p>Program management requires ADMIN level access or higher.</p>
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

  return (
    <div className="rec-dashboard-container">
      <nav className="rec-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard/rec-conference">REC Dashboard</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <span>Manage Programs</span>
      </nav>

      <div className="rec-dashboard-header rec-page-bar">
        <div>
          <h2 className="rec-header-gradient mb-1">
            <FontAwesomeIcon icon={faList} />
            Conference Programs
          </h2>
          <p className="rec-muted mb-0">Create and manage conference program structures, days, and venue configurations.</p>
          {userPermissionLevel && !isSeniorManager() && (
            <span className="rec-permission-badge mt-2">{userPermissionLevel} Access</span>
          )}
        </div>
        <div className="rec-page-actions">
          <Link href="/dashboard/rec-conference" className="rec-btn rec-btn-outline">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to REC
          </Link>
        </div>
      </div>

      <RecProgramsManager />

      <div className="rec-alert mt-4">
        <h6 className="rec-alert-title">
          <FontAwesomeIcon icon={faList} className="me-2" />
          Programs Management Help
        </h6>
        <p className="mb-0 rec-muted">
          Programs define the structure of your conference including number of days, venue halls, and organization.
          Each conference should have at least one program before adding sessions.
        </p>
      </div>
    </div>
  )
}
