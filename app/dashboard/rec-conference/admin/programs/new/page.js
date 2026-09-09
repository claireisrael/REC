"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { createRecProgram } from "@/lib/appwrite/rec-programmes"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import { syncProgramTimeBlocks } from "@/lib/appwrite/rec-program-time-blocks"
import ProgramForm from "@/components/rec-registration/ProgramForm"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowLeft, faPlusCircle, faTimes } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import "../../../rec-dashboard.css"

export default function NewProgramPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedConferenceId = searchParams.get('conferenceId')

  const { isSeniorManager, canPerformModuleAction, MODULES } = useAuth()
  const appwriteServices = useAppwrite()
  
  const [conferences, setConferences] = useState([])
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const fetchConferences = async () => {
      if (!appwriteServices) return
      try {
        const response = await getAllRecConferences(appwriteServices)
        setConferences(response.documents)
      } catch (err) {
        console.error("Error fetching conferences:", err)
        setError("Failed to load conferences. Please try again.")
      }
    }
    fetchConferences()
  }, [appwriteServices])

  // Security Check
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'manage')
  if (!canManageRec && !isSeniorManager()) {
    return (
      <div className="rec-dashboard-container">
        <div className="rec-alert rec-alert-danger">
          <h4 className="rec-alert-title">Access Restricted</h4>
          <p className="mb-0">You do not have permission to create programs.</p>
        </div>
      </div>
    )
  }

  const handleCreate = async (formData) => {
    setIsSaving(true)
    setError(null)
    try {
      if (!formData.conferenceId) {
        throw new Error("Please select a conference")
      }
      if (!formData.title.trim()) {
        throw new Error("Program title is required")
      }
      if (formData.daysCount < 1) {
        throw new Error("Days count must be at least 1")
      }
      if (formData.venueHalls.length === 0) {
        throw new Error("At least one venue hall is required")
      }

      const { timeBlocks, ...programPayload } = formData
      const created = await createRecProgram(programPayload, appwriteServices, "user") // userId is not strict here since we are admins
      await syncProgramTimeBlocks({
        program: created,
        blocks: timeBlocks || [],
        appwriteServices,
        userId: "user",
      })

      router.push(`/dashboard/rec-conference/admin/programs/${created.$id}`)
    } catch (err) {
      console.error(err)
      setError(err.message || "Failed to create program. Please try again.")
      setIsSaving(false)
    }
  }

  return (
    <div className="rec-dashboard-container">
      <nav className="rec-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard/rec-conference">REC Dashboard</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href="/dashboard/rec-conference/admin/programs">Programs</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <span>New Program</span>
      </nav>

      <div className="rec-dashboard-header rec-page-bar">
        <div>
          <h2 className="rec-header-gradient">
            <FontAwesomeIcon icon={faPlusCircle} />
            Create New Program
          </h2>
          <p className="rec-muted mb-0">Configure the days and venues for a new conference program.</p>
        </div>
        <div className="rec-page-actions">
          <Link href="/dashboard/rec-conference/admin/programs" className="rec-btn rec-btn-outline">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to Programs
          </Link>
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

      <ProgramForm 
        onSubmit={handleCreate}
        onCancel={() => router.push('/dashboard/rec-conference/admin/programs')}
        isSaving={isSaving}
        conferences={conferences}
        selectedConferenceId={selectedConferenceId}
      />
    </div>
  )
}
