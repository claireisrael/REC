"use client"

import { ENGAGE_PROOF_LOGO_SRC } from "@/lib/engage/signatures.mjs"
import { getNrepLogoUrl } from "@/lib/branding"

/**
 * Official stamps on a report: NREP logo + what was done + who did it.
 * Used on repository / published views and at the foot of the Word sheet.
 */
export function EngageSignatureProof({
  signatures = [],
  compact = false,
  title = "Signed by",
}) {
  const rows = Array.isArray(signatures) ? signatures : []
  if (!rows.length) return null
  const logoSrc = getNrepLogoUrl() || ENGAGE_PROOF_LOGO_SRC

  return (
    <div
      className={`engage-sig-proof${compact ? " engage-sig-proof--compact" : ""}`}
      data-engage-signature-proof="true"
      contentEditable={false}
    >
      {title ? <h2 className="engage-sig-proof-title">{title}</h2> : null}
      <div className="engage-sig-proof-grid">
        {rows.map((row) => {
          const done = Boolean(row.complete)
          const key = row.slot || row.role || row.userId || row.name
          return (
            <div
              key={key}
              className={`engage-sig-stamp${done ? " is-complete" : " is-pending"}`}
            >
              <div className="engage-sig-stamp-logo">
                <img src={logoSrc} alt="NREP" draggable={false} />
              </div>
              <div className="engage-sig-stamp-action">{row.action || (done ? "Recorded" : "Awaiting action")}</div>
              <div className="engage-sig-stamp-role">{row.role}</div>
              <div className="engage-sig-stamp-name">{row.name || "Pending"}</div>
              <div className="engage-sig-stamp-date">{row.date || "Pending"}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
