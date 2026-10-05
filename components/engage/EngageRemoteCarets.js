"use client"

import { useEffect, useState } from "react"

/**
 * Lightweight Google Docs–style remote carets.
 * Positions are approximate and refresh while colleagues are live.
 */
export function EngageRemoteCarets({ editor = null, editors = [] }) {
  const [marks, setMarks] = useState([])

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      setMarks([])
      return undefined
    }
    let frame = 0
    const paint = () => {
      const view = editor.view
      if (!view || editor.isDestroyed) {
        setMarks([])
        return
      }
      const next = []
      for (const ed of Array.isArray(editors) ? editors : []) {
        const pos = Number(ed.cursorFrom)
        if (!Number.isFinite(pos) || pos < 0) continue
        try {
          const safePos = Math.min(pos, view.state.doc.content.size)
          const coords = view.coordsAtPos(safePos)
          if (!coords) continue
          const host = view.dom.closest(".engage-word-page") || view.dom.parentElement
          if (!host) continue
          const box = host.getBoundingClientRect()
          next.push({
            userId: ed.userId,
            name: ed.userName || "Colleague",
            color: ed.color || "#0ea5e9",
            snippet: ed.snippet || "",
            top: coords.top - box.top + host.scrollTop,
            left: coords.left - box.left + host.scrollLeft,
            height: Math.max(16, coords.bottom - coords.top),
          })
        } catch {
          /* position can be stale while the doc changes */
        }
      }
      setMarks(next)
    }
    paint()
    frame = window.setInterval(paint, 400)
    return () => window.clearInterval(frame)
  }, [editor, editors])

  if (!marks.length) return null
  return (
    <div className="engage-remote-carets" aria-hidden>
      {marks.map((mark) => (
        <div
          key={mark.userId}
          className="engage-remote-caret"
          style={{
            top: `${mark.top}px`,
            left: `${mark.left}px`,
            height: `${mark.height}px`,
            background: mark.color,
          }}
        >
          <span className="engage-remote-caret-label" style={{ background: mark.color }}>
            {mark.name}
            {mark.snippet ? ` · “${mark.snippet.slice(0, 28)}${mark.snippet.length > 28 ? "…" : ""}”` : ""}
          </span>
        </div>
      ))}
    </div>
  )
}
