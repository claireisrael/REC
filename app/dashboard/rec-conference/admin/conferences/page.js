"use client"

import Link from "next/link"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowLeft, faCalendarAlt, faUserShield } from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import RecConferencesManager from "@/components/rec-registration/RecConferencesManager"
import "../../rec-dashboard.css"

function AccessRestricted() {
  return (
    <div className="rec-dashboard-container">
      <div className="rec-access-wrap">
        <div className="rec-alert text-center">
          <FontAwesomeIcon icon={faUserShield} size="3x" className="mb-4" style={{ color: "#dc3545" }} />
          <h4 className="rec-alert-title">Access Restricted</h4>
          <p>You do not have permission to manage REC conference configuration.</p>
        </div>
      </div>
    </div>
  )
}

export default function RecConferenceConfigurationPage() {
  const { isSeniorManager, hasModuleAccess, canPerformModuleAction, getModulePermissionLevel, MODULES } = useAuth()

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "manage")
  const isSenior = isSeniorManager()
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  if (!hasRecAccess && !isSenior) {
    return <AccessRestricted />
  }

  if (!canManageRec && !isSenior) {
    return <AccessRestricted />
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
            <span>Conference Setup</span>
          </div>
          <h2 className="rec-header-gradient mb-2">Conference Configuration</h2>
          <p className="rec-muted mb-0">
            Manage conference records, active conference selection, public details, dates, limits, and registration mode.
          </p>
        </div>
        {userPermissionLevel && (
          <div className="rec-permission-badge">
            <FontAwesomeIcon icon={faUserShield} /> {userPermissionLevel} Access
          </div>
        )}
      </div>

      <div className="rec-config-section mt-0">
        <div className="rec-config-header">
          <h5 className="rec-config-title">
            <FontAwesomeIcon icon={faCalendarAlt} style={{ color: "#EFA74F" }} />
            Conference List
          </h5>
        </div>
        <div className="rec-config-body">
          <RecConferencesManager />
        </div>
      </div>
    </div>
  )
}
