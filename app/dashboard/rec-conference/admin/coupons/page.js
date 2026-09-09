"use client"

import Link from "next/link"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faExclamationTriangle,
  faTicket,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import RecCouponsManager from "@/components/rec-registration/RecCouponsManager"
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

export default function RecCouponsPage() {
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES,
  } = useAuth()

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "manage")
  const isSenior = isSeniorManager()
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  if (!hasRecAccess && !isSenior) {
    return (
      <AccessMessage icon={faExclamationTriangle} title="Access Restricted">
        <p>You do not have permission to access REC Conference coupons.</p>
      </AccessMessage>
    )
  }

  if (!canManageRec && !isSenior) {
    return (
      <AccessMessage icon={faTicket} title="Insufficient Access">
        <p>
          You have <strong>{userPermissionLevel}</strong> access to REC Conference.
        </p>
        <p>Coupon management requires manage access or senior manager access.</p>
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
            <span>Coupons</span>
          </div>
          <h2 className="rec-header-gradient mb-2">Coupon Management</h2>
          <p className="rec-muted mb-0">
            Create coupon allocations, monitor remaining seats, and page through coupon records using Appwrite pagination.
          </p>
        </div>
        {userPermissionLevel && (
          <div className="rec-permission-badge">
            <FontAwesomeIcon icon={faUserShield} /> {userPermissionLevel} Access
          </div>
        )}
      </div>

      <RecCouponsManager />
    </div>
  )
}
