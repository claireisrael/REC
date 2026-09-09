"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowLeft, faCalendarAlt } from "@fortawesome/free-solid-svg-icons"
import "../../rec-dashboard.css"

export default function RecSessionsAdminPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard/rec-conference/admin/programs")
  }, [router])

  return (
    <div className="rec-dashboard-container">
      <div className="rec-alert">
        <FontAwesomeIcon icon={faCalendarAlt} size="2x" className="mb-3" />
        <h4 className="rec-alert-title">Program-Based Sessions</h4>
        <p>Sessions are now managed inside each program so schedule blocks, half-day, and full-day rules can be enforced.</p>
        <div className="rec-page-actions rec-page-actions-left">
          <Link href="/dashboard/rec-conference/admin/programs" className="rec-btn rec-btn-primary">
            <FontAwesomeIcon icon={faCalendarAlt} />
            Open Programs
          </Link>
          <Link href="/dashboard/rec-conference" className="rec-btn rec-btn-outline">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to REC Conference
          </Link>
        </div>
      </div>
    </div>
  )
}
