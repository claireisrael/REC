"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import RecPrintableBadge from "@/components/rec-registration/RecPrintableBadge"
import "./RecPrintSheet.css"

const SHEET_SIZE = 6
const REQUEST_SIZE = 40
const BATCH_STORAGE_KEY = "rec-print-batch"

function readRequestedIds(conferenceId, queryIds) {
  const fromQuery = String(queryIds || "").split(",").map((id) => id.trim()).filter(Boolean)
  try {
    const stored = JSON.parse(localStorage.getItem(BATCH_STORAGE_KEY) || "null")
    if (stored?.conferenceId === conferenceId && Array.isArray(stored.ids) && stored.ids.length) {
      return stored.ids.map((id) => String(id || "").trim()).filter(Boolean)
    }
  } catch {
    // The query string remains the fallback.
  }
  return fromQuery
}

function sheetsOf(cards) {
  const sheets = []
  for (let index = 0; index < cards.length; index += SHEET_SIZE) {
    sheets.push(cards.slice(index, index + SHEET_SIZE))
  }
  return sheets
}

export default function RecPrintSheet() {
  const params = useSearchParams()
  const conferenceId = params.get("conferenceId") || ""
  const queryIds = params.get("ids") || ""
  const backHref = `/dashboard/rec-conference/admin/scanning/badges${conferenceId ? `?conferenceId=${encodeURIComponent(conferenceId)}` : ""}`
  const [cards, setCards] = useState([])
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [preparing, setPreparing] = useState("")
  const [readyCount, setReadyCount] = useState(0)
  const [requestedCount, setRequestedCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError("")
      setCards([])
      setSkipped(0)
      setReadyCount(0)
      const idList = Array.from(new Set(readRequestedIds(conferenceId, queryIds)))
      setRequestedCount(idList.length)
      if (!conferenceId || idList.length === 0) {
        setError("Select people on the badge list, then open this page again.")
        setLoading(false)
        return
      }
      const nextCards = []
      let nextSkipped = 0
      try {
        for (let index = 0; index < idList.length; index += REQUEST_SIZE) {
          const registrationIds = idList.slice(index, index + REQUEST_SIZE)
          const response = await fetch("/api/rec/scanning/badges/print", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ conferenceId, registrationIds }),
          })
          const payload = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(payload.error || "These cards could not be opened.")
          if (cancelled) return
          nextCards.push(...(Array.isArray(payload.cards) ? payload.cards : []))
          nextSkipped += Number(payload.skipped) || 0
          setCards(nextCards.slice())
          setSkipped(nextSkipped)
          setReadyCount(nextCards.length)
        }
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
  }, [conferenceId, queryIds])

  const sheets = sheetsOf(cards)

  async function openA3(download) {
    const registrationIds = cards
      .map((card) => card.registration?.$id || card.badge?.registrationId)
      .filter(Boolean)
    setPreparing(download ? "download" : "print")
    setError("")
    try {
      const response = await fetch("/api/rec/scanning/badges/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ conferenceId, registrationIds, format: "a3", download }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "The print file could not be prepared.")
      }
      const url = URL.createObjectURL(await response.blob())
      if (download) {
        const link = document.createElement("a")
        link.href = url
        link.download = "rec-tags-a3.pdf"
        link.click()
      } else {
        const opened = window.open(url, "_blank")
        if (!opened) {
          const link = document.createElement("a")
          link.href = url
          link.download = "rec-tags-a3.pdf"
          link.click()
        }
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (err) {
      setError(err.message || "The print file could not be prepared.")
    } finally {
      setPreparing("")
    }
  }

  const countLabel = loading
    ? (requestedCount > REQUEST_SIZE ? `Opening cards… ${readyCount} ready` : "Opening cards…")
    : `${cards.length} card${cards.length === 1 ? "" : "s"} on ${sheets.length} A3 sheet${sheets.length === 1 ? "" : "s"}`

  return (
    <div className="rec-print-sheet">
      <div className="rec-print-sheet-bar">
        <div>
          <Link href={backHref}>← Badge list</Link>
          <strong>{countLabel}</strong>
          {skipped > 0 && (
            <p>
              {skipped} selected {skipped === 1 ? "person has" : "people have"} an active badge, but the card link is missing.
              Revoke that badge, then generate a replacement.
            </p>
          )}
          {error && <p>{error}</p>}
        </div>
        <div className="rec-print-sheet-actions">
          <button type="button" className="rec-print-sheet-download" onClick={() => openA3(true)} disabled={loading || Boolean(preparing) || cards.length === 0}>
            {preparing === "download" ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button type="button" onClick={() => openA3(false)} disabled={loading || Boolean(preparing) || cards.length === 0}>
            {preparing === "print" ? "Preparing print…" : "Print"}
          </button>
        </div>
      </div>

      {loading && cards.length === 0 && <p className="rec-print-sheet-status">Preparing the cards…</p>}

      {!loading && !error && cards.length === 0 && (
        <p className="rec-print-sheet-status">No cards to print. Revoke the active badge, generate a replacement, then open this page again.</p>
      )}

      <div className="rec-print-sheet-pages">
        {sheets.map((sheet, sheetIndex) => (
          <section className="rec-print-a3" key={sheet[0]?.badge?.$id || sheet[0]?.badgeUrl || sheetIndex} aria-label={`A3 sheet ${sheetIndex + 1}`}>
            {sheet.map((card) => (
              <div className="rec-print-sheet-card" key={card.badge?.$id || card.badgeUrl}>
                <RecPrintableBadge badge={card} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
