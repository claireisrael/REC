"use client"

import { useEffect, useRef } from "react"
import {
  formatRecParticipantCategoryTag,
  getRecBadgeConferenceTitle,
} from "@/lib/rec-conference/registration-tracks.mjs"
import {
  formatRecBadgeDateRange,
  formatRecBadgeDisplayName,
  formatRecBadgeEditionLine,
  formatRecBadgeHashtag,
  formatRecBadgeRoleLabel,
  formatRecBadgeTheme,
  formatRecBadgeVenue,
} from "@/lib/rec-conference/rec-badge-display.mjs"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import "./RecPrintableBadge.css"

// The printed card is a fixed 100mm x 140mm with overflow hidden, so
// content that runs long (a name or organization that wraps to a second
// line) can silently get clipped at print time even though it looks fine
// on screen, where the card is free to grow. 1mm = 96/25.4 CSS px - the
// same ratio Chromium's print/PDF engine uses - so this is the real
// physical budget regardless of screen DPI.
const PRINT_CARD_HEIGHT_PX = 140 * (96 / 25.4)
const NAME_MIN_FONT_PX = 11

export default function RecPrintableBadge({
  badge,
  showActions = false,
}) {
  const conference = badge?.conference || {}
  const registration = badge?.registration || {}
  const year = conference.year
  const displayName = formatRecBadgeDisplayName(registration)
  const cardRef = useRef(null)
  const nameRef = useRef(null)
  const tag = registration.participantCategoryTag
    || formatRecParticipantCategoryTag(registration, year)
  const badgeNumber = badge?.badge?.badgeNumberLabel
    || badge?.badgeNumberLabel
    || ""
  const role = formatRecBadgeRoleLabel(registration.registrationType)
  const dateRange = formatRecBadgeDateRange(conference.startDate, conference.endDate, year)
  const venue = formatRecBadgeVenue(conference)
  const theme = formatRecBadgeTheme(conference)
  const hashtag = formatRecBadgeHashtag(year)
  const editionLine = formatRecBadgeEditionLine(year)
  const nrepLogo = conference.logoUrl || "/badge/nrep-mark.svg"

  // Shrink-to-fit for the name only - it's the field most likely to run
  // long (a title + given + other + last name), and the one place a couple
  // of points of size makes the biggest difference to total card height.
  useEffect(() => {
    const card = cardRef.current
    const name = nameRef.current
    if (!card || !name) return
    name.style.fontSize = ""
    let guard = 0
    while (card.scrollHeight > PRINT_CARD_HEIGHT_PX && guard < 14) {
      const current = Number.parseFloat(getComputedStyle(name).fontSize)
      if (!(current > NAME_MIN_FONT_PX)) break
      name.style.fontSize = `${current - 1}px`
      guard += 1
    }
  }, [displayName, badgeNumber, tag])

  return (
    <div className="rec-print-badge-wrap">
      {showActions && (
        <div className="rec-print-badge-actions">
          <button type="button" className="rec-print-badge-print" onClick={() => window.print()}>
            Print badge
          </button>
        </div>
      )}
      <article ref={cardRef} className="rec-print-badge" aria-label={`Printed badge for ${displayName}`}>
        <p className="rec-print-badge-edge">{hashtag}</p>
        <header className="rec-print-badge-header">
          <div className="rec-print-badge-logos">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="rec-print-badge-ministry"
              src="/badge/ministry.jpeg"
              alt="Ministry of Energy and Mineral Development"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="rec-print-badge-nrep" src={nrepLogo} alt="NREP" />
          </div>
          <p className="rec-print-badge-kicker">Renewable Energy Conference</p>
          <h1>{editionLine}</h1>
        </header>
        <div className="rec-print-badge-hero">
          {dateRange && <p className="rec-print-badge-dates">{dateRange}</p>}
          <p className="rec-print-badge-venue">{venue}</p>
        </div>
        <div className="rec-print-badge-body">
          <p className="rec-print-badge-theme">{theme}</p>
          <p ref={nameRef} className="rec-print-badge-name">{displayName}</p>
          {registration.organization && (
            <p className="rec-print-badge-org">{registration.organization}</p>
          )}
          {role && <p className="rec-print-badge-type">{role}</p>}
          <div className="rec-print-badge-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={badge?.qrDataUrl} alt="" />
          </div>
          <p className="rec-print-badge-tag">{tag}</p>
        </div>
        <footer className="rec-print-badge-footer">
          <span>{badgeNumber || getRecBadgeConferenceTitle(conference) || formatRecEdition(year)}</span>
          <span>Scan at entrance</span>
        </footer>
      </article>
    </div>
  )
}
