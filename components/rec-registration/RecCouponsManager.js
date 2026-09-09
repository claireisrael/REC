"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Query } from "appwrite"
import { useAppwrite } from "@/lib/appwrite/provider"
import { useAuth } from "@/lib/auth/auth-provider"
import {
  createRecCoupon,
  deleteRecCoupon,
  generateCouponCode,
  getRecCouponAnalytics,
  getRecCoupons,
  getRecCouponsByConference,
  updateRecCoupon,
} from "@/lib/appwrite/rec-coupons"
import { getAllRecConferences } from "@/lib/appwrite/rec-conferences"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faChartBar,
  faChevronLeft,
  faChevronRight,
  faCopy,
  faEdit,
  faPlus,
  faRefresh,
  faSearch,
  faSpinner,
  faTimes,
  faTrash,
  faTicket,
} from "@fortawesome/free-solid-svg-icons"
import { formatAppwriteDate } from "@/lib/utils"

const sectorOptions = [
  "Public",
  "Private",
  "Civil Society Organization",
  "Academia",
  "Other",
]

const pageSizeOptions = [10, 25, 50, 100]

const defaultFormData = {
  coupon: "",
  organization: "",
  sector: "",
  numberOfUsers: 1,
  type: "attendee",
  conference: "",
  autoGenerate: true,
  codeLength: 8,
}

const emptyAnalytics = {
  total: 0,
  active: 0,
  inactive: 0,
  totalUsers: 0,
  usersUsed: 0,
  usersLeft: 0,
  byType: { attendee: 0, exhibitor: 0 },
  bySector: {},
  topOrganizations: [],
  mostUsedCoupons: [],
}

function normalizeInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getCouponState(coupon) {
  if (Number(coupon.usersLeft || 0) <= 0) {
    return { label: "Exhausted", className: "rec-status-archived" }
  }

  if (coupon.isActive) {
    return { label: "Active", className: "rec-status-published" }
  }

  return { label: "Inactive", className: "rec-status-draft" }
}

function getUsagePercent(coupon) {
  const total = Math.max(1, Number(coupon.numberOfUsers || 0))
  const used = Math.max(0, total - Number(coupon.usersLeft || 0))
  return Math.min(100, Math.round((used / total) * 100))
}

function CouponModal({ title, children, footer, onClose }) {
  return (
    <div className="rec-modal-backdrop" role="presentation">
      <div className="rec-modal rec-modal-wide" role="dialog" aria-modal="true" aria-labelledby="coupon-modal-title">
        <div className="rec-modal-header rec-modal-header-flex">
          <h3 id="coupon-modal-title" className="rec-modal-title rec-modal-title-dark">
            {title}
          </h3>
          <button type="button" className="rec-icon-button" onClick={onClose} aria-label="Close modal">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="rec-modal-body">{children}</div>
        {footer && <div className="rec-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export default function RecCouponsManager() {
  const appwriteServices = useAppwrite()
  const { user } = useAuth()

  const [coupons, setCoupons] = useState([])
  const [conferences, setConferences] = useState([])
  const [selectedConference, setSelectedConference] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [analytics, setAnalytics] = useState(emptyAnalytics)
  const [totalCoupons, setTotalCoupons] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false)
  const [selectedCoupon, setSelectedCoupon] = useState(null)
  const [formData, setFormData] = useState(defaultFormData)

  const totalPages = Math.max(1, Math.ceil(totalCoupons / pageSize))
  const visibleCoupons = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) return coupons

    return coupons.filter((coupon) => {
      return [
        coupon.coupon,
        coupon.organization,
        coupon.sector,
        coupon.type,
        coupon.conference ? `rec ${coupon.conference}` : "",
      ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch))
    })
  }, [coupons, searchTerm])

  const buildListQueries = useCallback(() => {
    const queries = []
    if (typeFilter) queries.push(Query.equal("type", typeFilter))
    return queries
  }, [typeFilter])

  const loadAnalytics = useCallback(
    async (conferenceYear) => {
      if (!appwriteServices) return

      setAnalyticsLoading(true)
      try {
        const data = await getRecCouponAnalytics(conferenceYear || null, appwriteServices)
        setAnalytics(data)
      } catch (err) {
        console.error("Coupon analytics error:", err)
        setAnalytics(emptyAnalytics)
      } finally {
        setAnalyticsLoading(false)
      }
    },
    [appwriteServices]
  )

  const loadCoupons = useCallback(
    async ({ conferenceYear = selectedConference, nextPage = page, nextPageSize = pageSize } = {}) => {
      if (!appwriteServices) return

      setLoading(true)
      setError("")

      try {
        const offset = (nextPage - 1) * nextPageSize
        const queries = buildListQueries()
        const response = conferenceYear
          ? await getRecCouponsByConference(conferenceYear, appwriteServices, queries, nextPageSize, offset)
          : await getRecCoupons(appwriteServices, queries, nextPageSize, offset)

        setCoupons(response.documents || [])
        setTotalCoupons(response.total || 0)

        if ((response.documents || []).length === 0 && nextPage > 1) {
          setPage(nextPage - 1)
        }
      } catch (err) {
        console.error("Coupon fetch error:", err)
        setError("Error fetching coupons. Please try again.")
      } finally {
        setLoading(false)
      }
    },
    [appwriteServices, buildListQueries, page, pageSize, selectedConference]
  )

  useEffect(() => {
    if (!appwriteServices) return

    let isMounted = true

    const initialize = async () => {
      setLoading(true)
      setError("")

      try {
        const response = await getAllRecConferences(appwriteServices)
        if (!isMounted) return

        const conferenceRows = response.documents || []
        const activeConference = conferenceRows.find((conference) => conference.isActive)
        const defaultConference = activeConference?.year || conferenceRows[0]?.year || ""

        setConferences(conferenceRows)
        setSelectedConference(defaultConference)
        setFormData((previous) => ({ ...previous, conference: defaultConference }))
      } catch (err) {
        console.error("Coupon initialization error:", err)
        if (isMounted) {
          setError("Error initializing coupons. Please try again.")
          setLoading(false)
        }
      }
    }

    initialize()

    return () => {
      isMounted = false
    }
  }, [appwriteServices])

  useEffect(() => {
    if (!appwriteServices) return
    loadCoupons({ nextPage: page, nextPageSize: pageSize })
    loadAnalytics(selectedConference)
  }, [appwriteServices, loadCoupons, loadAnalytics, page, pageSize, selectedConference, typeFilter])

  const resetForm = useCallback(() => {
    setFormData({
      ...defaultFormData,
      conference: selectedConference || "",
    })
  }, [selectedConference])

  const handleInputChange = (field, value) => {
    setFormData((previous) => ({ ...previous, [field]: value }))
  }

  const openCreateModal = () => {
    resetForm()
    setShowCreateModal(true)
  }

  const generatePreviewCode = () => {
    setFormData((previous) => ({ ...previous, coupon: generateCouponCode(previous.codeLength) }))
  }

  const validateForm = () => {
    if (!String(formData.organization || "").trim()) return "Sponsoring organization is required."
    if (!formData.sector) return "Please select the sponsoring organization's sector."
    if (normalizeInteger(formData.numberOfUsers, 0) < 1) return "Number of users must be at least 1."
    if (!formData.conference) return "Please select a conference."
    if (!formData.autoGenerate && !String(formData.coupon || "").trim()) {
      return "Please enter a coupon code or enable auto-generation."
    }
    if (!formData.autoGenerate && String(formData.coupon || "").trim().length > 10) {
      return "Coupon code cannot exceed 10 characters."
    }
    return ""
  }

  const refreshCurrentPage = async () => {
    await loadCoupons({ nextPage: page, nextPageSize: pageSize })
    await loadAnalytics(selectedConference)
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setError("")
    setSuccess("")

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setCreating(true)
    try {
      await createRecCoupon(formData, appwriteServices, user?.$id || "user")
      setSelectedConference(formData.conference)
      setPage(1)
      setShowCreateModal(false)
      resetForm()
      setSuccess("Coupon created successfully.")
      await loadCoupons({ conferenceYear: formData.conference, nextPage: 1, nextPageSize: pageSize })
      await loadAnalytics(formData.conference)
    } catch (err) {
      console.error("Coupon create error:", err)
      setError(err.message || "Error creating coupon. Please try again.")
    } finally {
      setCreating(false)
    }
  }

  const handleEdit = (coupon) => {
    setSelectedCoupon(coupon)
    setFormData({
      coupon: coupon.coupon,
      organization: coupon.organization,
      sector: coupon.sector,
      numberOfUsers: coupon.numberOfUsers,
      type: coupon.type,
      conference: coupon.conference,
      autoGenerate: false,
      codeLength: 8,
    })
    setShowEditModal(true)
  }

  const handleUpdate = async (event) => {
    event.preventDefault()
    if (!selectedCoupon) return

    setUpdating(true)
    setError("")
    setSuccess("")

    try {
      const numberOfUsers = normalizeInteger(formData.numberOfUsers, 1)
      const currentUsed = Math.max(0, Number(selectedCoupon.numberOfUsers || 0) - Number(selectedCoupon.usersLeft || 0))
      const newUsersLeft = Math.max(0, numberOfUsers - currentUsed)

      await updateRecCoupon(
        selectedCoupon.$id,
        {
          organization: formData.organization,
          sector: formData.sector,
          numberOfUsers,
          usersLeft: newUsersLeft,
        },
        appwriteServices
      )

      setShowEditModal(false)
      setSelectedCoupon(null)
      resetForm()
      setSuccess("Coupon updated successfully.")
      await refreshCurrentPage()
    } catch (err) {
      console.error("Coupon update error:", err)
      setError("Error updating coupon. Please try again.")
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedCoupon) return

    setDeleting(true)
    setError("")
    setSuccess("")

    try {
      await deleteRecCoupon(selectedCoupon.$id, appwriteServices)
      setShowDeleteModal(false)
      setSelectedCoupon(null)
      setSuccess("Coupon deleted successfully.")
      await refreshCurrentPage()
    } catch (err) {
      console.error("Coupon delete error:", err)
      setError("Error deleting coupon. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setSuccess(`Copied "${text}" to clipboard.`)
    } catch {
      setError("Could not copy coupon code.")
    }
  }

  const handleConferenceChange = (value) => {
    setSelectedConference(value ? Number(value) : "")
    setPage(1)
  }

  const handleTypeFilterChange = (value) => {
    setTypeFilter(value)
    setPage(1)
  }

  const startRecord = totalCoupons === 0 ? 0 : (page - 1) * pageSize + 1
  const endRecord = Math.min(totalCoupons, page * pageSize)

  return (
    <>
      <section className="rec-coupon-summary">
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{analyticsLoading ? "-" : analytics.total}</span>
          <span className="rec-stat-label">Total coupons</span>
        </div>
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{analyticsLoading ? "-" : analytics.active}</span>
          <span className="rec-stat-label">Active</span>
        </div>
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{analyticsLoading ? "-" : analytics.usersUsed}</span>
          <span className="rec-stat-label">Used seats</span>
        </div>
        <div className="rec-coupon-summary-card">
          <span className="rec-stat-number">{analyticsLoading ? "-" : analytics.usersLeft}</span>
          <span className="rec-stat-label">Seats left</span>
        </div>
      </section>

      <section className="rec-panel">
        <div className="rec-panel-header">
          <div>
            <h3 className="rec-panel-title">
              <FontAwesomeIcon icon={faTicket} />
              Coupon allocations
            </h3>
            <p className="rec-muted mb-0 mt-1">
              Listing uses Appwrite pagination. Search filters the current page only.
            </p>
          </div>
          <div className="rec-page-actions">
            <button
              type="button"
              className="rec-btn rec-btn-outline"
              onClick={() => setShowAnalyticsModal(true)}
              disabled={analyticsLoading}
            >
              <FontAwesomeIcon icon={faChartBar} />
              Analytics
            </button>
            <button type="button" className="rec-btn rec-btn-primary" onClick={openCreateModal}>
              <FontAwesomeIcon icon={faPlus} />
              New Coupon
            </button>
            <button type="button" className="rec-icon-button" onClick={refreshCurrentPage} aria-label="Refresh coupons">
              <FontAwesomeIcon icon={faRefresh} />
            </button>
          </div>
        </div>

        <div className="rec-panel-body">
          {error && (
            <div className="rec-alert rec-alert-danger mb-3">
              <p className="mb-0">{error}</p>
            </div>
          )}
          {success && (
            <div className="rec-alert rec-alert-success mb-3">
              <p className="mb-0">{success}</p>
            </div>
          )}

          <div className="rec-coupon-toolbar">
            <div className="rec-field">
              <label className="rec-label" htmlFor="conference-filter">Conference</label>
              <select
                id="conference-filter"
                className="rec-select"
                value={selectedConference}
                onChange={(event) => handleConferenceChange(event.target.value)}
              >
                <option value="">All Conferences</option>
                {conferences.map((conference) => (
                  <option key={conference.$id || conference.year} value={conference.year}>
                    REC {conference.year} {conference.isActive ? "(Active)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="type-filter">Type</label>
              <select
                id="type-filter"
                className="rec-select"
                value={typeFilter}
                onChange={(event) => handleTypeFilterChange(event.target.value)}
              >
                <option value="">All Types</option>
                <option value="attendee">Attendee</option>
                <option value="exhibitor">Exhibitor</option>
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="page-size">Rows</label>
              <select
                id="page-size"
                className="rec-select"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value))
                  setPage(1)
                }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>{size} per page</option>
                ))}
              </select>
            </div>

            <div className="rec-field">
              <label className="rec-label" htmlFor="coupon-search">Search current page</label>
              <div className="rec-search">
                <FontAwesomeIcon icon={faSearch} />
                <input
                  id="coupon-search"
                  className="rec-input"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Code, sponsoring organization, sector..."
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rec-spinner-wrap">
              <div className="rec-spinner" />
              <p className="mt-3">Loading coupons...</p>
            </div>
          ) : visibleCoupons.length === 0 ? (
            <div className="rec-empty-state">
              <FontAwesomeIcon icon={faTicket} size="2x" />
              <h4 className="rec-empty-title">No coupons found</h4>
              <p>Create a coupon allocation or adjust the current filters.</p>
              <button type="button" className="rec-btn rec-btn-primary" onClick={openCreateModal}>
                <FontAwesomeIcon icon={faPlus} />
                Create Coupon
              </button>
            </div>
          ) : (
            <div className="rec-table-wrap rec-responsive-table mt-3">
              <table className="rec-table rec-coupon-table">
                <thead>
                  <tr>
                    <th>Coupon</th>
                    <th>Sponsoring Organization</th>
                    <th>Type</th>
                    <th>Usage</th>
                    <th>Conference</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCoupons.map((coupon) => {
                    const status = getCouponState(coupon)
                    const usagePercent = getUsagePercent(coupon)
                    const usedSeats = Number(coupon.numberOfUsers || 0) - Number(coupon.usersLeft || 0)

                    return (
                      <tr key={coupon.$id}>
                        <td data-label="Coupon">
                          <div className="rec-coupon-code-row">
                            <code className="rec-coupon-code">{coupon.coupon}</code>
                            <button
                              type="button"
                              className="rec-icon-button"
                              onClick={() => copyToClipboard(coupon.coupon)}
                              aria-label={`Copy ${coupon.coupon}`}
                            >
                              <FontAwesomeIcon icon={faCopy} />
                            </button>
                          </div>
                        </td>
                        <td data-label="Sponsoring Organization">
                          <div className="rec-row-title">{coupon.organization}</div>
                          <div className="rec-row-desc">{coupon.sector || "No sector set"}</div>
                        </td>
                        <td data-label="Type">
                          <span className={`rec-status ${coupon.type === "attendee" ? "rec-status-published" : "rec-status-archived"}`}>
                            {coupon.type}
                          </span>
                        </td>
                        <td data-label="Usage">
                          <div className="rec-coupon-usage-line">
                            <strong>{Math.max(0, usedSeats)}</strong> / {coupon.numberOfUsers}
                          </div>
                          <div className="rec-progress">
                            <span style={{ width: `${usagePercent}%` }} />
                          </div>
                        </td>
                        <td data-label="Conference">REC {coupon.conference}</td>
                        <td data-label="Status">
                          <span className={`rec-status ${status.className}`}>{status.label}</span>
                        </td>
                        <td data-label="Created" className="rec-muted">{formatAppwriteDate(coupon.$createdAt)}</td>
                        <td data-label="Actions">
                          <div className="rec-row-actions">
                            <button type="button" className="rec-icon-button" onClick={() => handleEdit(coupon)} aria-label="Edit coupon">
                              <FontAwesomeIcon icon={faEdit} />
                            </button>
                            <button
                              type="button"
                              className="rec-icon-button rec-icon-button-danger"
                              onClick={() => {
                                setSelectedCoupon(coupon)
                                setShowDeleteModal(true)
                              }}
                              aria-label="Delete coupon"
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

          <div className="rec-pagination-bar">
            <span className="rec-muted">
              Showing {startRecord}-{endRecord} of {totalCoupons}
              {searchTerm ? ` (${visibleCoupons.length} matched on this page)` : ""}
            </span>
            <div className="rec-page-actions">
              <button
                type="button"
                className="rec-btn rec-btn-outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((previous) => Math.max(1, previous - 1))}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
                Previous
              </button>
              <span className="rec-pagination-page">Page {page} of {totalPages}</span>
              <button
                type="button"
                className="rec-btn rec-btn-outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
              >
                Next
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {showCreateModal && (
        <CouponModal
          title="Create Coupon"
          onClose={() => !creating && setShowCreateModal(false)}
          footer={
            <>
              <button type="button" className="rec-btn rec-btn-outline" disabled={creating} onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" form="coupon-create-form" className="rec-btn rec-btn-primary" disabled={creating}>
                {creating ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faPlus} />}
                Create Coupon
              </button>
            </>
          }
        >
          <CouponForm
            id="coupon-create-form"
            formData={formData}
            conferences={conferences}
            creating={creating}
            onSubmit={handleCreate}
            onChange={handleInputChange}
            onGenerate={generatePreviewCode}
            mode="create"
          />
        </CouponModal>
      )}

      {showEditModal && selectedCoupon && (
        <CouponModal
          title="Edit Coupon"
          onClose={() => !updating && setShowEditModal(false)}
          footer={
            <>
              <button type="button" className="rec-btn rec-btn-outline" disabled={updating} onClick={() => setShowEditModal(false)}>
                Cancel
              </button>
              <button type="submit" form="coupon-edit-form" className="rec-btn rec-btn-primary" disabled={updating}>
                {updating ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faEdit} />}
                Update Coupon
              </button>
            </>
          }
        >
          <div className="rec-alert mb-3">
            <p className="mb-0">Coupon code, registration type, and conference are locked after creation.</p>
          </div>
          <CouponForm
            id="coupon-edit-form"
            formData={formData}
            conferences={conferences}
            creating={updating}
            onSubmit={handleUpdate}
            onChange={handleInputChange}
            onGenerate={generatePreviewCode}
            mode="edit"
          />
        </CouponModal>
      )}

      {showDeleteModal && selectedCoupon && (
        <CouponModal
          title="Delete Coupon"
          onClose={() => !deleting && setShowDeleteModal(false)}
          footer={
            <>
              <button type="button" className="rec-btn rec-btn-outline" disabled={deleting} onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button type="button" className="rec-btn rec-btn-accent" disabled={deleting} onClick={handleDelete}>
                {deleting ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTrash} />}
                Delete Coupon
              </button>
            </>
          }
        >
          <p>Delete this coupon allocation? This cannot be undone.</p>
          <div className="rec-empty-state-compact text-start">
            <div><strong>Coupon:</strong> {selectedCoupon.coupon}</div>
            <div><strong>Sponsoring organization:</strong> {selectedCoupon.organization}</div>
            <div><strong>Usage:</strong> {selectedCoupon.numberOfUsers - selectedCoupon.usersLeft} / {selectedCoupon.numberOfUsers}</div>
          </div>
        </CouponModal>
      )}

      {showAnalyticsModal && (
        <CouponModal title="Coupon Analytics" onClose={() => setShowAnalyticsModal(false)}>
          <CouponAnalytics analytics={analytics} conference={selectedConference} />
        </CouponModal>
      )}
    </>
  )
}

function CouponForm({ id, formData, conferences, creating, onSubmit, onChange, onGenerate, mode }) {
  const readOnlyIdentity = mode === "edit"

  return (
    <form id={id} onSubmit={onSubmit}>
      <div className="rec-grid rec-grid-two">
        <div className="rec-field">
          <label className="rec-label" htmlFor={`${id}-conference`}>Conference *</label>
          <select
            id={`${id}-conference`}
            className="rec-select"
            value={formData.conference}
            onChange={(event) => onChange("conference", normalizeInteger(event.target.value, ""))}
            required
            disabled={creating || readOnlyIdentity}
          >
            <option value="">Select Conference</option>
            {conferences.map((conference) => (
              <option key={conference.$id || conference.year} value={conference.year}>
                REC {conference.year} {conference.isActive ? "(Active)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="rec-field">
          <label className="rec-label" htmlFor={`${id}-type`}>Registration Type *</label>
          <select
            id={`${id}-type`}
            className="rec-select"
            value={formData.type}
            onChange={(event) => onChange("type", event.target.value)}
            required
            disabled={creating || readOnlyIdentity}
          >
            <option value="attendee">Attendee</option>
            <option value="exhibitor">Exhibitor</option>
          </select>
        </div>

        <div className="rec-field">
          <label className="rec-label" htmlFor={`${id}-organization`}>Sponsoring Organization *</label>
          <input
            id={`${id}-organization`}
            className="rec-input"
            value={formData.organization}
            onChange={(event) => onChange("organization", event.target.value)}
            placeholder="Organization funding or providing this coupon"
            required
            disabled={creating}
          />
        </div>

        <div className="rec-field">
          <label className="rec-label" htmlFor={`${id}-sector`}>Sponsoring Organization Sector *</label>
          <select
            id={`${id}-sector`}
            className="rec-select"
            value={formData.sector}
            onChange={(event) => onChange("sector", event.target.value)}
            required
            disabled={creating}
          >
            <option value="">Select Sector</option>
            {sectorOptions.map((sector) => (
              <option key={sector} value={sector}>{sector}</option>
            ))}
          </select>
        </div>

        <div className="rec-field">
          <label className="rec-label" htmlFor={`${id}-users`}>Number of Users *</label>
          <input
            id={`${id}-users`}
            className="rec-input"
            type="number"
            min="1"
            max="10000"
            value={formData.numberOfUsers}
            onChange={(event) => onChange("numberOfUsers", normalizeInteger(event.target.value, 1))}
            required
            disabled={creating}
          />
          <span className="rec-help-text">Total seats allocated to this coupon.</span>
        </div>

        {mode === "create" ? (
          <div className="rec-field">
            <label className="rec-checkbox-option rec-checkbox-option-inline">
              <input
                type="checkbox"
                checked={formData.autoGenerate}
                onChange={(event) => onChange("autoGenerate", event.target.checked)}
                disabled={creating}
              />
              Auto-generate coupon code
            </label>
          </div>
        ) : (
          <div className="rec-field">
            <label className="rec-label" htmlFor={`${id}-coupon`}>Coupon Code</label>
            <input id={`${id}-coupon`} className="rec-input" value={formData.coupon} disabled />
          </div>
        )}
      </div>

      {mode === "create" && (
        <div className="rec-inline-action mt-3">
          <div className="rec-field">
            <label className="rec-label" htmlFor={`${id}-coupon-code`}>
              {formData.autoGenerate ? "Preview Code" : "Coupon Code *"}
            </label>
            <input
              id={`${id}-coupon-code`}
              className="rec-input"
              value={formData.coupon}
              maxLength={10}
              onChange={(event) => onChange("coupon", event.target.value.toUpperCase())}
              placeholder={formData.autoGenerate ? "Generate preview or leave blank" : "Enter coupon code"}
              readOnly={formData.autoGenerate}
              required={!formData.autoGenerate}
              disabled={creating}
            />
          </div>
          {formData.autoGenerate && (
            <div className="rec-page-actions rec-page-actions-left">
              <select
                className="rec-select"
                value={formData.codeLength}
                onChange={(event) => onChange("codeLength", normalizeInteger(event.target.value, 8))}
                disabled={creating}
              >
                {[6, 7, 8, 9, 10].map((length) => (
                  <option key={length} value={length}>{length} chars</option>
                ))}
              </select>
              <button type="button" className="rec-btn rec-btn-outline" onClick={onGenerate} disabled={creating}>
                Generate
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

function CouponAnalytics({ analytics, conference }) {
  return (
    <div>
      <p className="rec-muted">
        Showing analytics for {conference ? `REC ${conference}` : "all conferences"}.
      </p>
      <div className="rec-stats-grid rec-stats-grid-four mb-3">
        <div className="rec-stat-tile"><span className="rec-stat-number">{analytics.total}</span><span className="rec-stat-label">Coupons</span></div>
        <div className="rec-stat-tile"><span className="rec-stat-number">{analytics.active}</span><span className="rec-stat-label">Active</span></div>
        <div className="rec-stat-tile"><span className="rec-stat-number">{analytics.usersUsed}</span><span className="rec-stat-label">Used</span></div>
        <div className="rec-stat-tile"><span className="rec-stat-number">{analytics.usersLeft}</span><span className="rec-stat-label">Left</span></div>
      </div>

      <div className="rec-grid rec-grid-two">
        <div className="rec-panel">
          <div className="rec-panel-header"><h4 className="rec-panel-title">By Type</h4></div>
          <div className="rec-panel-body">
            <p><strong>Attendee:</strong> {analytics.byType?.attendee || 0}</p>
            <p className="mb-0"><strong>Exhibitor:</strong> {analytics.byType?.exhibitor || 0}</p>
          </div>
        </div>
        <div className="rec-panel">
          <div className="rec-panel-header"><h4 className="rec-panel-title">By Sector</h4></div>
          <div className="rec-panel-body">
            {Object.entries(analytics.bySector || {}).length > 0 ? (
              Object.entries(analytics.bySector).map(([sector, count]) => (
                <p key={sector}><strong>{sector}:</strong> {count}</p>
              ))
            ) : (
              <p className="rec-muted mb-0">No sector data available.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rec-grid rec-grid-two mt-3">
        <AnalyticsList
          title="Top Sponsoring Organizations"
          rows={analytics.topOrganizations || []}
          columns={["Sponsoring Organization", "Total Users"]}
          renderRow={(row) => [row.organization, row.totalUsers]}
        />
        <AnalyticsList
          title="Most Used Coupons"
          rows={analytics.mostUsedCoupons || []}
          columns={["Coupon", "Sponsoring Organization", "Usage"]}
          renderRow={(row) => [row.coupon, row.organization, `${row.used}/${row.total} (${row.usagePercentage}%)`]}
        />
      </div>
    </div>
  )
}

function AnalyticsList({ title, rows, columns, renderRow }) {
  return (
    <div className="rec-panel">
      <div className="rec-panel-header"><h4 className="rec-panel-title">{title}</h4></div>
      <div className="rec-table-wrap">
        {rows.length > 0 ? (
          <table className="rec-table">
            <thead>
              <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${title}-${rowIndex}`}>
                  {renderRow(row).map((cell, cellIndex) => (
                    <td key={`${title}-${rowIndex}-${cellIndex}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="rec-empty-state-compact">No data available.</div>
        )}
      </div>
    </div>
  )
}
