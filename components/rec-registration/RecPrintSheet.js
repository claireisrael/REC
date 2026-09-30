"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import RecPrintableBadge from "@/components/rec-registration/RecPrintableBadge"

export default function RecPrintSheet() {
  const params = useSearchParams()
  const conferenceId = params.get("conferenceId") || ""
  const ids = params.get("ids") || ""
  const backHref = `/dashboard/rec-conference/admin/scanning/badges${conferenceId ? `?conferenceId=${encodeURIComponent(conferenceId)}` : ""}`
  const [cards, setCards] = useState([])
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      try {
        const query = new URLSearchParams({ conferenceId, ids })
        const response = await fetch(`/api/rec/scanning/badges/print?${query.toString()}`, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || "These cards could not be opened.")
        if (cancelled) return
        setCards(Array.isArray(payload.cards) ? payload.cards : [])
        setSkipped(Number(payload.skipped) || 0)
      } catch (err) {
        if (!cancelled) setError(err.message || "These cards could not be opened.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [conferenceId, ids])

  return (
    <div className="rec-print-sheet">
      <div className="rec-print-sheet-bar">
        <div>
          <Link href={backHref}>← Badge list</Link>
          <strong>{loading ? "Opening cards…" : `${cards.length} card${cards.length === 1 ? "" : "s"}`}</strong>
          {skipped > 0 && (
            <p>
              {skipped} selected {skipped === 1 ? "person has" : "people have"} an active badge, but the card link is missing.
              Revoke that badge, then generate a replacement.
            </p>
          )}
          {error && <p>{error}</p>}
        </div>
        <button type="button" onClick={() => window.print()} disabled={loading || cards.length === 0}>
          Print
        </button>
      </div>

      {loading && <p className="rec-print-sheet-status">Preparing the cards…</p>}

      {!loading && !error && cards.length === 0 && (
        <p className="rec-print-sheet-status">No cards to print. Revoke the active badge, generate a replacement, then open this page again.</p>
      )}

      <div className="rec-print-sheet-stack">
        {cards.map((card) => (
          <div className="rec-print-sheet-card" key={card.badge?.$id || card.badgeUrl}>
            <RecPrintableBadge badge={card} />
          </div>
        ))}
      </div>
    </div>
  )
}
