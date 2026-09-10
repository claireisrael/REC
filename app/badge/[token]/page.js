"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import RecPrintableBadge from "@/components/rec-registration/RecPrintableBadge"

export default function RecPublicBadgePage() {
  const params = useParams()
  const token = String(params?.token || "")
  const [badge, setBadge] = useState(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError("This badge link is missing.")
      setLoading(false)
      return
    }

    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const response = await fetch(`/api/v1/rec/badges/${encodeURIComponent(token)}`, {
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload.error || "This badge could not be loaded.")
        }
        setBadge(payload)
      } catch (err) {
        setError(err.message || "This badge could not be loaded.")
        setBadge(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token])

  if (loading) {
    return <p className="rec-public-badge-status">Preparing badge…</p>
  }

  if (error || !badge) {
    return (
      <div className="rec-public-badge-unavailable">
        <h1>Badge unavailable</h1>
        <p>{error || "This badge could not be loaded."}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    )
  }

  return <RecPrintableBadge badge={badge} showActions />
}
