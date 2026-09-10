"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faCheckCircle,
  faExclamationTriangle,
  faExternalLinkAlt,
  faImages,
  faPenToSquare,
  faPhotoFilm,
  faPlus,
  faSave,
  faSpinner,
  faTrash,
  faUserShield,
  faVideo,
  faXmark,
} from "@fortawesome/free-solid-svg-icons"
import { useAuth } from "@/lib/auth/auth-provider"
import RecConfirmDialog from "@/components/rec-registration/RecConfirmDialog"
import "../../rec-dashboard.css"

const mediaTypes = [
  { value: "all", label: "All media" },
  { value: "image_album", label: "Image albums" },
  { value: "video", label: "Videos" },
]

const emptyForm = {
  mediaType: "image_album",
  title: "",
  slug: "",
  description: "",
  externalUrl: "",
  videoUrl: "",
  thumbnailUrl: "",
  displayOrder: 0,
  isFeatured: false,
  isPublished: false,
  keptImages: [],
  sampleFiles: [],
}

function AccessMessage({ icon, title, children }) {
  return (
    <div className="rec-dashboard-container">
      <div className="rec-access-wrap">
        <div className="rec-alert text-center">
          <FontAwesomeIcon icon={icon} size="3x" className="mb-4" style={{ color: "#d99a00" }} />
          <h4 className="rec-alert-title">{title}</h4>
          <div>{children}</div>
          <Link href="/dashboard/rec-conference" className="rec-btn rec-btn-primary mt-3">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to REC Conference
          </Link>
        </div>
      </div>
    </div>
  )
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || "Request failed")
  }
  return payload
}

function toFormData(conferenceId, form) {
  const data = new FormData()
  data.set("conferenceId", conferenceId)
  data.set("mediaType", form.mediaType)
  data.set("title", form.title)
  data.set("slug", form.slug)
  data.set("description", form.description)
  data.set("externalUrl", form.externalUrl)
  data.set("videoUrl", form.videoUrl)
  data.set("thumbnailUrl", form.thumbnailUrl)
  data.set("displayOrder", String(form.displayOrder || 0))
  data.set("isFeatured", String(Boolean(form.isFeatured)))
  data.set("isPublished", String(Boolean(form.isPublished)))
  data.set("keptImagesJson", JSON.stringify(form.mediaType === "image_album" ? form.keptImages : []))
  form.sampleFiles.forEach((file) => data.append("sampleImages", file))
  return data
}

function mapItemToForm(item) {
  return {
    mediaType: item.mediaType || "image_album",
    title: item.title || "",
    slug: item.slug || "",
    description: item.description || "",
    externalUrl: item.externalUrl || "",
    videoUrl: item.videoUrl || "",
    thumbnailUrl: item.thumbnailUrl || "",
    displayOrder: item.displayOrder || 0,
    isFeatured: item.isFeatured === true,
    isPublished: item.isPublished === true,
    keptImages: item.sampleImages || [],
    sampleFiles: [],
  }
}

function formatDate(value) {
  if (!value) return ""
  return new Date(value).toLocaleString("en-UG", {
    timeZone: "Africa/Kampala",
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function RecMediaAdminPage() {
  const {
    isSeniorManager,
    hasModuleAccess,
    canPerformModuleAction,
    getModulePermissionLevel,
    MODULES,
  } = useAuth()

  const hasRecAccess = hasModuleAccess(MODULES.REC_CONFERENCE)
  const canManageRec = canPerformModuleAction(MODULES.REC_CONFERENCE, "manage")
  const isSenior = isSeniorManager()
  const userPermissionLevel = getModulePermissionLevel(MODULES.REC_CONFERENCE)

  const [conferences, setConferences] = useState([])
  const [conferenceId, setConferenceId] = useState("")
  const [items, setItems] = useState([])
  const [pager, setPager] = useState({ total: 0, page: 1, limit: 12, totalPages: 1 })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(12)
  const [typeFilter, setTypeFilter] = useState("all")
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState("")
  const [fileInputKey, setFileInputKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [itemToDelete, setItemToDelete] = useState(null)

  const selectedConference = useMemo(
    () => conferences.find((conference) => conference.$id === conferenceId) || null,
    [conferenceId, conferences]
  )

  const loadConferences = useCallback(async () => {
    const data = await fetchJson("/api/rec/media/conferences")
    const docs = data.documents || []
    setConferences(docs)
    setConferenceId((current) => current || docs.find((conference) => conference.isActive)?.$id || docs[0]?.$id || "")
  }, [])

  const loadMedia = useCallback(async () => {
    if (!conferenceId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        conferenceId,
        page: String(page),
        limit: String(limit),
      })
      if (typeFilter !== "all") params.set("type", typeFilter)
      const data = await fetchJson(`/api/rec/media?${params.toString()}`)
      setItems(data.documents || [])
      setPager({
        total: data.total || 0,
        page: data.page || page,
        limit: data.limit || limit,
        totalPages: data.totalPages || 1,
      })
    } catch (err) {
      setError(err.message || "Failed to load REC media.")
    } finally {
      setLoading(false)
    }
  }, [conferenceId, limit, page, typeFilter])

  useEffect(() => {
    if (!hasRecAccess && !isSenior) return
    queueMicrotask(() => {
      loadConferences().catch((err) => {
        setError(err.message || "Failed to load conferences.")
        setLoading(false)
      })
    })
  }, [hasRecAccess, isSenior, loadConferences])

  useEffect(() => {
    queueMicrotask(() => {
      loadMedia()
    })
  }, [loadMedia])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId("")
    setFileInputKey((key) => key + 1)
  }

  const submitMedia = async (event) => {
    event.preventDefault()
    if (!conferenceId) return
    setSaving("media")
    setError("")
    setSuccess("")

    const totalImages = form.keptImages.length + form.sampleFiles.length
    if (form.mediaType === "image_album" && totalImages > 4) {
      setError("Image albums can only include up to 4 sample images.")
      setSaving("")
      return
    }

    try {
      const url = editingId ? `/api/rec/media/${editingId}` : "/api/rec/media"
      const media = await fetchJson(url, {
        method: editingId ? "PATCH" : "POST",
        body: toFormData(conferenceId, form),
      })
      resetForm()
      setSuccess(editingId ? "Media item updated." : "Media item created.")
      await loadMedia()
      return media
    } catch (err) {
      setError(err.message || "Failed to save media item.")
    } finally {
      setSaving("")
    }
  }

  const editItem = (item) => {
    setEditingId(item.$id)
    setForm(mapItemToForm(item))
    setFileInputKey((key) => key + 1)
    setError("")
    setSuccess("")
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const deleteItem = async (item) => {
    if (!item?.$id) return
    setSaving(item.$id)
    setError("")
    setSuccess("")
    try {
      await fetchJson(`/api/rec/media/${item.$id}`, { method: "DELETE" })
      if (editingId === item.$id) resetForm()
      if (items.length === 1 && page > 1) {
        setPage((previous) => Math.max(1, previous - 1))
      } else {
        await loadMedia()
      }
      setSuccess("Media item deleted.")
      setItemToDelete(null)
    } catch (err) {
      setError(err.message || "Failed to delete media item.")
      setItemToDelete(null)
    } finally {
      setSaving("")
    }
  }

  const updateForm = (patch) => {
    setForm((previous) => ({ ...previous, ...patch }))
  }

  const removeKeptImage = (fileId) => {
    updateForm({ keptImages: form.keptImages.filter((image) => image.fileId !== fileId) })
  }

  if (!hasRecAccess && !isSenior) {
    return (
      <AccessMessage icon={faExclamationTriangle} title="Access Restricted">
        <p>You do not have permission to access REC Conference media.</p>
      </AccessMessage>
    )
  }

  if (!canManageRec && !isSenior) {
    return (
      <AccessMessage icon={faPhotoFilm} title="Insufficient Access">
        <p>
          You have <strong>{userPermissionLevel}</strong> access to REC Conference.
        </p>
        <p>Media management requires manage access or senior manager access.</p>
      </AccessMessage>
    )
  }

  return (
    <div className="rec-dashboard-container">
      <div className="rec-page-bar mb-4">
        <div>
          <div className="rec-breadcrumb">
            <Link href="/dashboard/rec-conference">
              <FontAwesomeIcon icon={faArrowLeft} /> REC Conference
            </Link>
            <span className="rec-breadcrumb-separator">/</span>
            <span>Media Library</span>
          </div>
          <h2 className="rec-header-gradient mb-2">REC Media Library</h2>
          <p className="rec-muted mb-0">
            Curate published albums and video links for the public conference website.
          </p>
        </div>
        {userPermissionLevel && (
          <div className="rec-permission-badge">
            <FontAwesomeIcon icon={faUserShield} /> {userPermissionLevel} Access
          </div>
        )}
      </div>

      {(error || success) && (
        <div className={error ? "rec-alert rec-alert-danger mb-4" : "rec-alert rec-alert-success mb-4"}>
          <FontAwesomeIcon icon={error ? faExclamationTriangle : faCheckCircle} />
          {error || success}
        </div>
      )}

      <section className="rec-panel mb-4">
        <div className="rec-panel-header">
          <h3 className="rec-panel-title">
            <FontAwesomeIcon icon={faPhotoFilm} />
            Select REC Space
          </h3>
          <span className="rec-permission-badge">{conferences.length} conferences</span>
        </div>
        <div className="rec-panel-body rec-grid rec-grid-two">
          <div className="rec-field">
            <label className="rec-label" htmlFor="media-conference">Conference</label>
            <select
              id="media-conference"
              className="rec-select"
              value={conferenceId}
              onChange={(event) => {
                setConferenceId(event.target.value)
                setPage(1)
                resetForm()
              }}
            >
              <option value="">Select conference</option>
              {conferences.map((conference) => (
                <option key={conference.$id} value={conference.$id}>
                  {conference.title || conference.shortName || conference.fullName || conference.year}
                </option>
              ))}
            </select>
          </div>
          <div className="rec-media-space-summary">
            <strong>{selectedConference?.shortName || selectedConference?.title || "No REC selected"}</strong>
            <span>
              {selectedConference
                ? `${selectedConference.year || "Configured"} media workspace`
                : "Choose a REC edition to manage its public media."}
            </span>
          </div>
        </div>
      </section>

      {conferenceId && (
        <div className="rec-media-layout">
          <section className="rec-panel">
            <div className="rec-panel-header">
              <h3 className="rec-panel-title">
                <FontAwesomeIcon icon={editingId ? faPenToSquare : faPlus} />
                {editingId ? "Edit Media Item" : "New Media Item"}
              </h3>
              {editingId && (
                <button type="button" className="rec-btn rec-btn-outline" onClick={resetForm}>
                  <FontAwesomeIcon icon={faXmark} />
                  Cancel Edit
                </button>
              )}
            </div>
            <form className="rec-panel-body rec-grid" onSubmit={submitMedia}>
              <div className="rec-grid rec-grid-two">
                <div className="rec-field">
                  <label className="rec-label" htmlFor="media-type">Type</label>
                  <select
                    id="media-type"
                    className="rec-select"
                    value={form.mediaType}
                    onChange={(event) => {
                      const mediaType = event.target.value
                      updateForm({
                        mediaType,
                        keptImages: mediaType === "video" ? [] : form.keptImages,
                        sampleFiles: mediaType === "video" ? [] : form.sampleFiles,
                      })
                      if (mediaType === "video") setFileInputKey((key) => key + 1)
                    }}
                  >
                    <option value="image_album">Image album</option>
                    <option value="video">Video link</option>
                  </select>
                </div>
                <div className="rec-field">
                  <label className="rec-label" htmlFor="media-order">Display order</label>
                  <input
                    id="media-order"
                    className="rec-input"
                    type="number"
                    min="0"
                    value={form.displayOrder}
                    onChange={(event) => updateForm({ displayOrder: Number(event.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="rec-field">
                <label className="rec-label" htmlFor="media-title">Title</label>
                <input
                  id="media-title"
                  className="rec-input"
                  value={form.title}
                  onChange={(event) => updateForm({ title: event.target.value })}
                  placeholder="Opening ceremony highlights"
                  required
                />
              </div>

              <div className="rec-field">
                <label className="rec-label" htmlFor="media-description">Description</label>
                <textarea
                  id="media-description"
                  className="rec-textarea"
                  value={form.description}
                  onChange={(event) => updateForm({ description: event.target.value })}
                  rows={4}
                  placeholder="Short public description shown on the media card."
                />
              </div>

              {form.mediaType === "image_album" ? (
                <>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="media-external-url">External album link</label>
                    <input
                      id="media-external-url"
                      className="rec-input"
                      type="url"
                      value={form.externalUrl}
                      onChange={(event) => updateForm({ externalUrl: event.target.value })}
                      placeholder="https://photos.example.com/album"
                    />
                    <small className="rec-field-help">Required before publishing. Public users will open this link to view the full album.</small>
                  </div>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="media-samples">Sample images</label>
                    <input
                      key={fileInputKey}
                      id="media-samples"
                      className="rec-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={(event) => updateForm({ sampleFiles: Array.from(event.target.files || []) })}
                    />
                    <small className="rec-field-help">
                      Upload up to 4 public sample images. Current total: {form.keptImages.length + form.sampleFiles.length}/4.
                    </small>
                  </div>
                  {(form.keptImages.length > 0 || form.sampleFiles.length > 0) && (
                    <div className="rec-media-sample-grid">
                      {form.keptImages.map((image) => (
                        <div className="rec-media-sample" key={image.fileId}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={image.url} alt={image.name || form.title || "Sample"} />
                          <button type="button" onClick={() => removeKeptImage(image.fileId)}>
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        </div>
                      ))}
                      {form.sampleFiles.map((file) => (
                        <div className="rec-media-sample rec-media-sample-file" key={`${file.name}-${file.size}`}>
                          <FontAwesomeIcon icon={faImages} />
                          <span>{file.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="media-video-url">Video URL</label>
                    <input
                      id="media-video-url"
                      className="rec-input"
                      type="url"
                      value={form.videoUrl}
                      onChange={(event) => updateForm({ videoUrl: event.target.value })}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                    <small className="rec-field-help">Videos are linked only. No video files are uploaded to the HR portal.</small>
                  </div>
                  <div className="rec-field">
                    <label className="rec-label" htmlFor="media-thumbnail-url">Optional thumbnail URL</label>
                    <input
                      id="media-thumbnail-url"
                      className="rec-input"
                      type="url"
                      value={form.thumbnailUrl}
                      onChange={(event) => updateForm({ thumbnailUrl: event.target.value })}
                      placeholder="https://img.youtube.com/..."
                    />
                  </div>
                </>
              )}

              <div className="rec-media-toggle-row">
                <label>
                  <input
                    type="checkbox"
                    checked={form.isFeatured}
                    onChange={(event) => updateForm({ isFeatured: event.target.checked })}
                  />
                  Feature on public site
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    onChange={(event) => updateForm({ isPublished: event.target.checked })}
                  />
                  Published
                </label>
              </div>

              <button type="submit" className="rec-btn rec-btn-primary" disabled={saving === "media"}>
                {saving === "media" ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faSave} />}
                {editingId ? "Update Media" : "Save Media"}
              </button>
            </form>
          </section>

          <section className="rec-panel">
            <div className="rec-panel-header">
              <h3 className="rec-panel-title">
                <FontAwesomeIcon icon={faPhotoFilm} />
                Media Items
              </h3>
              <div className="rec-page-actions">
                <label className="rec-inline-control">
                  <span>Type</span>
                  <select
                    className="rec-select"
                    value={typeFilter}
                    onChange={(event) => {
                      setTypeFilter(event.target.value)
                      setPage(1)
                    }}
                  >
                    {mediaTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <label className="rec-inline-control">
                  <span>Rows</span>
                  <select
                    className="rec-select"
                    value={limit}
                    onChange={(event) => {
                      setLimit(Number(event.target.value))
                      setPage(1)
                    }}
                  >
                    {[6, 12, 24, 48].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="rec-panel-body">
              {loading ? (
                <div className="rec-empty-state-compact">
                  <FontAwesomeIcon icon={faSpinner} spin /> Loading media...
                </div>
              ) : items.length === 0 ? (
                <div className="rec-empty-state-compact">No media has been added for this REC yet.</div>
              ) : (
                <div className="rec-media-list">
                  {items.map((item) => (
                    <article key={item.$id} className="rec-media-card">
                      <div className="rec-media-thumb">
                        {item.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.coverImageUrl} alt={item.title} />
                        ) : (
                          <FontAwesomeIcon icon={item.mediaType === "video" ? faVideo : faImages} />
                        )}
                      </div>
                      <div className="rec-media-card-body">
                        <div className="rec-media-card-title">
                          <span>{item.title}</span>
                          <span className={`rec-status ${item.isPublished ? "rec-status-published" : "rec-status-draft"}`}>
                            {item.isPublished ? "Published" : "Draft"}
                          </span>
                        </div>
                        <p>{item.description || "No description provided."}</p>
                        <div className="rec-chip-list">
                          <span className="rec-chip">{item.mediaType === "video" ? "Video" : "Image album"}</span>
                          {item.isFeatured && <span className="rec-chip">Featured</span>}
                          {item.sampleImages?.length > 0 && <span className="rec-chip">{item.sampleImages.length} samples</span>}
                        </div>
                        {item.updatedAt && <small className="rec-muted">Updated {formatDate(item.updatedAt)}</small>}
                        <div className="rec-row-actions mt-3">
                          {(item.externalUrl || item.videoUrl) && (
                            <a
                              className="rec-btn rec-btn-outline"
                              href={item.externalUrl || item.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FontAwesomeIcon icon={faExternalLinkAlt} />
                              Open
                            </a>
                          )}
                          <button type="button" className="rec-btn rec-btn-outline" onClick={() => editItem(item)} disabled={saving === item.$id}>
                            <FontAwesomeIcon icon={faPenToSquare} />
                            Edit
                          </button>
                          <button type="button" className="rec-btn rec-btn-accent" onClick={() => setItemToDelete(item)} disabled={saving === item.$id}>
                            {saving === item.$id ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faTrash} />}
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="rec-pagination-bar">
                <span className="rec-muted">
                  Showing page {pager.page || page} of {pager.totalPages || 1} · {pager.total || 0} media items
                </span>
                <div className="rec-page-actions">
                  <button
                    type="button"
                    className="rec-btn rec-btn-outline"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="rec-btn rec-btn-outline"
                    disabled={page >= (pager.totalPages || 1) || loading}
                    onClick={() => setPage((previous) => Math.min(pager.totalPages || 1, previous + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {itemToDelete && (
        <RecConfirmDialog
          title="Delete media item"
          confirmLabel="Delete media"
          busy={saving === itemToDelete.$id}
          onClose={() => {
            if (saving === itemToDelete.$id) return
            setItemToDelete(null)
          }}
          onConfirm={() => deleteItem(itemToDelete)}
        >
          <p>
            This removes the media listing from the conference library. Uploaded sample images for this item will also be removed.
          </p>
          <div className="rec-confirm-subject">
            <strong>{itemToDelete.title || "Untitled media"}</strong>
            <span>{mediaTypes.find((type) => type.value === itemToDelete.mediaType)?.label || "Media item"}</span>
          </div>
        </RecConfirmDialog>
      )}
    </div>
  )
}
