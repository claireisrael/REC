"use client"

import Link from "next/link"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faExclamationTriangle,
  faFileImport,
  faUsers,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import RecRegistrationImportManager from "@/components/rec-registration/RecRegistrationImportManager"
import "../../../rec-dashboard.css"

function AccessMessage({ icon, title, children }) {
  return (
    <div className="rec-dashboard-container">
      <div className="rec-access-wrap">
        <div className="rec-alert text-center">
          <FontAwesomeIcon icon={icon} size="3x" className="mb-4" style={{ color: "#d99a00" }} />
          <h4 className="rec-alert-title">{title}</h4>
          <div>{children}</div>
          <Link href="/dashboard/rec-conference/admin/registrations" className="rec-btn rec-btn-primary mt-3">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to Registrations
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function RecRegistrationImportPage() {
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    MODULES,
  } = useAuth()
  const isSenior = isSeniorManager()
  const hasAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canEdit = canPerformModuleAction(MODULES.REC_CONFERENCE, "edit")

  if (!hasAccess && !isSenior) {
    return (
      <AccessMessage icon={faExclamationTriangle} title="Access Restricted">
        <p>You do not have permission to access REC Conference registrations.</p>
      </AccessMessage>
    )
  }
  if (!canEdit && !isSenior) {
    return (
      <AccessMessage icon={faUsers} title="Insufficient Access">
        <p>Bulk attendee imports require REC Conference edit access.</p>
      </AccessMessage>
    )
  }

  return (
    <div className="rec-dashboard-container">
      <div className="rec-page-bar mb-4">
        <div>
          <div className="rec-breadcrumb">
            <Link href="/dashboard/rec-conference/admin/registrations">
              <FontAwesomeIcon icon={faArrowLeft} /> Registrations
            </Link>
            <span className="rec-breadcrumb-separator">/</span>
            <span>Import Attendees</span>
          </div>
          <h2 className="rec-header-gradient mb-2">
            <FontAwesomeIcon icon={faFileImport} /> Bulk Attendee Import
          </h2>
          <p className="rec-muted mb-0">
            Validate a conference-specific CSV, review every row, and create attendee
            registrations in controlled batches.
          </p>
        </div>
      </div>

      <RecRegistrationImportManager />
    </div>
  )
}
