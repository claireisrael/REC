"use client"

import React, { useEffect, useState } from "react"
import { Alert, Breadcrumb, Container, Form, Spinner } from "@/components/ui/portal-kit"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import AdminRegistrationForm from "@/components/rec-registration/AdminRegistrationForm"
import { getActiveRecConference, getConferenceYears, getRecConferenceByYear } from "@/lib/appwrite/rec-conferences"
import { getRecRegistrationById, sendConfirmationEmail, updateRegistrationForConferenceYear } from "@/lib/appwrite/rec-registrations"
import "../../../../rec-dashboard.css"

export default function EditRecRegistrationPage({ params }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const unwrappedParams = React.use(params)
  const registrationId = unwrappedParams.registrationId
  const appwriteServices = useAppwrite()
  const { isSeniorManager, canPerformModuleAction, MODULES } = useAuth()

  const requestedYear = Number(searchParams.get("year")) || null
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "edit")
  const hasAccess = canEditRec || isSeniorManager()

  const [availableYears, setAvailableYears] = useState([])
  const [selectedYear, setSelectedYear] = useState(requestedYear || new Date().getFullYear())
  const [conference, setConference] = useState(null)
  const [registration, setRegistration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const initialize = async () => {
      if (!appwriteServices || !hasAccess) return

      try {
        const [years, active, registrationData] = await Promise.all([
          getConferenceYears(appwriteServices),
          getActiveRecConference(appwriteServices),
          getRecRegistrationById(registrationId, appwriteServices)
        ])

        setAvailableYears(years)
        setRegistration(registrationData)

        const registrationYears = Array.isArray(registrationData.conferenceYears)
          ? registrationData.conferenceYears
          : []
        const year = requestedYear || active?.year || registrationYears[registrationYears.length - 1] || years[0] || new Date().getFullYear()
        setSelectedYear(year)
      } catch (err) {
        console.error("Error loading registration:", err)
        setError("Failed to load registration details.")
      } finally {
        setLoading(false)
      }
    }

    initialize()
  }, [appwriteServices, hasAccess, registrationId, requestedYear])

  useEffect(() => {
    const loadConference = async () => {
      if (!appwriteServices || !selectedYear || !hasAccess) return

      try {
        const data = await getRecConferenceByYear(selectedYear, appwriteServices)
        setConference(data)
      } catch (err) {
        console.error("Error loading conference:", err)
        setError("Failed to load selected conference.")
      }
    }

    loadConference()
  }, [appwriteServices, selectedYear, hasAccess])

  const handleSubmit = async (payload, options) => {
    if (!conference) return

    setIsSaving(true)
    setError(null)
    try {
      const saved = await updateRegistrationForConferenceYear(registrationId, payload, selectedYear, appwriteServices)

      if (options.sendConfirmation) {
        await sendConfirmationEmail(
          { ...payload, conferenceYears: saved.conferenceYears },
          selectedYear,
          conference.sponsorshipPackageUrl
        )
      }

      router.push(`/dashboard/rec-conference/admin/registrations?year=${selectedYear}`)
    } catch (err) {
      console.error("Error updating registration:", err)
      setError(err?.message || "Failed to update registration.")
      setIsSaving(false)
    }
  }

  if (!hasAccess) {
    return (
      <Container className="py-4 text-center">
        <Alert variant="danger">You do not have permission to edit REC registrations.</Alert>
      </Container>
    )
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
        <Breadcrumb.Item linkAs={Link} href="/dashboard/rec-conference/admin/registrations">Registrations</Breadcrumb.Item>
        <Breadcrumb.Item active>Edit</Breadcrumb.Item>
      </Breadcrumb>

      <div className="rec-dashboard-header">
        <h2 className="rec-header-gradient">Edit REC Registration</h2>
        <p className="text-muted">Update registration details for the selected conference year.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Form.Group className="mb-4" style={{ maxWidth: 320 }}>
        <Form.Label>Conference Year</Form.Label>
        <Form.Select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
          {availableYears.map(year => (
            <option key={year} value={year}>REC {year}</option>
          ))}
        </Form.Select>
      </Form.Group>

      <AdminRegistrationForm
        mode="edit"
        conference={conference}
        initialData={registration}
        isSaving={isSaving}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/dashboard/rec-conference/admin/registrations?year=${selectedYear}`)}
      />
    </div>
  )
}
