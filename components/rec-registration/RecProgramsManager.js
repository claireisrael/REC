"use client"

import { useCallback, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faPlus, faEdit, faTrash, faEye, faSearch, faCog,
  faCalendarDays, faList, faBuilding, faCalendarAlt
} from "@fortawesome/free-solid-svg-icons"
import { useAppwrite } from "@/lib/appwrite/provider"
import { useAuth } from "@/lib/auth/auth-provider"
import {
  deleteRecProgram,
  getProgramsByConference,
  getOrCreateDefaultProgram,
  generateProgramDays,
  PROGRAM_STATUS,
  getProgramStatusConfig
} from "@/lib/appwrite/rec-programmes"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"

const getStatusClass = (status) => {
  if (status === PROGRAM_STATUS.PUBLISHED) return "rec-status rec-status-published"
  if (status === PROGRAM_STATUS.ARCHIVED) return "rec-status rec-status-archived"
  return "rec-status rec-status-draft"
}

export default function RecProgramsManager() {
  const appwriteServices = useAppwrite()
  const { user } = useAuth()
  const router = useRouter()

  const [programs, setPrograms] = useState([])
  const [conferences, setConferences] = useState([])
  const [selectedConference, setSelectedConference] = useState("")
  const [currentConference, setCurrentConference] = useState(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedProgram, setSelectedProgram] = useState(null)

  const fetchProgramsForConference = useCallback(async (conferenceId) => {
    if (!appwriteServices || !conferenceId) {
      setPrograms([])
      return
    }

    try {
      const response = await getProgramsByConference(conferenceId, appwriteServices)
      setPrograms(response.documents)
    } catch (err) {
      console.error("Error fetching programs for conference:", err)
      setPrograms([])
    }
  }, [appwriteServices])

  useEffect(() => {
    const initializeComponent = async () => {
      if (!appwriteServices) return

      try {
        const conferencesResponse = await getAllRecConferences(appwriteServices)
        setConferences(conferencesResponse.documents)

        const activeConference = conferencesResponse.documents.find(conf => conf.isActive)
        if (activeConference) {
          setSelectedConference(activeConference.$id)
          setCurrentConference(activeConference)
          await fetchProgramsForConference(activeConference.$id)
        } else {
          setPrograms([])
        }
      } catch (err) {
        setError("Error initializing programs. Please try again.")
        console.error("Initialize error:", err)
      } finally {
        setLoading(false)
      }
    }

    initializeComponent()
  }, [appwriteServices, fetchProgramsForConference])

  const fetchPrograms = async (conferenceId = selectedConference) => {
    if (!appwriteServices) return
    setLoading(true)
    setError(null)

    try {
      if (conferenceId) {
        const response = await getProgramsByConference(conferenceId, appwriteServices)
        setPrograms(response.documents)
      } else {
        setPrograms([])
      }
    } catch (err) {
      setError("Error fetching programs. Please try again.")
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleConferenceChange = async (conferenceId) => {
    setSelectedConference(conferenceId)
    setCurrentConference(conferences.find(conf => conf.$id === conferenceId) || null)
    setSearchTerm("")
    await fetchProgramsForConference(conferenceId)
  }

  const handleDelete = async () => {
    if (!selectedProgram) return
    setDeleting(true)

    try {
      await deleteRecProgram(selectedProgram.$id, appwriteServices)
      await fetchPrograms()
      setShowDeleteModal(false)
      setSelectedProgram(null)
      setSuccess("Program deleted successfully.")
    } catch (err) {
      setError("Error deleting program. Please try again.")
      console.error("Delete error:", err)
    } finally {
      setDeleting(false)
    }
  }

  const filteredPrograms = !searchTerm.trim()
    ? programs
    : programs.filter(program =>
        program.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        program.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        program.slug?.toLowerCase().includes(searchTerm.toLowerCase())
      )

  const createDefaultProgram = async () => {
    if (!currentConference) return
    setCreating(true)

    try {
      await getOrCreateDefaultProgram(selectedConference, currentConference, appwriteServices, user.$id)
      await fetchPrograms()
      setSuccess("Default program created.")
    } catch (err) {
      setError("Error creating default program.")
      console.error("Auto-create error:", err)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="rec-spinner-wrap">
        <div className="rec-spinner" />
        <p className="mt-3">Loading programs...</p>
      </div>
    )
  }

  return (
    <>
      <div className="rec-grid rec-grid-two mb-4">
        <div className="rec-panel">
          <div className="rec-panel-body">
            <label className="rec-field">
              <span className="rec-label">Select Conference</span>
              <select
                value={selectedConference}
                onChange={(event) => handleConferenceChange(event.target.value)}
                className="rec-select"
              >
                <option value="">All Conferences</option>
                {conferences.map(conference => (
                  <option key={conference.$id} value={conference.$id}>
                    {conference.title} {conference.isActive ? "(Active)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="rec-stats-grid">
          <div className="rec-stat-tile">
            <span className="rec-stat-number">{filteredPrograms.length}</span>
            <span className="rec-stat-label">Total</span>
          </div>
          <div className="rec-stat-tile">
            <span className="rec-stat-number" style={{ color: "#059669" }}>
              {filteredPrograms.filter(program => program.status === PROGRAM_STATUS.PUBLISHED).length}
            </span>
            <span className="rec-stat-label">Published</span>
          </div>
          <div className="rec-stat-tile">
            <span className="rec-stat-number" style={{ color: "#d99a00" }}>
              {filteredPrograms.filter(program => program.status === PROGRAM_STATUS.DRAFT).length}
            </span>
            <span className="rec-stat-label">Drafts</span>
          </div>
        </div>
      </div>

      <div className="rec-panel mb-4">
        <div className="rec-panel-body">
          <div className="rec-toolbar">
            <label className="rec-field">
              <span className="rec-label">Search Programs</span>
              <span className="rec-search">
                <FontAwesomeIcon icon={faSearch} />
                <input
                  className="rec-input"
                  placeholder="Search by title, description, or slug"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </span>
            </label>
            <div />
            {searchTerm ? (
              <button className="rec-btn rec-btn-outline" onClick={() => setSearchTerm("")}>
                Clear Search
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rec-panel">
        <div className="rec-panel-header">
          <h5 className="rec-panel-title">
            <FontAwesomeIcon icon={faList} />
            Programs List
            {currentConference && <span className="rec-muted">({currentConference.title})</span>}
          </h5>
          <div className="rec-page-actions">
            <button
              className="rec-btn rec-btn-outline"
              onClick={createDefaultProgram}
              disabled={!selectedConference || creating}
            >
              <FontAwesomeIcon icon={faCog} />
              {creating ? "Creating..." : "Auto-Create Default"}
            </button>
            <button
              className="rec-btn rec-btn-primary"
              onClick={() => router.push(`/dashboard/rec-conference/admin/programs/new?conferenceId=${selectedConference}`)}
              disabled={!selectedConference}
            >
              <FontAwesomeIcon icon={faPlus} />
              New Program
            </button>
          </div>
        </div>

        {error && (
          <div className="rec-alert rec-alert-danger m-3">
            <strong>Error</strong>
            <p className="mb-0">{error}</p>
          </div>
        )}
        {success && (
          <div className="rec-alert rec-alert-success m-3">
            <strong>Success</strong>
            <p className="mb-0">{success}</p>
          </div>
        )}

        {!selectedConference ? (
          <div className="rec-empty-state">
            <FontAwesomeIcon icon={faList} size="3x" />
            <h5 className="rec-empty-title">Select a Conference</h5>
            <p>Choose a conference above to manage its programs.</p>
          </div>
        ) : filteredPrograms.length === 0 ? (
          <div className="rec-empty-state">
            <FontAwesomeIcon icon={faList} size="3x" />
            <h5 className="rec-empty-title">No Programs Found</h5>
            <p>Create your first program to get started.</p>
            <div className="rec-page-actions" style={{ justifyContent: "center", marginTop: 18 }}>
              <button className="rec-btn rec-btn-outline" onClick={createDefaultProgram} disabled={creating}>
                <FontAwesomeIcon icon={faCog} />
                Auto-Create Default
              </button>
              <button className="rec-btn rec-btn-primary" onClick={() => router.push(`/dashboard/rec-conference/admin/programs/new?conferenceId=${selectedConference}`)}>
                <FontAwesomeIcon icon={faPlus} />
                Create First Program
              </button>
            </div>
          </div>
        ) : (
          <div className="rec-table-wrap">
            <table className="rec-table">
              <thead>
                <tr>
                  <th>Program Details</th>
                  <th>Configuration</th>
                  <th>Venues</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrograms.map((program) => {
                  const statusConfig = getProgramStatusConfig(program.status)
                  const programDays = generateProgramDays(program.daysCount)

                  return (
                    <tr key={program.$id}>
                      <td>
                        <div className="rec-row-title">{program.title}</div>
                        {program.description && (
                          <div className="rec-row-desc">
                            {program.description.substring(0, 90)}{program.description.length > 90 ? "..." : ""}
                          </div>
                        )}
                        {program.slug && <span className="rec-chip mt-2">{program.slug}</span>}
                      </td>
                      <td>
                        <div>
                          <FontAwesomeIcon icon={faCalendarDays} className="me-2" style={{ color: "#2E9ECC" }} />
                          <strong>{program.daysCount}</strong> <span className="rec-muted">days</span>
                        </div>
                        <div className="rec-row-desc">
                          {programDays.map(day => day.label).join(", ")}
                        </div>
                      </td>
                      <td>
                        <div>
                          <FontAwesomeIcon icon={faBuilding} className="me-2" style={{ color: "#d99a00" }} />
                          <strong>{program.venueHalls?.length || 0}</strong> <span className="rec-muted">venues</span>
                        </div>
                        {program.venueHalls?.length ? (
                          <div className="rec-chip-list mt-2" style={{ padding: 0, border: 0, background: "transparent" }}>
                            {program.venueHalls.slice(0, 2).map((venue, index) => (
                              <span key={index} className="rec-chip">{venue}</span>
                            ))}
                            {program.venueHalls.length > 2 && (
                              <span className="rec-chip">+{program.venueHalls.length - 2}</span>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={getStatusClass(program.status)}>
                          <span>{statusConfig.icon}</span>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td>
                        <div className="rec-page-actions" style={{ justifyContent: "flex-end" }}>
                          <button
                            className="rec-icon-button"
                            onClick={() => router.push(`/dashboard/rec-conference/admin/programs/${program.$id}/sessions`)}
                            title="Manage Sessions"
                          >
                            <FontAwesomeIcon icon={faCalendarAlt} />
                          </button>
                          <button
                            className="rec-icon-button"
                            onClick={() => router.push(`/dashboard/rec-conference/admin/programs/${program.$id}`)}
                            title="View Details"
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>
                          <button
                            className="rec-icon-button"
                            onClick={() => router.push(`/dashboard/rec-conference/admin/programs/edit/${program.$id}`)}
                            title="Edit Program"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </button>
                          <button
                            className="rec-icon-button rec-icon-button-danger"
                            onClick={() => {
                              setSelectedProgram(program)
                              setShowDeleteModal(true)
                            }}
                            title="Delete Program"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDeleteModal && (
        <div className="rec-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-program-title">
          <div className="rec-modal">
            <div className="rec-modal-header">
              <h3 id="delete-program-title" className="rec-modal-title">Confirm Deletion</h3>
            </div>
            <div className="rec-modal-body">
              <p>Are you sure you want to delete this program? <strong>This action cannot be undone.</strong></p>
              {selectedProgram && (
                <div className="rec-chip-list mt-3">
                  <span className="rec-chip">Program: {selectedProgram.title}</span>
                  <span className="rec-chip">Days: {selectedProgram.daysCount}</span>
                  <span className="rec-chip">Venues: {selectedProgram.venueHalls?.length || 0}</span>
                </div>
              )}
            </div>
            <div className="rec-modal-footer">
              <button className="rec-btn rec-btn-outline" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="rec-btn" style={{ background: "#dc2626", color: "#ffffff" }} onClick={handleDelete} disabled={deleting}>
                <FontAwesomeIcon icon={faTrash} />
                {deleting ? "Deleting..." : "Delete Program"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
