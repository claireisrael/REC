"use client"

import { useState } from "react"
import { recoverRecBadgeTokenFromUrl } from "@/lib/rec-conference/scanning-rules.mjs"
import "./RecPrintableBadge.css"

export default function RecPrintableBadge({
  badge,
  showActions = false,
}) {
  const [bleed, setBleed] = useState(false)
  const token = recoverRecBadgeTokenFromUrl(badge?.badgeUrl)
  const name = badge?.registration?.name || "participant"
  const encoded = token ? encodeURIComponent(token) : ""
  const bleedQuery = bleed ? "&bleed=true" : ""
  const imageSrc = encoded ? `/api/v1/rec/badges/${encoded}/print?format=png` : ""
  const pdfHref = encoded ? `/api/v1/rec/badges/${encoded}/print?format=pdf&download=1${bleedQuery}` : ""
  const printHref = encoded ? `/api/v1/rec/badges/${encoded}/print?format=pdf${bleedQuery}` : ""
  const pngHref = encoded ? `/api/v1/rec/badges/${encoded}/print?format=png&download=1${bleedQuery}` : ""

  return (
    <div className="rec-print-badge-wrap">
      {showActions && (
        <div className="rec-print-badge-actions">
          <button type="button" className="rec-print-badge-print" onClick={() => window.open(printHref, "_blank")}>
            Print badge
          </button>
          {pdfHref && <a className="rec-print-badge-download" href={pdfHref}>Download PDF</a>}
          {pngHref && <a className="rec-print-badge-download" href={pngHref}>Download PNG</a>}
          <label className="rec-print-badge-bleed">
            <input type="checkbox" checked={bleed} onChange={(event) => setBleed(event.target.checked)} />
            3 mm bleed
          </label>
        </div>
      )}
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rec-print-badge-image" src={imageSrc} alt={`Badge for ${name}`} />
      ) : (
        <p className="rec-print-badge-missing">This badge cannot be printed until it is issued again.</p>
      )}
    </div>
  )
}
