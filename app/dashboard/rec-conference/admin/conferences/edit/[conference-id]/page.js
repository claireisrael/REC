"use client"

import { useState, useEffect } from "react"
import { Container, Alert, Breadcrumb, Spinner } from "@/components/ui/portal-kit"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import { getRecConferenceById, updateRecConference } from "@/lib/appwrite/rec-conferences"
import { getConferenceSponsorsSetup, saveConferenceSponsorsSetup } from "@/lib/appwrite/rec-sponsors"
import ConferenceForm from "@/components/rec-registration/ConferenceForm"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faEdit } from "@fortawesome/free-solid-svg-icons"
import Link from "next/link"
import React from "react"
import "../../../../rec-dashboard.css"

export default function EditConferencePage({ params }) {
  const router = useRouter()
  const unwrappedParams = React.use(params)
  const conferenceId = unwrappedParams["conference-id"]

  const { isSeniorManager, canPerformModuleAction, MODULES } = useAuth()
  const appwriteServices = useAppwrite()
  
  const [conference, setConference] = useState(null)
  const [sponsorCategories, setSponsorCategories] = useState([])
  const [sponsors, setSponsors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  // Security Check
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'manage')
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, 'edit')
  
  const hasAccess = canManageRec || canEditRec || isSeniorManager()

  useEffect(() => {
    const fetchConference = async () => {
      if (!appwriteServices || !hasAccess) return
      
      try {
        const [data, sponsorSetup] = await Promise.all([
          getRecConferenceById(conferenceId, appwriteServices),
          getConferenceSponsorsSetup(conferenceId, appwriteServices, { includeInactive: true })
        ])
        if (!data) throw new Error("Conference not found")
        
        // Format dates for the form
        const formattedData = { ...data }
        if (formattedData.startDate) formattedData.startDate = formattedData.startDate.split('T')[0]
        if (formattedData.endDate) formattedData.endDate = formattedData.endDate.split('T')[0]
        
        if (formattedData.days && Array.isArray(formattedData.days)) {
          formattedData.days = formattedData.days.map(day => ({
            ...day,
            date: day.date ? day.date.split('T')[0] : ""
          }))
        }
        
        setConference(formattedData)
        setSponsorCategories(sponsorSetup.categories)
        setSponsors(sponsorSetup.sponsors)
      } catch (err) {
        console.error(err)
        setError("Failed to load conference details.")
      } finally {
        setLoading(false)
      }
    }

    fetchConference()
  }, [conferenceId, appwriteServices, hasAccess])

  if (!hasAccess) {
    return (
      <Container className="py-4 text-center">
        <Alert variant="danger">You do not have permission to edit conferences.</Alert>
      </Container>
    )
  }

  const handleUpdate = async (conferenceData, sponsorshipPackageFile, sponsorSetup = {}) => {
    setIsSaving(true)
    setError(null)
    try {
      await updateRecConference(conferenceId, conferenceData, appwriteServices, sponsorshipPackageFile)
      await saveConferenceSponsorsSetup(
        conferenceId,
        sponsorSetup.categories || [],
        sponsorSetup.sponsors || [],
        appwriteServices,
        sponsorSetup.logoFiles || {}
      )
      // Navigate back to details
      router.push(`/dashboard/rec-conference/admin/conferences/${conferenceId}`)
    } catch (err) {
      console.error(err)
      setError("Failed to update conference. Please try again.")
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rec-dashboard-container d-flex justify-content-center align-items-center" style={{ minHeight: "50vh" }}>
        <Spinner animation="border" style={{ color: "#2E9ECC" }} />
      </div>
    )
  }

  return (
    <div className="rec-dashboard-container">
      <Breadcrumb className="mb-4">
        <Breadcrumb.Item linkAs={Link} href="/dashboard/rec-conference">REC Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item linkAs={Link} href={`/dashboard/rec-conference/admin/conferences/${conferenceId}`}>Details</Breadcrumb.Item>
        <Breadcrumb.Item active>Edit</Breadcrumb.Item>
      </Breadcrumb>

      <div className="rec-dashboard-header">
        <h2 className="rec-header-gradient">
          <FontAwesomeIcon icon={faEdit} className="me-2" />
          Edit Conference {conference?.year}
        </h2>
        <p className="text-muted">Modify the details, schedule, and pricing for this REC event.</p>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      {conference && (
        <ConferenceForm 
          initialData={conference}
          initialSponsorCategories={sponsorCategories}
          initialSponsors={sponsors}
          onSubmit={handleUpdate}
          onCancel={() => router.push(`/dashboard/rec-conference/admin/conferences/${conferenceId}`)}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}
