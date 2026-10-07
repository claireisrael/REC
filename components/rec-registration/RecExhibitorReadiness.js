"use client"

import { useEffect, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faSpinner } from "@fortawesome/free-solid-svg-icons"

const HR_PORTAL_URL = String(process.env.NEXT_PUBLIC_HR_PORTAL_URL || "https://hr.nrep.ug").replace(/\/+$/, "")
const empty = { documents: [], total: 0, page: 1, totalPages: 1 }

const readinessLabel = (status) => ({
  active: "Eligible for badge issuance",
  ready: "Ready for activation",
  identity_confirmation: "Identity confirmation required",
})[status] || "Not ready"

export default function RecExhibitorReadiness({ conferenceId }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!conferenceId) return undefined
    const controller = new AbortController()
    setLoading(true)
    setError("")
    fetch(`/api/rec/exhibitors/readiness?${new URLSearchParams({ conferenceId, page })}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || "Unable to load readiness.")
        return result
      })
      .then(setData)
      .catch((err) => { if (err.name !== "AbortError") setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [conferenceId, page])

  const manageHref = (applicationId) =>
    `${HR_PORTAL_URL}/dashboard/rec-conference/admin/exhibitors/applications/${encodeURIComponent(applicationId)}?conferenceId=${encodeURIComponent(conferenceId)}`

  return (
    <section aria-label="Exhibitor activation readiness" aria-busy={loading}>
      {error && <div className="rec-alert rec-alert-danger mb-3">{error}</div>}
      <div className="rec-table-wrap rec-responsive-table">
        <table className="rec-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Representative</th>
              <th>Readiness</th>
              <th>Next step</th>
            </tr>
          </thead>
          <tbody>
            {data.documents.flatMap((app) => app.representatives.map((rep) => {
              const ready = app.readiness.find((r) => r.representativeId === rep.id)
              return (
                <tr key={`${app.$id}-${rep.id}`}>
                  <td data-label="Company">
                    <a href={manageHref(app.$id)} target="_blank" rel="noopener noreferrer" className="rec-inline-link">{app.companyName}</a>
                    <div className="rec-row-desc">{String(app.status || "").replaceAll("_", " ")}</div>
                  </td>
                  <td data-label="Representative">{rep.fullName}</td>
                  <td data-label="Readiness">{readinessLabel(ready?.status)}</td>
                  <td data-label="Next step">
                    {(ready?.reasons || []).map((reason) => <div key={reason} className="rec-row-desc">{reason}</div>)}
                    <a href={manageHref(app.$id)} target="_blank" rel="noopener noreferrer" className="rec-inline-link">Manage application</a>
                  </td>
                </tr>
              )
            }))}
            {!data.documents.length && (
              <tr>
                <td colSpan={4} className="rec-muted">
                  {loading ? <><FontAwesomeIcon icon={faSpinner} spin /> Loading exhibitors...</> : "No exhibitor applications."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="rec-pagination-bar">
        <span className="rec-muted">{data.total || 0} records · Page {page} of {data.totalPages || 1}</span>
        <div className="rec-page-actions">
          <button type="button" className="rec-btn rec-btn-outline" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button type="button" className="rec-btn rec-btn-outline" disabled={loading || page >= (data.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </section>
  )
}
