"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faExclamationTriangle,
  faUserCheck,
  faUserShield,
  faUsers,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import RecRegistrationsList from "@/components/rec-registration/RecRegistrationsList"
import "../../rec-dashboard.css"

function AccessMessage({ icon, title, children }) {
  return (
    <div className="rec-dashboard-container">
      <div className="rec-access-wrap">
        <div className="rec-alert text-center">
          <FontAwesomeIcon icon={icon} size="3x" className="mb-4" style={{ color: "#d99a00" }} />
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

export default function RecRegistrationsPage() {
  const searchParams = useSearchParams()
  const mailFailed = searchParams.get("mail") === "failed"
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES,
  } = useAuth()

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "edit")
  const isSenior = isSeniorManager()
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  if (!hasRecAccess && !isSenior) {
    return (
      <AccessMessage icon={faExclamationTriangle} title="Access Restricted">
        <p>You do not have permission to access REC Conference registrations.</p>
      </AccessMessage>
    )
  }

  if (!canEditRec && !isSenior) {
    return (
      <AccessMessage icon={faUsers} title="Insufficient Access">
        <p>
          You have <strong>{userPermissionLevel}</strong> access to REC Conference.
        </p>
        <p>Registration management requires edit access or senior manager access.</p>
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
            <span>Registrations</span>
          </div>
          <h2 className="rec-header-gradient mb-2">Registration Management</h2>
          <p className="rec-muted mb-0">
            People register themselves on the public form. Use this page to review, edit, and add registrations with full admin rights.
          </p>
        </div>
        {userPermissionLevel && (
          <div className="rec-permission-badge">
            <FontAwesomeIcon icon={faUserShield} /> {userPermissionLevel} Access
          </div>
        )}
      </div>

      {mailFailed && (
        <div className="rec-alert mb-4" role="status">
          <div className="rec-inline-note">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <div>
              <strong>Registration saved.</strong>
              <p className="mb-0">
                The confirmation email could not be sent. You can open the registration later and send it again.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rec-alert mb-4">
        <div className="rec-inline-note">
          <FontAwesomeIcon icon={faUserCheck} />
          <div>
            <strong>People register themselves. Admins keep full rights.</strong>
            <p className="mb-0">
              Public registration is at <Link href="/rec-registration">/rec-registration</Link>.
              Admins can still create or edit registrations here even when public registration is closed or coupon-only.
            </p>
          </div>
        </div>
      </div>

      <RecRegistrationsList />
    </div>
  )
}
