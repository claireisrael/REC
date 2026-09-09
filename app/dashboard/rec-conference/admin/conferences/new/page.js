"use client"

import { useState } from "react"
import { Container, Alert, Breadcrumb } from "@/components/ui/portal-kit"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { createRecConference } from "@/lib/appwrite/rec-conferences"
import { saveConferenceSponsorsSetup } from "@/lib/appwrite/rec-sponsors"
import ConferenceForm from "@/components/rec-registration/ConferenceForm"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import "../../../rec-dashboard.css"

export default function NewConferencePage() {
  const router = useRouter()
  const { isSeniorManager, canPerformModuleAction, MODULES } = useAuth()
  const appwriteServices = useAppwrite()
  
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Security Check
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'manage')
  if (!canManageRec && !isSeniorManager()) {
    return (
      <Container className="py-4 text-center">
        <Alert variant="danger">You do not have permission to create conferences.</Alert>
      </Container>
    )
  }

  const handleCreate = async (conferenceData, sponsorshipPackageFile, sponsorSetup = {}) => {
    setIsSaving(true)
    setError(null)
    try {
      // Ensure defaults if missing
      const finalData = {
        ...conferenceData,
        title: conferenceData.title || `Renewable Energy Conference & Expo ${conferenceData.year}`,
        description: conferenceData.description || `Uganda's premier renewable energy conference for ${conferenceData.year}`,
      }
      
      const created = await createRecConference(finalData, appwriteServices, sponsorshipPackageFile)
      await saveConferenceSponsorsSetup(
        created.$id,
        sponsorSetup.categories || [],
        sponsorSetup.sponsors || [],
        appwriteServices,
        sponsorSetup.logoFiles || {}
      )
      // Navigate to the details page of the newly created conference
      router.push(`/dashboard/rec-conference/admin/conferences/${created.$id}`)
    } catch (err) {
      console.error(err)
      setError("Failed to create conference. Please try again.")
      setIsSaving(false)
    }
  }

  return (
    <div className="rec-dashboard-container">
      <Breadcrumb className="mb-4">
        <Breadcrumb.Item linkAs={Link} href="/dashboard/rec-conference">REC Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item active>New Conference</Breadcrumb.Item>
      </Breadcrumb>

      <div className="rec-dashboard-header">
        <h2 className="rec-header-gradient">
          <FontAwesomeIcon icon={faPlusCircle} className="me-2" />
          Create New Conference
        </h2>
        <p className="text-muted">Configure the details, schedule, and pricing for a new REC event.</p>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <ConferenceForm 
        onSubmit={handleCreate}
        onCancel={() => router.push('/dashboard/rec-conference')}
        isSaving={isSaving}
      />
    </div>
  )
}
