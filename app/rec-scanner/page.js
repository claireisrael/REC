"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  HID_KEYSTROKE_WINDOW_MS,
  HID_SCAN_CODES,
  REC_TERA_HW0009_DEPLOYMENTS,
  isTeraHardwareSerial,
} from "@/lib/rec-conference/scanning-rules.mjs"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import "./rec-scanner-station.css"

const STATION_STORAGE_KEY = "rec.tera.station.serial"

function playTone(frequency, durationMs, type = "sine") {
  if (typeof window === "undefined") return
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return

  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.value = frequency
  oscillator.connect(gain)
  gain.connect(context.destination)
  gain.gain.setValueAtTime(0.18, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + durationMs / 1000)
  oscillator.start()
  oscillator.stop(context.currentTime + durationMs / 1000)
  oscillator.onended = () => context.close().catch(() => {})
}

function playUnlockBeep() {
  playTone(880, 140, "square")
}

function playSuccessBeep() {
  playTone(1320, 90, "sine")
}

function playRejectBuzz() {
  playTone(220, 300, "square")
}

function playCrossAlertChime() {
  playTone(660, 160, "triangle")
  window.setTimeout(() => playTone(990, 160, "triangle"), 180)
}

function formatScanTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-UG", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Africa/Kampala",
  })
}

function formatAlertLocation(alert) {
  return alert?.eventName || alert?.venue || "another scan point"
}

function resultLabel(status) {
  if (status === "accepted") return "Accepted"
  if (status === "duplicate") return "Already scanned"
  if (status === "rejected") return "Rejected"
  return status || "Unknown"
}

function resultClass(status) {
  if (status === "accepted") return "rec-station-pill rec-station-pill-ok"
  if (status === "duplicate") return "rec-station-pill rec-station-pill-duplicate"
  return "rec-station-pill rec-station-pill-error"
}

function formatClock(value = new Date()) {
  return value.toLocaleString("en-UG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  })
}

function UnlockCard({ unit, kind = "hall" }) {
  return (
    <article className={`rec-station-card${kind === "gate" ? " rec-station-card-gate" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={`${unit.deployedLocation} serial ${unit.serialNumber}`}
        src={unit.qrDataUrl}
      />
      <strong>{unit.deployedLocation}</strong>
      <em>{kind === "gate" ? "Main entrance" : "Hall scanner"}</em>
      <code>{unit.serialNumber}</code>
    </article>
  )
}

function scanRowFromPayload(payload, fallbackMessage = "") {
  const status = payload?.status === "duplicate"
    ? "duplicate"
    : payload?.status === "accepted"
      ? "accepted"
      : "rejected"
  return {
    id: payload?.scan?.$id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scannedAt: payload?.scan?.scannedAt || payload?.scannedAt || new Date().toISOString(),
    name: payload?.registration?.name || "Unknown registrant",
    email: payload?.registration?.email || "",
    organization: payload?.registration?.organization || "",
    eventName: payload?.event?.name || payload?.scanType || "",
    venue: payload?.event?.venue || payload?.deployedLocation || "",
    categoryTag: payload?.registration?.participantCategoryTag || "",
    categoryDirection: payload?.registration?.participantCategoryDirection || "",
    status,
    note: payload?.reason && payload.reason !== "ok"
      ? String(payload.reason).replaceAll("_", " ")
      : (status === "rejected" ? (payload?.error || fallbackMessage) : ""),
  }
}

export default function RecScannerPage() {
  const inputRef = useRef(null)
  const bufferRef = useRef("")
  const lastKeyAtRef = useRef(0)
  const submittingRef = useRef(false)

  const [serialNumber, setSerialNumber] = useState("")
  const [allocation, setAllocation] = useState(null)
  const [handshakeError, setHandshakeError] = useState("")
  const [loadingStation, setLoadingStation] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [scanRows, setScanRows] = useState([])
  const [unlockCodes, setUnlockCodes] = useState([])
  const [clock, setClock] = useState("")
  const [crossStationAlert, setCrossStationAlert] = useState(null)
  const [tally, setTally] = useState(null)

  const alertQueueRef = useRef([])
  const alertSeenRef = useRef(new Set())
  const alertSinceRef = useRef("")
  const alertTimerRef = useRef(null)

  const focusCapture = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const unlockStation = useCallback(async (serial) => {
    setLoadingStation(true)
    setHandshakeError("")
    try {
      const response = await fetch(
        `/api/v1/rec/scanner/scans?serialNumber=${encodeURIComponent(serial)}`,
        { cache: "no-store" }
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || HID_SCAN_CODES.DEVICE_UNREGISTERED)
      }
      setSerialNumber(serial)
      setAllocation({
        ...(payload.allocation || {}),
        openEvents: payload.openEvents || [],
        events: payload.events || [],
      })
      window.sessionStorage.setItem(STATION_STORAGE_KEY, serial)
      playUnlockBeep()
    } catch (error) {
      setHandshakeError(error.message || HID_SCAN_CODES.DEVICE_UNREGISTERED)
      playRejectBuzz()
    } finally {
      setLoadingStation(false)
      focusCapture()
    }
  }, [focusCapture])

  const submitScan = useCallback(async (qrData) => {
    if (!serialNumber || submittingRef.current) return
    submittingRef.current = true
    try {
      const response = await fetch("/api/v1/rec/scanner/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ serialNumber, qrData }),
      })
      const payload = await response.json().catch(() => ({}))
      const row = scanRowFromPayload(
        payload,
        payload.error || payload.code || "SCAN REJECTED"
      )
      setScanRows((previous) => [row, ...previous].slice(0, 200))

      if (response.ok) {
        const isDuplicate = payload.status === "duplicate"
        playSuccessBeep()
        setFeedback({
          kind: isDuplicate ? "duplicate" : "ok",
          message: isDuplicate ? "ALREADY SCANNED" : "SCANNED OK",
          hopperDetected: Boolean(payload.hopperDetected),
          scanType: payload.event?.name || payload.scanType || "",
          registrantName: payload.registration?.name || "",
          registrantOrg: payload.registration?.organization || "",
          categoryTag: payload.registration?.participantCategoryTag || "",
          categoryDirection: payload.registration?.participantCategoryDirection || "",
        })
      } else {
        playRejectBuzz()
        setFeedback({
          kind: "error",
          message: payload.error || payload.code || "SCAN REJECTED",
        })
      }
    } catch {
      playRejectBuzz()
      const row = scanRowFromPayload({}, "SCAN REJECTED")
      setScanRows((previous) => [row, ...previous].slice(0, 200))
      setFeedback({ kind: "error", message: "SCAN REJECTED" })
    } finally {
      submittingRef.current = false
      focusCapture()
    }
  }, [focusCapture, serialNumber])

  const advanceAlertQueue = useCallback(() => {
    const next = alertQueueRef.current.shift()
    setCrossStationAlert(next || null)
    if (next) {
      playCrossAlertChime()
      alertTimerRef.current = window.setTimeout(advanceAlertQueue, 6000)
    } else {
      alertTimerRef.current = null
    }
  }, [])

  const enqueueCrossStationAlerts = useCallback((alerts) => {
    if (!alerts.length) return
    alertQueueRef.current.push(...alerts)
    if (!alertTimerRef.current) advanceAlertQueue()
  }, [advanceAlertQueue])

  const pollCrossStationAlerts = useCallback(async () => {
    if (!serialNumber) return
    try {
      const response = await fetch(
        `/api/v1/rec/scanner/alerts?serialNumber=${encodeURIComponent(serialNumber)}`
        + `&since=${encodeURIComponent(alertSinceRef.current)}`,
        { cache: "no-store" }
      )
      if (!response.ok) return
      const payload = await response.json().catch(() => ({}))
      if (payload.now) alertSinceRef.current = payload.now
      const incoming = Array.isArray(payload.alerts) ? payload.alerts : []
      const fresh = incoming.filter((alert) => alert.id && !alertSeenRef.current.has(alert.id))
      fresh.forEach((alert) => alertSeenRef.current.add(alert.id))
      // API returns newest first; show oldest-first so the sequence makes sense.
      if (fresh.length) enqueueCrossStationAlerts([...fresh].reverse())
    } catch {
      // Best-effort. A missed poll just gets picked up next tick.
    }
  }, [enqueueCrossStationAlerts, serialNumber])

  const fetchTally = useCallback(async () => {
    if (!serialNumber) return
    try {
      const response = await fetch(
        `/api/v1/rec/scanner/tally?serialNumber=${encodeURIComponent(serialNumber)}`,
        { cache: "no-store" }
      )
      if (!response.ok) return
      const payload = await response.json().catch(() => ({}))
      setTally(payload)
    } catch {
      // Best-effort; keep showing the last known tally until the next tick.
    }
  }, [serialNumber])

  const consumeSweep = useCallback((value) => {
    const scanned = String(value || "").trim()
    if (!scanned) return

    if (!serialNumber) {
      if (isTeraHardwareSerial(scanned)) {
        unlockStation(scanned)
        return
      }
      setHandshakeError("UNRECOGNIZED_DEVICE")
      playRejectBuzz()
      window.setTimeout(() => setHandshakeError(""), 2200)
      return
    }

    submitScan(scanned)
  }, [serialNumber, submitScan, unlockStation])

  useEffect(() => {
    const tick = () => setClock(formatClock())
    tick()
    const timer = window.setInterval(tick, 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all(
      REC_TERA_HW0009_DEPLOYMENTS.map(async (unit) => ({
        ...unit,
        qrDataUrl: await QRCode.toDataURL(unit.serialNumber, {
          margin: 1,
          width: 220,
          errorCorrectionLevel: "M",
          color: { dark: "#102a43", light: "#ffffff" },
        }),
      }))
    ).then((codes) => {
      if (!cancelled) setUnlockCodes(codes)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STATION_STORAGE_KEY)
    if (stored && isTeraHardwareSerial(stored)) {
      unlockStation(stored)
    }
    focusCapture()
  }, [focusCapture, unlockStation])

  useEffect(() => {
    if (!serialNumber) return undefined
    alertSinceRef.current = new Date().toISOString()
    alertSeenRef.current = new Set()
    pollCrossStationAlerts()
    const timer = window.setInterval(pollCrossStationAlerts, 6000)
    return () => window.clearInterval(timer)
  }, [pollCrossStationAlerts, serialNumber])

  useEffect(() => {
    if (!serialNumber) {
      setTally(null)
      return undefined
    }
    fetchTally()
    const timer = window.setInterval(fetchTally, 20000)
    return () => window.clearInterval(timer)
  }, [fetchTally, serialNumber])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      if (event.key === "Shift") return

      if (event.key === "Enter") {
        event.preventDefault()
        const value = bufferRef.current
        bufferRef.current = ""
        lastKeyAtRef.current = 0
        consumeSweep(value)
        return
      }

      if (event.key.length !== 1) return
      event.preventDefault()
      const now = Date.now()
      if (bufferRef.current && now - lastKeyAtRef.current > HID_KEYSTROKE_WINDOW_MS) {
        bufferRef.current = ""
      }
      bufferRef.current += event.key
      lastKeyAtRef.current = now
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [consumeSweep])

  const lockStation = () => {
    setSerialNumber("")
    setAllocation(null)
    setFeedback(null)
    setScanRows([])
    setHandshakeError("")
    window.sessionStorage.removeItem(STATION_STORAGE_KEY)
    alertQueueRef.current = []
    alertSeenRef.current = new Set()
    if (alertTimerRef.current) {
      window.clearTimeout(alertTimerRef.current)
      alertTimerRef.current = null
    }
    setCrossStationAlert(null)
    setTally(null)
    focusCapture()
  }

  const locked = !serialNumber
  const acceptedCount = scanRows.filter((row) => row.status === "accepted").length
  const hallUnits = unlockCodes.filter((unit) => unit.assignedRole !== "Main Gate")
  const gateUnits = unlockCodes.filter((unit) => unit.assignedRole === "Main Gate")
  const statusClass = handshakeError
    ? "rec-station-status rec-station-status-error"
    : loadingStation
      ? "rec-station-status rec-station-status-load"
      : "rec-station-status rec-station-status-wait"
  const resultKind = feedback?.kind === "ok"
    ? "ok"
    : feedback?.kind === "duplicate"
      ? "duplicate"
      : feedback
        ? "error"
        : "idle"

  return (
    <div id="rec-tera-station" className="rec-station" onClick={focusCapture}>
      <input
        ref={inputRef}
        aria-label="HID scanner capture"
        autoComplete="off"
        autoFocus
        className="rec-station-input"
        inputMode="none"
        onBlur={focusCapture}
        readOnly
      />

      {crossStationAlert && (
        <div className="rec-station-cross-alert" role="alert">
          <div>
            <strong>⚠ Badge re-scanned elsewhere</strong>
            <p>
              Already used at {formatAlertLocation(crossStationAlert)}
              {crossStationAlert.scannedAt ? ` · ${formatScanTime(crossStationAlert.scannedAt)}` : ""}
            </p>
          </div>
        </div>
      )}

      {locked ? (
        <>
          <header className="rec-station-top">
            <div className="rec-station-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badge/ministry.jpeg" alt="Ministry of Energy and Mineral Development" />
              <div>
                <span>{formatRecEdition(2026)} &amp; Expo</span>
                <strong>Tera scanner station</strong>
              </div>
            </div>
            <div className="rec-station-meta">
              <span className="rec-station-chip">Fleet {REC_TERA_HW0009_DEPLOYMENTS.length}</span>
              {clock && <span className="rec-station-clock">{clock}</span>}
            </div>
          </header>

          <section className="rec-station-hero">
            <p className="rec-station-kicker">Station locked</p>
            <h1>Unlock the Tera in your hand</h1>
            <p>
              Plug that one gun into this laptop, then point it at the matching QR on this screen.
              Do not use a second Tera.
            </p>
          </section>

          <div className="rec-station-steps">
            <div className="rec-station-step">
              <b>1</b>
              <div>
                <span>Plug in</span>
                <small>Connect the Tera you are holding to this laptop.</small>
              </div>
            </div>
            <div className="rec-station-step">
              <b>2</b>
              <div>
                <span>Scan this screen</span>
                <small>Point it at the QR with the same serial as that gun.</small>
              </div>
            </div>
            <div className="rec-station-step">
              <b>3</b>
              <div>
                <span>Scan badges</span>
                <small>After unlock, scan the attendee badge QR.</small>
              </div>
            </div>
          </div>

          <div className="rec-station-board">
            <section className="rec-station-section">
              <h2>Hall scanners</h2>
              <div className="rec-station-grid">
                {hallUnits.map((unit) => (
                  <UnlockCard key={unit.serialNumber} unit={unit} />
                ))}
              </div>
            </section>
            <section className="rec-station-section">
              <h2>Main entrance</h2>
              <div className="rec-station-grid">
                {gateUnits.map((unit) => (
                  <UnlockCard key={unit.serialNumber} unit={unit} kind="gate" />
                ))}
              </div>
            </section>
          </div>

          <div className={statusClass}>
            {handshakeError
              ? handshakeError
              : loadingStation
                ? "Authorizing this Tera…"
                : "Waiting for a serial QR. Keep this tab focused."}
          </div>
        </>
      ) : (
        <div className="rec-station-live">
          <header className="rec-station-live-head">
            <div>
              <p>Live station</p>
              <h1>{allocation?.deployedLocation || "Location pending"}</h1>
              <span>
                {allocation?.assignedRole || "Assigned role pending"} · SN {serialNumber}
                {allocation?.openEvents?.[0] ? ` · ${allocation.openEvents[0].name}` : ""}
              </span>
            </div>
            <div className="rec-station-meta">
              <span className="rec-station-chip rec-station-chip-live">Unlocked</span>
              {clock && <span className="rec-station-clock">{clock}</span>}
              <button className="rec-station-lock-btn" onClick={lockStation} type="button">
                Lock station
              </button>
            </div>
          </header>

          <div className={`rec-station-result rec-station-result-${resultKind}`}>
            {feedback ? (
              <>
                <strong>{feedback.message}</strong>
                {(feedback.categoryTag || feedback.registrantName) && (
                  <b>{feedback.categoryTag || feedback.registrantName}</b>
                )}
                <p>
                  {[
                    feedback.registrantName && feedback.categoryTag ? feedback.registrantName : "",
                    feedback.registrantOrg,
                    feedback.scanType,
                    feedback.categoryDirection ? `Direct to ${feedback.categoryDirection}` : "",
                    feedback.hopperDetected ? "Hall change flagged" : "",
                  ].filter(Boolean).join(" · ")}
                </p>
              </>
            ) : (
              <>
                <strong>Ready for badges</strong>
                <p>Keep this page focused and scan the attendee QR with the same Tera.</p>
              </>
            )}
          </div>

          {tally?.summary && (
            <div className="rec-station-tally" aria-label="Conference-wide sign-in tally">
              <div>
                <strong>{tally.summary.uniqueAttendees?.toLocaleString() ?? "—"}</strong>
                <span>Signed in</span>
              </div>
              <div>
                <strong>{tally.summary.registeredAttendees?.toLocaleString() ?? "—"}</strong>
                <span>Registered</span>
              </div>
              <div>
                <strong>{tally.summary.notYetScanned?.toLocaleString() ?? "—"}</strong>
                <span>Not yet in</span>
              </div>
              <div>
                <strong>{tally.summary.attendanceRate ?? 0}%</strong>
                <span>Attendance</span>
              </div>
            </div>
          )}

          <main className="rec-station-body">
            <div className="rec-station-body-top">
              <div>
                <h2>This session</h2>
                <p>Each accepted or rejected scan is added below in Kampala time.</p>
              </div>
              <span className="rec-station-chip">
                {acceptedCount} accepted · {scanRows.length} recorded
              </span>
            </div>

            <div className="rec-station-table-wrap">
              <table className="rec-station-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Registrant</th>
                    <th>Category</th>
                    <th>Organization</th>
                    <th>Event</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {scanRows.length === 0 ? (
                    <tr>
                      <td className="rec-station-empty" colSpan={6}>
                        No scans yet. Point the unlocked Tera at a badge QR.
                      </td>
                    </tr>
                  ) : scanRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatScanTime(row.scannedAt)}</td>
                      <td>
                        {row.name}
                        {row.email && <small>{row.email}</small>}
                      </td>
                      <td>
                        {row.categoryTag || "—"}
                        {row.categoryDirection && <small>{row.categoryDirection}</small>}
                      </td>
                      <td>{row.organization || "—"}</td>
                      <td>
                        {row.eventName || "—"}
                        {row.venue && <small>{row.venue}</small>}
                      </td>
                      <td>
                        <span className={resultClass(row.status)}>{resultLabel(row.status)}</span>
                        {row.note && <small>{row.note}</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
