"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  HID_SCAN_CODES,
  REC_TERA_HW0009_DEPLOYMENTS,
  isTeraHardwareSerial,
} from "@/lib/rec-conference/scanning-rules.mjs"
import { formatRecEdition } from "@/lib/rec-conference/rec-edition.mjs"
import "./rec-scanner-station.css"

const STATION_STORAGE_KEY = "rec.tera.station.serial"
const HID_SWEEP_IDLE_MS = 500
const MIN_HID_SWEEP_LENGTH = 8

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

function playDuplicateBeep() {
  playTone(620, 170, "triangle")
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
  if (status === "unconfirmed") return "Unconfirmed"
  return status || "Unknown"
}

function resultClass(status) {
  if (status === "accepted") return "rec-station-pill rec-station-pill-ok"
  if (status === "duplicate") return "rec-station-pill rec-station-pill-duplicate"
  if (status === "unconfirmed") return "rec-station-pill rec-station-pill-unconfirmed"
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

function scanRowFromPersisted(scan) {
  return {
    id: scan.id,
    scannedAt: scan.scannedAt,
    name: "Badge scan",
    email: "",
    organization: "",
    eventName: scan.eventName || "",
    venue: scan.venue || "",
    categoryTag: "",
    categoryDirection: "",
    status: scan.status || "rejected",
    note: scan.reason && scan.reason !== "ok" ? String(scan.reason).replaceAll("_", " ") : "",
  }
}

export default function RecScannerPage() {
  const inputRef = useRef(null)
  const bufferRef = useRef("")
  const sweepSourceRef = useRef("")
  const bufferTimerRef = useRef(null)
  const lastSweepCompletedAtRef = useRef(0)
  const scanQueueRef = useRef([])
  const processingRef = useRef(false)
  const stationGenerationRef = useRef(0)

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
  const [pendingScans, setPendingScans] = useState(0)
  const [captureStatus, setCaptureStatus] = useState("")
  const [feedError, setFeedError] = useState("")
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0)

  const alertQueueRef = useRef([])
  const alertSeenRef = useRef(new Set())
  const alertSinceRef = useRef("")
  const alertTimerRef = useRef(null)
  const stationTokenRef = useRef("")
  const recentPollRef = useRef(false)
  const recentRefreshPendingRef = useRef(false)

  const focusCapture = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  const resetStationState = useCallback((message = "") => {
    if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current)
    bufferTimerRef.current = null
    bufferRef.current = ""
    sweepSourceRef.current = ""
    lastSweepCompletedAtRef.current = 0
    setCaptureStatus("")
    stationGenerationRef.current += 1
    scanQueueRef.current = []
    setPendingScans(0)
    stationTokenRef.current = ""
    setSerialNumber("")
    setAllocation(null)
    setFeedback(null)
    setScanRows([])
    setFeedError("")
    setHistoryRefreshTick(0)
    recentRefreshPendingRef.current = false
    window.sessionStorage.removeItem(STATION_STORAGE_KEY)
    alertQueueRef.current = []
    alertSeenRef.current = new Set()
    if (alertTimerRef.current) {
      window.clearTimeout(alertTimerRef.current)
      alertTimerRef.current = null
    }
    setCrossStationAlert(null)
    setTally(null)
    setHandshakeError(message)
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
      if (!payload.station?.token) {
        throw new Error(HID_SCAN_CODES.DEVICE_UNREGISTERED)
      }
      stationTokenRef.current = payload.station.token
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

  const processScanQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true
    while (scanQueueRef.current.length) {
      const { serial, token, qrData, generation } = scanQueueRef.current.shift()
      const isCurrentStation = () => generation === stationGenerationRef.current
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 15000)
      try {
        const response = await fetch("/api/v1/rec/scanner/scans", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({ serialNumber: serial, qrData }),
        })
        const payload = await response.json().catch(() => ({}))

        if (!isCurrentStation()) continue
        if (response.status === 401) {
          playRejectBuzz()
          resetStationState("SESSION EXPIRED - SCAN THE STATION QR AGAIN")
          continue
        }

        // Only confirmed database rows belong in station history. Some error
        // responses have no persisted id; the feed will pick up any audit row.
        if (payload?.scan?.$id) {
          const row = scanRowFromPayload(payload)
          setScanRows((previous) => [row, ...previous.filter((item) => item.id !== row.id)].slice(0, 50))
        }

        if (response.ok) {
          const isDuplicate = payload.status === "duplicate"
          if (isDuplicate) playDuplicateBeep()
          else playSuccessBeep()
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
        if (!isCurrentStation()) continue
        playRejectBuzz()
        setFeedback({
          kind: "error",
          message: "SCAN STATUS UNKNOWN",
          detail: "Rescan this badge to verify. The first scan may have been recorded.",
        })
      } finally {
        window.clearTimeout(timeout)
        if (isCurrentStation()) {
          setPendingScans((count) => Math.max(0, count - 1))
          setHistoryRefreshTick((tick) => tick + 1)
        }
      }
    }
    processingRef.current = false
    if (scanQueueRef.current.length) processScanQueue()
    else focusCapture()
  }, [focusCapture, resetStationState])

  const submitScan = useCallback((qrData) => {
    if (!serialNumber || !stationTokenRef.current) return
    scanQueueRef.current.push({
      serial: serialNumber,
      token: stationTokenRef.current,
      qrData,
      generation: stationGenerationRef.current,
    })
    setPendingScans((count) => count + 1)
    processScanQueue()
  }, [processScanQueue, serialNumber])

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
    if (!serialNumber || !stationTokenRef.current) return
    try {
      const response = await fetch(
        `/api/v1/rec/scanner/alerts?since=${encodeURIComponent(alertSinceRef.current)}`,
        {
          cache: "no-store",
          headers: { Authorization: `Bearer ${stationTokenRef.current}` },
        }
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
    if (!serialNumber || !stationTokenRef.current) return
    try {
      const response = await fetch("/api/v1/rec/scanner/tally", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${stationTokenRef.current}` },
      })
      if (!response.ok) return
      const payload = await response.json().catch(() => ({}))
      setTally(payload)
    } catch {
      // Best-effort; keep showing the last known tally until the next tick.
    }
  }, [serialNumber])

  const fetchRecentScans = useCallback(async (afterPost = false) => {
    const token = stationTokenRef.current
    const generation = stationGenerationRef.current
    if (!serialNumber || !token || document.visibilityState !== "visible") return
    if (recentPollRef.current) {
      if (afterPost) recentRefreshPendingRef.current = true
      return
    }
    recentPollRef.current = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch("/api/v1/rec/scanner/scans/recent", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error("Could not refresh station history.")
      const payload = await response.json()
      if (generation !== stationGenerationRef.current) return
      const persisted = Array.isArray(payload.scans) ? payload.scans : []
      setScanRows((previous) => {
        const localById = new Map(previous.map((row) => [row.id, row]))
        const persistedIds = new Set(persisted.map((scan) => scan.id))
        const merged = persisted.map((scan) => {
          const stored = scanRowFromPersisted(scan)
          const local = localById.get(scan.id)
          return local ? { ...stored, ...local, scannedAt: stored.scannedAt, status: stored.status } : stored
        })
        return [...merged, ...previous.filter((row) => !persistedIds.has(row.id))]
          .sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt))
          .slice(0, 50)
      })
      setFeedError("")
    } catch {
      if (generation === stationGenerationRef.current) setFeedError("Station history is unavailable. New scan results still appear above.")
    } finally {
      window.clearTimeout(timeout)
      recentPollRef.current = false
      if (recentRefreshPendingRef.current && generation === stationGenerationRef.current) {
        recentRefreshPendingRef.current = false
        fetchRecentScans()
      }
    }
  }, [serialNumber])

  const consumeSweep = useCallback((value, completion) => {
    const scanned = String(value || "").trim()
    if (!scanned) return
    if (scanned.length < MIN_HID_SWEEP_LENGTH) {
      setCaptureStatus(`Incomplete scanner input (${scanned.length} characters). Check the scanner mode and try again.`)
      return
    }
    const receivedAt = new Date().toLocaleTimeString("en-UG", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Africa/Kampala",
    })
    if (!serialNumber) {
      setCaptureStatus(`Station input detected at ${receivedAt}; completed by ${completion}.`)
      if (isTeraHardwareSerial(scanned)) {
        unlockStation(scanned)
        return
      }
      setHandshakeError("UNRECOGNIZED_DEVICE")
      playRejectBuzz()
      window.setTimeout(() => setHandshakeError(""), 2200)
      return
    }

    setCaptureStatus(`Badge input detected and sent at ${receivedAt}; completed by ${completion}.`)
    submitScan(scanned)
  }, [serialNumber, submitScan, unlockStation])

  const finishSweep = useCallback((completion) => {
    if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current)
    bufferTimerRef.current = null
    const value = bufferRef.current
    bufferRef.current = ""
    sweepSourceRef.current = ""
    lastSweepCompletedAtRef.current = Date.now()
    consumeSweep(value, completion)
  }, [consumeSweep])

  const appendCapturedText = useCallback((value, source) => {
    if (!value) return
    // A keyboard wedge can also emit an input event. Keep one input source
    // per sweep so each character is buffered only once.
    if (sweepSourceRef.current && sweepSourceRef.current !== source) return
    sweepSourceRef.current = source
    if (!bufferRef.current) setCaptureStatus("Reading scanner input...")
    bufferRef.current += value
    if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current)
    bufferTimerRef.current = window.setTimeout(() => finishSweep("idle pause (no Enter or Tab)"), HID_SWEEP_IDLE_MS)
  }, [finishSweep])

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
    if (!serialNumber) return undefined
    fetchRecentScans()
    const timer = window.setInterval(() => fetchRecentScans(), 15000)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchRecentScans()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [fetchRecentScans, serialNumber])

  useEffect(() => {
    if (historyRefreshTick > 0 && serialNumber) fetchRecentScans(true)
  }, [fetchRecentScans, historyRefreshTick, serialNumber])

  useEffect(() => {
    const onWindowBlur = () => {
      setCaptureStatus("Browser lost focus. Scans made while another window or browser control has focus cannot reach this station.")
    }
    const onWindowFocus = () => {
      focusCapture()
      setCaptureStatus((previous) => previous.startsWith("Browser lost focus.")
        ? "Browser active again. Scan a badge to confirm input."
        : previous)
    }
    window.addEventListener("blur", onWindowBlur)
    window.addEventListener("focus", onWindowFocus)
    return () => {
      window.removeEventListener("blur", onWindowBlur)
      window.removeEventListener("focus", onWindowFocus)
    }
  }, [focusCapture])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      if (event.key === "Shift") return
      if (event.repeat) return

      if (event.key === "Enter" || event.key === "Tab") {
        if (!bufferRef.current) {
          // Some scanners send their configured suffix after the idle timer.
          // Do not let that late Enter activate the focused Lock button.
          if (Date.now() - lastSweepCompletedAtRef.current < HID_SWEEP_IDLE_MS) event.preventDefault()
          return
        }
        event.preventDefault()
        finishSweep(event.key)
        return
      }

      if (event.key.length !== 1) return
      if (event.target?.closest?.("input:not(.rec-station-input), textarea, select, [contenteditable='true']")) return
      // Let the focused scan field receive actual input events. Some HID
      // scanners insert text without ordinary printable keydown events.
      if (event.target === inputRef.current) return
      if (event.key === " " && event.target?.closest?.("button, a")) return
      event.preventDefault()
      appendCapturedText(event.key, "keydown")
    }

    const onPaste = (event) => {
      const value = event.clipboardData?.getData("text")
      if (!value || event.target?.closest?.("input:not(.rec-station-input), textarea, [contenteditable='true']")) return
      event.preventDefault()
      bufferRef.current = value
      sweepSourceRef.current = "paste"
      finishSweep("paste")
    }

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("paste", onPaste, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("paste", onPaste, true)
      if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current)
    }
  }, [appendCapturedText, finishSweep])

  const lockStation = () => {
    resetStationState("")
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

  const scanCaptureInput = (
    <div className="rec-station-capture-target">
      <label htmlFor="rec-station-scan-input">Scanner input</label>
      <input
        id="rec-station-scan-input"
        ref={inputRef}
        aria-label="Scanner input"
        autoComplete="off"
        autoFocus
        className="rec-station-input"
        inputMode="none"
        placeholder={locked ? "Click here, then scan the station QR" : "Click here, then scan a badge QR"}
        onInput={(event) => {
          // Clear the field immediately so a badge token is never displayed.
          const value = event.currentTarget.value
          event.currentTarget.value = ""
          appendCapturedText(value, "input")
        }}
      />
      <small>Keep this field focused while scanning.</small>
    </div>
  )

  return (
    <div id="rec-tera-station" className="rec-station" onClick={focusCapture}>
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

          {scanCaptureInput}

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
                : captureStatus || "Waiting for a serial QR. Keep this tab focused."}
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
              <button className="rec-station-lock-btn" onClick={lockStation} type="button" disabled={pendingScans > 0}>
                Lock station
              </button>
            </div>
          </header>

          {scanCaptureInput}

          {pendingScans > 0 && (
            <div className="rec-station-pending" role="status">
              Processing badge{pendingScans > 1 ? ` · ${pendingScans - 1} waiting` : "..."}
            </div>
          )}

          <div className={`rec-station-result rec-station-result-${resultKind}`} aria-live="polite">
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
                    feedback.detail,
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

          <div className="rec-station-capture-status" role="status">
            {captureStatus || "No scanner input detected yet. Keep this browser tab active."}
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
                <h2>Recent station records</h2>
                <p>Latest 50 persisted scans for this Tera in Kampala time. Registrant details appear for scans handled in this tab. The tally above covers all stations.</p>
              </div>
              <span className="rec-station-chip">
                {acceptedCount} accepted · {scanRows.length} shown
              </span>
            </div>

            {feedError && <p className="rec-station-feed-error" role="status">{feedError}</p>}

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
                        No persisted scans for this station yet. Point the unlocked Tera at a badge QR.
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
