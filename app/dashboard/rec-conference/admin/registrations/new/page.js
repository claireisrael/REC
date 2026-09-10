"use client"

import { useEffect, useState } from "react"
import { Alert, Breadcrumb, Container, Form, Spinner } from "@/components/ui/portal-kit"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth/auth-provider"
import { useAppwrite } from "@/lib/appwrite/provider"
import AdminRegistrationForm from "@/components/rec-registration/AdminRegistrationForm"
import { getActiveRecConference, getConferenceYears, getRecConferenceByYear } from "@/lib/appwrite/rec-conferences"
import { getRecRegistrationByEmail, registerForConferenceYear, sendConfirmationEmail } from "@/lib/appwrite/rec-registrations"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import "../../../rec-dashboard.css"

export default function NewRecRegistrationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appwriteServices = useAppwrite()
  const { isSeniorManager, canPerformModuleAction, MODULES } = useAuth()

  const requestedYear = Number(searchParams.get("year")) || null
  const canEditRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "edit")
  const hasAccess = canEditRec || isSeniorManager()

  const [availableYears, setAvailableYears] = useState([])
  const [selectedYear, setSelectedYear] = useState(requestedYear || new Date().getFullYear())
  const [conference, setConference] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const initialize = async () => {
      if (!appwriteServices || !hasAccess) return

      try {
        const [years, active] = await Promise.all([
          getConferenceYears(appwriteServices),
          getActiveRecConference(appwriteServices)
        ])

        setAvailableYears(years)
        const year = requestedYear || active?.year || years[0] || new Date().getFullYear()
        setSelectedYear(year)
      } catch (err) {
        console.error("Error loading conferences:", err)
        setError("Failed to load conference years.")
      } finally {
        setLoading(false)
      }
    }

    initialize()
  }, [appwriteServices, hasAccess, requestedYear])

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
      const saved = await registerForConferenceYear(payload.email, payload, selectedYear, appwriteServices)

      let mailFailed = false
      if (options.sendConfirmation) {
        try {
          await sendConfirmationEmail(
            { ...payload, conferenceYears: saved.conferenceYears },
            selectedYear,
            conference.sponsorshipPackageUrl
          )
        } catch (emailErr) {
          console.error("Confirmation email failed after registration save:", emailErr)
          mailFailed = true
        }
      }

      const mailQuery = mailFailed ? "&mail=failed" : ""
      router.push(`/dashboard/rec-conference/admin/registrations?year=${selectedYear}${mailQuery}`)
    } catch (err) {
      console.error("Error creating registration:", err)
      setError(err?.message || "Failed to save registration.")
      setIsSaving(false)
    }
  }

  const handleEmailLookup = async (email) => {
    return await getRecRegistrationByEmail(email, appwriteServices)
  }

  if (!hasAccess) {
    return (
      <Container className="py-4 text-center">
        <Alert variant="danger">You do not have permission to create REC registrations.</Alert>
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
        <Breadcrumb.Item active>New</Breadcrumb.Item>
      </Breadcrumb>

      <div className="rec-dashboard-header">
        <h2 className="rec-header-gradient">New REC Registration</h2>
        <p className="text-muted">Create a registration as an admin, regardless of public registration status.</p>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <Form.Group className="mb-4" style={{ maxWidth: 320 }}>
        <Form.Label>Conference Year</Form.Label>
        <Form.Select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
          {availableYears.map(year => (
            <option key={year} value={year}>{formatRecEdition(year)}</option>
          ))}
        </Form.Select>
      </Form.Group>

      <AdminRegistrationForm
        mode="create"
        conference={conference}
        isSaving={isSaving}
        onEmailLookup={handleEmailLookup}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/dashboard/rec-conference/admin/registrations?year=${selectedYear}`)}
      />
    </div>
  )
}
