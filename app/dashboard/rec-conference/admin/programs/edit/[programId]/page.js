"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getRecProgramById, updateRecProgram } from "@/lib/appwrite/rec-programmes"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import { getProgramTimeBlocks, syncProgramTimeBlocks } from "@/lib/appwrite/rec-program-time-blocks"
import ProgramForm from "@/components/rec-registration/ProgramForm"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowLeft, faEdit, faTimes } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import React from "react"
import "../../../../rec-dashboard.css"

export default function EditProgramPage({ params }) {
  const router = useRouter()
  const unwrappedParams = React.use(params)
  const programId = unwrappedParams.programId

  const { isSeniorManager, canPerformModuleAction, MODULES } = useAuth()
  const appwriteServices = useAppwrite()
  
  const [program, setProgram] = useState(null)
  const [timeBlocks, setTimeBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Security Check
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'manage')
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'edit')
  
  const hasAccess = canManageRec || canEditRec || isSeniorManager()

  useEffect(() => {
    const fetchProgram = async () => {
      if (!appwriteServices || !hasAccess) return
      
      try {
        const data = await getRecProgramById(programId, appwriteServices)
        if (!data) throw new Error("Program not found")

        const [conferencesResponse, blocksResponse] = await Promise.all([
          getAllRecConferences(appwriteServices),
          getProgramTimeBlocks(programId, appwriteServices),
        ])
        const conference = conferencesResponse.documents.find((item) => item.$id === data.conferenceId) || null

        setProgram({ ...data, conference })
        setTimeBlocks(blocksResponse.documents || [])
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
          <p className="mb-0">You do not have permission to edit programs.</p>
        </div>
      </div>
    )
  }

  const handleUpdate = async (formData) => {
    setIsSaving(true)
    setError(null)
    try {
      if (!formData.title.trim()) {
        throw new Error("Program title is required")
      }
      if (formData.daysCount < 1) {
        throw new Error("Days count must be at least 1")
      }
      if (formData.venueHalls.length === 0) {
        throw new Error("At least one venue hall is required")
      }

      const { timeBlocks: nextTimeBlocks, ...programPayload } = formData

      await updateRecProgram(programId, programPayload, appwriteServices)
      await syncProgramTimeBlocks({
        program: { ...program, ...programPayload, $id: programId },
        blocks: nextTimeBlocks || [],
        appwriteServices,
        userId: "user",
      })
      // Navigate back to details
      router.push(`/dashboard/rec-conference/admin/programs/${programId}`)
    } catch (err) {
      console.error(err)
      setError(err.message || "Failed to update program. Please try again.")
      setIsSaving(false)
    }
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

  return (
    <div className="rec-dashboard-container">
      <nav className="rec-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dashboard/rec-conference">REC Dashboard</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href="/dashboard/rec-conference/admin/programs">Programs</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <Link href={`/dashboard/rec-conference/admin/programs/${programId}`}>Details</Link>
        <span className="rec-breadcrumb-separator">/</span>
        <span>Edit</span>
      </nav>

      <div className="rec-dashboard-header rec-page-bar">
        <div>
          <h2 className="rec-header-gradient">
            <FontAwesomeIcon icon={faEdit} />
            Edit Program
          </h2>
          <p className="rec-muted mb-0">Modify the details, days count, and venues for this program.</p>
        </div>
        <div className="rec-page-actions">
          <Link href={`/dashboard/rec-conference/admin/programs/${programId}`} className="rec-btn rec-btn-outline">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to Details
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

      {program && (
        <ProgramForm 
          initialData={program}
          initialTimeBlocks={timeBlocks}
          onSubmit={handleUpdate}
          onCancel={() => router.push(`/dashboard/rec-conference/admin/programs/${programId}`)}
          isSaving={isSaving}
          // We don't need to pass conferences because we don't want them to change the conference of an existing program
          // but we can pass it if we want. The original code didn't let them change conferenceId on Edit.
        />
      )}
    </div>
  )
}
