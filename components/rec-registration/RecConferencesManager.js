"use client"

import { useState, useEffect } from "react"
import { Card, Table, Button, Badge, Alert } from "@/components/ui/portal-kit"
import { useAppwrite } from "@/lib/appwrite/provider"
import { 
  getAllRecConferences,
  setActiveConference,
  initializeDefaultConferences
} from "@/lib/appwrite/rec-conferences"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faPlus, faCheck, faCalendarPlus, faEye } from "@fortawesome/free-solid-svg-icons"
import { formatAppwriteDate } from "@/lib/utils"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import { useRouter } from "next/navigation"

export default function RecConferencesManager() {
  const appwriteServices = useAppwrite()
  const router = useRouter()
  
  const [conferences, setConferences] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const fetchConferences = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getAllRecConferences(appwriteServices)
      setConferences(response.documents)
    } catch (err) {
      setError("Error fetching conferences. Please try again.")
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (appwriteServices) {
      fetchConferences()
    }
  }, [appwriteServices])

  const handleSetActive = async (year) => {
    try {
      await setActiveConference(year, appwriteServices)
      await fetchConferences()
      setSuccess(`${formatRecEdition(year)} is now the active conference!`)
    } catch (err) {
      setError("Error setting active conference. Please try again.")
      console.error("Set active error:", err)
    }
  }

  const handleInitialize = async () => {
    try {
      await initializeDefaultConferences(appwriteServices)
      await fetchConferences()
      setSuccess("Default conferences initialized successfully!")
    } catch (err) {
      setError("Error initializing conferences. Please try again.")
      console.error("Initialize error:", err)
    }
  }

  const getRegistrationMode = (conference) => {
    if (!conference.registrationOpen) {
      return { label: "Reg Closed", variant: "secondary" }
    }

    if (conference.couponRequired) {
      return { label: "Coupon Required", variant: "warning" }
    }

    return { label: "Reg Open", variant: "primary" }
  }

  if (loading) {
    return <div className="text-center py-5">Loading conferences...</div>
  }

  return (
    <Card className="border-0 shadow-sm">
      <Card.Header className="d-flex justify-content-between align-items-center bg-white py-3 border-bottom-0">
        <h5 className="mb-0 fw-bold" style={{ color: "#2E9ECC" }}>Conference List</h5>
        <div>
          <Button 
            style={{ backgroundColor: "#2E9ECC", borderColor: "#2E9ECC" }}
            size="sm" 
            onClick={() => router.push('/dashboard/rec-conference/admin/conferences/new')}
            className="me-2 text-white"
          >
            <FontAwesomeIcon icon={faPlus} className="me-1" />
            New Conference
          </Button>
          {conferences.length === 0 && (
            <Button 
              variant="outline-success" 
              size="sm" 
              onClick={handleInitialize}
            >
              <FontAwesomeIcon icon={faCalendarPlus} className="me-1" />
              Initialize Default
            </Button>
          )}
        </div>
      </Card.Header>
      
      <Card.Body className="p-0">
        <div className="p-3">
          {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
          {success && <Alert variant="success" dismissible onClose={() => setSuccess(null)}>{success}</Alert>}
        </div>
        
        {conferences.length === 0 ? (
          <div className="text-center py-5">
            <p className="text-muted">No conferences configured yet.</p>
            <Button style={{ backgroundColor: "#2E9ECC", borderColor: "#2E9ECC" }} onClick={handleInitialize}>
              <FontAwesomeIcon icon={faCalendarPlus} className="me-2" />
              Initialize Default Conferences
            </Button>
          </div>
        ) : (
          <div className="table-responsive">
            <Table hover className="mb-0 align-middle">
              <thead className="bg-light text-muted">
                <tr>
                  <th className="ps-4 fw-normal border-0 py-3">Year</th>
                  <th className="fw-normal border-0 py-3">Title</th>
                  <th className="fw-normal border-0 py-3">Dates</th>
                  <th className="fw-normal border-0 py-3">Status</th>
                  <th className="pe-4 text-end fw-normal border-0 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {conferences.map((conference) => (
                  <tr key={conference.$id}>
                    <td className="ps-4">
                      <strong>{conference.year}</strong>
                      {conference.isActive && (
                        <Badge bg="success" className="ms-2">Active</Badge>
                      )}
                    </td>
                    <td>
                      <span className="fw-semibold text-dark">{conference.title}</span>
                      {conference.theme && <div className="text-muted small">{conference.theme}</div>}
                    </td>
                    <td>
                      {formatAppwriteDate(conference.startDate)} to {formatAppwriteDate(conference.endDate)}
                    </td>
                    <td>
                      <Badge bg={getRegistrationMode(conference).variant}>
                        {getRegistrationMode(conference).label}
                      </Badge>
                    </td>
                    <td className="pe-4 text-end">
                      {!conference.isActive && (
                        <Button
                          variant="outline-success"
                          size="sm"
                          onClick={() => handleSetActive(conference.year)}
                          title="Set as Active"
                          className="me-2"
                        >
                          <FontAwesomeIcon icon={faCheck} />
                        </Button>
                      )}
                      <Button
                        style={{ color: "#2E9ECC", borderColor: "rgba(46, 158, 204, 0.2)" }}
                        variant="outline-primary"
                        size="sm"
                        onClick={() => router.push(`/dashboard/rec-conference/admin/conferences/${conference.$id}`)}
                        title="View Details"
                      >
                        <FontAwesomeIcon icon={faEye} className="me-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
    </Card>
  )
}
