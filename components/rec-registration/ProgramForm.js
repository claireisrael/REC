"use client"

import { useEffect, useMemo, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faArrowLeft,
  faCalendarAlt,
  faCopy,
  faPlus,
  faSave,
  faTimes,
  faTrash,
} from "@fortawesome/free-solid-svg-icons"
import { PROGRAM_STATUS, getProgramStatusConfig } from "@/lib/appwrite/rec-programmes"
import {
  TIME_BLOCK_TYPES,
  TIME_BLOCK_TYPE_LABELS,
  VENUE_SCOPES,
  addDaysToDateValue,
  createDefaultProgramTimeBlocks,
  formatBlockTimeRange,
  formatMinutesAsTimeInput,
  getKampalaDateOnlyValue,
  normalizeDateOnlyValue,
  parseTimeToMinutes,
  sortTimeBlocks,
  validateTimeBlocks,
} from "@/lib/rec-conference/schedule"

const buildProgramDays = (daysCount, conference) => {
  const configuredDays = Array.isArray(conference?.days) ? conference.days : []
  const count = Number(daysCount) || configuredDays.length || 1
  const fallbackStartDate = getKampalaDateOnlyValue(conference?.startDate)

  return Array.from({ length: count }, (_, index) => {
    const day = index + 1
    const configuredDay = configuredDays[index] || {}
    const date = normalizeDateOnlyValue(configuredDay.date) || addDaysToDateValue(fallbackStartDate, index)

    return {
      value: day,
      date,
      label: configuredDay.label || `Day ${day}`,
    }
  })
}

const getDayDate = (programDays, day) => programDays.find((item) => Number(item.value) === Number(day))?.date || ""

const getBlockIdentity = (block) => block.$id || block.localId

const createLocalBlockId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export default function ProgramForm({
  initialData,
  initialTimeBlocks = [],
  onSubmit,
  onCancel,
  isSaving,
  conferences,
  selectedConferenceId,
}) {
  const [formData, setFormData] = useState({
    conferenceId: selectedConferenceId || "",
    title: "",
    description: "",
    daysCount: 3,
    venueHalls: ["Main Hall"],
    status: PROGRAM_STATUS.DRAFT,
    slug: "",
  })
  const [timeBlocks, setTimeBlocks] = useState([])
  const [venueInput, setVenueInput] = useState("")
  const [scheduleError, setScheduleError] = useState("")

  const selectedConference = useMemo(() => {
    if (!Array.isArray(conferences)) return null
    return conferences.find((conference) => conference.$id === formData.conferenceId) || null
  }, [conferences, formData.conferenceId])

  const programDays = useMemo(
    () => buildProgramDays(formData.daysCount, selectedConference || initialData?.conference),
    [formData.daysCount, initialData?.conference, selectedConference]
  )

  useEffect(() => {
    if (initialData) {
      setFormData({
        conferenceId: initialData.conferenceId || selectedConferenceId || "",
        title: initialData.title || "",
        description: initialData.description || "",
        daysCount: initialData.daysCount || 3,
        venueHalls: Array.isArray(initialData.venueHalls) ? initialData.venueHalls : ["Main Hall"],
        status: initialData.status || PROGRAM_STATUS.DRAFT,
        slug: initialData.slug || "",
      })
    }
  }, [initialData, selectedConferenceId])

  useEffect(() => {
    if (initialTimeBlocks.length > 0) {
      setTimeBlocks(sortTimeBlocks(initialTimeBlocks))
    }
  }, [initialTimeBlocks])

  useEffect(() => {
    if (initialData || timeBlocks.length > 0 || !formData.conferenceId) return

    setTimeBlocks(createDefaultProgramTimeBlocks({
      program: { ...formData, $id: initialData?.$id || "" },
      conference: selectedConference,
      programDays,
    }))
  }, [formData, initialData, programDays, selectedConference, timeBlocks.length])

  const handleInputChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value }

      if (field === "title") {
        next.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      }

      return next
    })
  }

  const addVenueHall = () => {
    const venue = venueInput.trim()

    if (venue && !formData.venueHalls.includes(venue)) {
      setFormData((prev) => ({
        ...prev,
        venueHalls: [...prev.venueHalls, venue],
      }))
      setVenueInput("")
    }
  }

  const removeVenueHall = (venue) => {
    setFormData((prev) => ({
      ...prev,
      venueHalls: prev.venueHalls.filter((item) => item !== venue),
    }))
    setTimeBlocks((current) => current.map((block) => ({
      ...block,
      venueHalls: Array.isArray(block.venueHalls) ? block.venueHalls.filter((item) => item !== venue) : [],
    })))
  }

  const updateTimeBlock = (identity, updates) => {
    setTimeBlocks((current) => sortTimeBlocks(current.map((block) => {
      if (getBlockIdentity(block) !== identity) return block

      const next = { ...block, ...updates }
      if (updates.day) {
        next.date = getDayDate(programDays, updates.day)
      }
      if (updates.type) {
        next.allowSessions = updates.type === TIME_BLOCK_TYPES.SESSION
        if (!next.label || Object.values(TIME_BLOCK_TYPE_LABELS).includes(next.label)) {
          next.label = TIME_BLOCK_TYPE_LABELS[updates.type]
        }
      }
      if (updates.venueScope === VENUE_SCOPES.ALL) {
        next.venueHalls = []
      }

      return next
    })))
  }

  const addTimeBlock = (day = 1) => {
    const dayBlocks = sortTimeBlocks(timeBlocks).filter((block) => Number(block.day) === Number(day))
    const previous = dayBlocks[dayBlocks.length - 1]
    const startMinutes = previous ? Number(previous.endMinutes) : parseTimeToMinutes("08:30")
    const endMinutes = Math.min(startMinutes + 60, 17 * 60)

    setTimeBlocks((current) => sortTimeBlocks([
      ...current,
      {
        localId: createLocalBlockId(),
        conferenceId: formData.conferenceId,
        programId: initialData?.$id || "",
        day: Number(day),
        date: getDayDate(programDays, day),
        startMinutes,
        endMinutes,
        type: TIME_BLOCK_TYPES.SESSION,
        label: "Session",
        allowSessions: true,
        venueScope: VENUE_SCOPES.ALL,
        venueHalls: [],
        sortOrder: current.length,
        notes: "",
      },
    ]))
  }

  const removeTimeBlock = (identity) => {
    setTimeBlocks((current) => current.filter((block) => getBlockIdentity(block) !== identity))
  }

  const regenerateDefaultSchedule = () => {
    setScheduleError("")
    setTimeBlocks(createDefaultProgramTimeBlocks({
      program: { ...formData, $id: initialData?.$id || "" },
      conference: selectedConference || initialData?.conference,
      programDays,
    }))
  }

  const copyFirstDayToAllDays = () => {
    const firstDayBlocks = sortTimeBlocks(timeBlocks).filter((block) => Number(block.day) === 1)
    if (!firstDayBlocks.length) {
      setScheduleError("Add schedule blocks for Day 1 before copying to other days.")
      return
    }

    const copiedBlocks = programDays.flatMap((day) => firstDayBlocks.map((block, index) => ({
      ...block,
      $id: Number(day.value) === 1 ? block.$id : undefined,
      localId: Number(day.value) === 1 ? block.localId : createLocalBlockId(),
      day: day.value,
      date: day.date,
      sortOrder: index,
    })))

    setScheduleError("")
    setTimeBlocks(sortTimeBlocks(copiedBlocks))
  }

  const toggleBlockVenue = (identity, venue) => {
    setTimeBlocks((current) => current.map((block) => {
      if (getBlockIdentity(block) !== identity) return block

      const currentVenues = Array.isArray(block.venueHalls) ? block.venueHalls : []
      return {
        ...block,
        venueHalls: currentVenues.includes(venue)
          ? currentVenues.filter((item) => item !== venue)
          : [...currentVenues, venue],
      }
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const missingScheduleDay = programDays.find((day) => !timeBlocks.some((block) => Number(block.day) === Number(day.value)))
    if (missingScheduleDay) {
      setScheduleError(`${missingScheduleDay.label} must have at least one schedule block.`)
      return
    }

    const missingSessionDay = programDays.find((day) => !timeBlocks.some((block) => Number(block.day) === Number(day.value) && block.allowSessions))
    if (missingSessionDay) {
      setScheduleError(`${missingSessionDay.label} must have at least one block that allows sessions.`)
      return
    }

    const validationErrors = validateTimeBlocks(timeBlocks)
    if (validationErrors.length > 0) {
      setScheduleError(validationErrors[0])
      return
    }

    setScheduleError("")
    onSubmit({
      ...formData,
      timeBlocks: sortTimeBlocks(timeBlocks),
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <section className="rec-panel mb-4">
        <div className="rec-panel-header">
          <h3 className="rec-panel-title">Program Configuration</h3>
        </div>
        <div className="rec-panel-body">
          <div className="rec-grid">
            {conferences && (
              <label className="rec-field">
                <span className="rec-label">Conference *</span>
                <select
                  className="rec-select"
                  value={formData.conferenceId}
                  onChange={(event) => handleInputChange("conferenceId", event.target.value)}
                  required
                >
                  <option value="">Select Conference</option>
                  {conferences.map((conference) => (
                    <option key={conference.$id} value={conference.$id}>
                      {conference.title} {conference.isActive && "(Active)"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="rec-grid rec-grid-two">
              <label className="rec-field">
                <span className="rec-label">Program Title *</span>
                <input
                  className="rec-input"
                  type="text"
                  value={formData.title}
                  onChange={(event) => handleInputChange("title", event.target.value)}
                  placeholder="e.g., REC26 - Main Program"
                  required
                />
              </label>

              <label className="rec-field">
                <span className="rec-label">Days Count *</span>
                <input
                  className="rec-input"
                  type="number"
                  min="1"
                  max="30"
                  value={formData.daysCount}
                  onChange={(event) => handleInputChange("daysCount", parseInt(event.target.value, 10) || 1)}
                  required
                />
              </label>
            </div>

            <label className="rec-field">
              <span className="rec-label">Description</span>
              <textarea
                className="rec-textarea"
                rows={3}
                value={formData.description}
                onChange={(event) => handleInputChange("description", event.target.value)}
                placeholder="Brief description of this program..."
              />
            </label>
          </div>
        </div>
      </section>

      <section className="rec-panel mb-4">
        <div className="rec-panel-header">
          <h3 className="rec-panel-title">Venues & Settings</h3>
        </div>
        <div className="rec-panel-body">
          <div className="rec-grid">
            <div className="rec-field">
              <span className="rec-label">Venue Halls *</span>
              <div className="rec-inline-action">
                <input
                  className="rec-input"
                  type="text"
                  value={venueInput}
                  onChange={(event) => setVenueInput(event.target.value)}
                  placeholder="Add venue hall name (e.g. Main Auditorium)"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      addVenueHall()
                    }
                  }}
                />
                <button type="button" className="rec-btn rec-btn-primary" onClick={addVenueHall}>
                  <FontAwesomeIcon icon={faPlus} />
                  Add Venue
                </button>
              </div>

              <div className="rec-chip-list">
                {formData.venueHalls.length > 0 ? (
                  formData.venueHalls.map((venue) => (
                    <button
                      type="button"
                      key={venue}
                      className="rec-chip rec-chip-button"
                      onClick={() => removeVenueHall(venue)}
                      title={`Remove ${venue}`}
                    >
                      {venue}
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  ))
                ) : (
                  <span className="rec-help-text">No venues added. Add at least one venue hall.</span>
                )}
              </div>
              <span className="rec-help-text">Click a venue chip to remove it.</span>
            </div>

            <div className="rec-grid rec-grid-two">
              <label className="rec-field">
                <span className="rec-label">Status</span>
                <select
                  className="rec-select"
                  value={formData.status}
                  onChange={(event) => handleInputChange("status", event.target.value)}
                >
                  {Object.values(PROGRAM_STATUS).map((status) => {
                    const config = getProgramStatusConfig(status)
                    return (
                      <option key={status} value={status}>
                        {config.icon} {config.label}
                      </option>
                    )
                  })}
                </select>
              </label>

              <label className="rec-field">
                <span className="rec-label">URL Slug</span>
                <input
                  className="rec-input"
                  type="text"
                  value={formData.slug}
                  onChange={(event) => handleInputChange("slug", event.target.value)}
                  placeholder="url-friendly-slug"
                />
                <span className="rec-help-text">Auto-generated from title, used for direct links.</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="rec-panel mb-4">
        <div className="rec-panel-header rec-page-bar">
          <h3 className="rec-panel-title">
            <FontAwesomeIcon icon={faCalendarAlt} />
            Schedule Blocks
          </h3>
          <div className="rec-page-actions">
            <button type="button" className="rec-btn rec-btn-outline" onClick={regenerateDefaultSchedule}>
              <FontAwesomeIcon icon={faCalendarAlt} />
              Generate Defaults
            </button>
            <button type="button" className="rec-btn rec-btn-outline" onClick={copyFirstDayToAllDays}>
              <FontAwesomeIcon icon={faCopy} />
              Copy Day 1
            </button>
          </div>
        </div>
        <div className="rec-panel-body">
          {scheduleError && (
            <div className="rec-alert rec-alert-danger mb-3">
              <p className="mb-0">{scheduleError}</p>
            </div>
          )}

          {programDays.map((day) => {
            const dayBlocks = sortTimeBlocks(timeBlocks).filter((block) => Number(block.day) === Number(day.value))

            return (
              <div key={day.value} className="rec-schedule-day">
                <div className="rec-page-bar mb-3">
                  <div>
                    <h4 className="rec-row-title mb-1">{day.label}</h4>
                    <p className="rec-muted mb-0">{day.date || "Date not configured"}</p>
                  </div>
                  <button type="button" className="rec-btn rec-btn-outline" onClick={() => addTimeBlock(day.value)}>
                    <FontAwesomeIcon icon={faPlus} />
                    Add Block
                  </button>
                </div>

                {dayBlocks.length === 0 ? (
                  <div className="rec-empty-state rec-empty-state-compact">
                    <p className="rec-muted mb-0">No schedule blocks configured for this day.</p>
                  </div>
                ) : (
                  <div className="rec-table-wrap">
                    <table className="rec-table rec-schedule-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Type & Label</th>
                          <th>Session Rules</th>
                          <th>Venue Scope</th>
                          <th>Notes</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayBlocks.map((block) => {
                          const identity = getBlockIdentity(block)

                          return (
                            <tr key={identity}>
                              <td data-label="Time">
                                <div className="rec-grid" style={{ gap: 8 }}>
                                  <input
                                    className="rec-input"
                                    type="time"
                                    value={formatMinutesAsTimeInput(block.startMinutes)}
                                    onChange={(event) => updateTimeBlock(identity, { startMinutes: parseTimeToMinutes(event.target.value) })}
                                  />
                                  <input
                                    className="rec-input"
                                    type="time"
                                    value={formatMinutesAsTimeInput(block.endMinutes)}
                                    onChange={(event) => updateTimeBlock(identity, { endMinutes: parseTimeToMinutes(event.target.value) })}
                                  />
                                  <span className="rec-help-text">{formatBlockTimeRange(block)}</span>
                                </div>
                              </td>
                              <td data-label="Type & Label">
                                <div className="rec-grid" style={{ gap: 8 }}>
                                  <select
                                    className="rec-select"
                                    value={block.type}
                                    onChange={(event) => updateTimeBlock(identity, { type: event.target.value })}
                                  >
                                    {Object.entries(TIME_BLOCK_TYPE_LABELS).map(([value, label]) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                  <input
                                    className="rec-input"
                                    type="text"
                                    value={block.label || ""}
                                    onChange={(event) => updateTimeBlock(identity, { label: event.target.value })}
                                    placeholder="Block label"
                                  />
                                </div>
                              </td>
                              <td data-label="Session Rules">
                                <label className="rec-checkbox-option rec-checkbox-option-inline">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(block.allowSessions)}
                                    onChange={(event) => updateTimeBlock(identity, { allowSessions: event.target.checked })}
                                  />
                                  <span>Allow sessions</span>
                                </label>
                              </td>
                              <td data-label="Venue Scope">
                                <div className="rec-grid" style={{ gap: 8 }}>
                                  <select
                                    className="rec-select"
                                    value={block.venueScope || VENUE_SCOPES.ALL}
                                    onChange={(event) => updateTimeBlock(identity, { venueScope: event.target.value })}
                                  >
                                    <option value={VENUE_SCOPES.ALL}>All venues</option>
                                    <option value={VENUE_SCOPES.SELECTED}>Selected venues</option>
                                  </select>
                                  {block.venueScope === VENUE_SCOPES.SELECTED && (
                                    <div className="rec-checkbox-grid rec-checkbox-grid-compact">
                                      {formData.venueHalls.map((venue) => (
                                        <label key={venue} className="rec-checkbox-option">
                                          <input
                                            type="checkbox"
                                            checked={Array.isArray(block.venueHalls) && block.venueHalls.includes(venue)}
                                            onChange={() => toggleBlockVenue(identity, venue)}
                                          />
                                          <span>{venue}</span>
                                        </label>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td data-label="Notes">
                                <input
                                  className="rec-input"
                                  type="text"
                                  value={block.notes || ""}
                                  onChange={(event) => updateTimeBlock(identity, { notes: event.target.value })}
                                  placeholder="Optional"
                                />
                              </td>
                              <td data-label="Actions">
                                <button
                                  type="button"
                                  className="rec-icon-button rec-icon-button-danger"
                                  onClick={() => removeTimeBlock(identity)}
                                  aria-label={`Remove ${block.label || "schedule block"}`}
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <div className="rec-form-actions">
        <button type="button" className="rec-btn rec-btn-outline" onClick={onCancel} disabled={isSaving}>
          <FontAwesomeIcon icon={faArrowLeft} />
          Cancel
        </button>
        <button type="submit" className="rec-btn rec-btn-primary" disabled={isSaving}>
          <FontAwesomeIcon icon={faSave} />
          {isSaving ? "Saving..." : "Save Program"}
        </button>
      </div>
    </form>
  )
}
