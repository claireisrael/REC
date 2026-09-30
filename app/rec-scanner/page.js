"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import QRCode from "qrcode"
import { code128DataUrl } from "@/lib/rec-conference/code128.mjs"
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
// Tera guns in auto-sense mode re-read a QR for as long as it stays in view.
// The same code arriving again within this window is one physical scan.
const REPEAT_READ_IGNORE_MS = 5000
const CLOCK_DRIFT_WARNING_MS = 60 * 1000

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

function formatScanClock(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { time: "—", day: "" }
  return {
    time: date.toLocaleTimeString("en-UG", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Kampala",
    }),
    day: date.toLocaleDateString("en-UG", {
      day: "numeric",
      month: "short",
      timeZone: "Africa/Kampala",
    }),
  }
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
    second: "2-digit",
    timeZone: "Africa/Kampala",
  })
}

function isRepeatRead(ref, value) {
  const now = Date.now()
  const repeat = ref.current.value === value && now - ref.current.at < REPEAT_READ_IGNORE_MS
  // Slide the window while the code stays in view, so a badge held under an
  // auto-sensing gun is ignored until it has been away for the full window.
  ref.current = { value, at: now }
  return repeat
}

function isGateUnit(unit) {
  return unit?.assignedRole === "Main Gate"
}

function findUnlockUnit(units, serialNumber) {
  return units.find((unit) => unit.serialNumber === serialNumber) || null
}

function unlockScanError(scanned, selectedSerial, units) {
  if (!isTeraHardwareSerial(scanned)) return "UNRECOGNIZED_DEVICE"
  const chosen = findUnlockUnit(units, selectedSerial)
  if (!chosen) {
    return "Choose the Tera in your hand first. Its QR is the only one that should be on screen."
  }
  if (scanned === chosen.serialNumber) return ""
  const other = findUnlockUnit(units, scanned)
  const readName = other?.deployedLocation || scanned
  return `That code is ${readName}, not ${chosen.deployedLocation}. Scan only the QR shown for ${chosen.deployedLocation}.`
}

function UnlockCard({ unit }) {
  const linearCode = code128DataUrl(unit.serialNumber)
  return (
    <article className={`rec-station-card${isGateUnit(unit) ? " rec-station-card-gate" : ""}`}>
      <div className="rec-station-codepad">
        {unit.qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="rec-station-qr"
            alt={`${unit.deployedLocation} serial ${unit.serialNumber}`}
            src={unit.qrDataUrl}
          />
        ) : (
          <p>Preparing this unit&apos;s code…</p>
        )}
        {linearCode ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="rec-station-linear"
            alt=""
            src={linearCode}
          />
        ) : null}
      </div>
      <strong>{unit.deployedLocation}</strong>
      <em>{isGateUnit(unit) ? "Main entrance" : "Hall scanner"}</em>
      <code>{unit.serialNumber}</code>
    </article>
  )
}

function unitFace(unit, index) {
  if (isGateUnit(unit)) {
    return { eyebrow: `Gate ${index + 1}`, title: "Main entrance", detail: "" }
  }
  const match = String(unit.deployedLocation || "").match(/^(.*?)\s*\((.*)\)\s*$/)
  return {
    eyebrow: "Hall",
    title: match ? match[1] : unit.deployedLocation,
    detail: match ? match[2] : "",
  }
}

function UnitPicker({ title, units, onChoose, layout }) {
  if (!units.length) return null
  return (
    <section className="rec-station-section">
      <div className="rec-station-section-head">
        <h2>{title}</h2>
        <span>{units.length} {units.length === 1 ? "unit" : "units"}</span>
      </div>
      <div className={`rec-station-picker rec-station-picker-${layout}`}>
        {units.map((unit, index) => {
          const face = unitFace(unit, index)
          return (
            <button
              key={unit.serialNumber}
              className={`rec-station-pick${isGateUnit(unit) ? " rec-station-pick-gate" : ""}`}
              type="button"
              onClick={() => onChoose(unit.serialNumber)}
            >
              <span className="rec-station-pick-kicker">{face.eyebrow}</span>
              <strong>{face.title}</strong>
              {face.detail ? <em>{face.detail}</em> : <em className="rec-station-pick-spacer" aria-hidden="true">&nbsp;</em>}
              <code>{unit.serialNumber}</code>
            </button>
          )
        })}
      </div>
    </section>
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
    name: scan.name || "Badge scan",
    email: scan.email || "",
    organization: scan.organization || "",
    eventName: scan.eventName || "",
    venue: scan.venue || "",
    categoryTag: scan.categoryTag || "",
    categoryDirection: scan.categoryDirection || "",
    status: scan.status || "rejected",
    note: scan.reason && scan.reason !== "ok" ? String(scan.reason).replaceAll("_", " ") : "",
  }
}

function presentCaptureStatus(status) {
  if (!status) return { tone: "", text: "" }
  if (/lost focus|Incomplete|ignored/i.test(status)) return { tone: "warn", text: status }
  const time = status.match(/at (\d{1,2}:\d{2})/)
  if (status.startsWith("Station input detected")) {
    return { tone: "quiet", text: time ? `Gun heard at ${time[1]}` : "Gun heard" }
  }
  if (status.startsWith("Badge input detected")) {
    return { tone: "quiet", text: time ? `Badge sent at ${time[1]}` : "Badge sent" }
  }
  if (status.startsWith("Reading scanner")) return { tone: "quiet", text: "Reading the code…" }
  return { tone: "quiet", text: status }
}

function mergeStationScanRow(stored, local) {
  if (!local) return stored
  const storedHasPerson = stored.name && stored.name !== "Badge scan"
  return {
    ...local,
    ...stored,
    name: storedHasPerson ? stored.name : (local.name || stored.name),
    email: storedHasPerson ? stored.email : (local.email || stored.email),
    organization: storedHasPerson ? stored.organization : (local.organization || stored.organization),
    categoryTag: storedHasPerson ? stored.categoryTag : (local.categoryTag || stored.categoryTag),
    categoryDirection: storedHasPerson ? stored.categoryDirection : (local.categoryDirection || stored.categoryDirection),
    scannedAt: stored.scannedAt || local.scannedAt,
    status: stored.status || local.status,
    eventName: stored.eventName || local.eventName,
    venue: stored.venue || local.venue,
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
  const [selectedSerial, setSelectedSerial] = useState("")
  const [selectedQr, setSelectedQr] = useState("")
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
  const lastBadgeReadRef = useRef({ value: "", at: 0 })
  const lastSerialReadRef = useRef({ value: "", at: 0 })
  const serverClockOffsetRef = useRef(0)
  const [clockDriftMs, setClockDriftMs] = useState(0)

  const syncServerClock = useCallback((serverNow) => {
    const serverMs = Date.parse(serverNow || "")
    if (Number.isNaN(serverMs)) return
    const offset = serverMs - Date.now()
    serverClockOffsetRef.current = offset
    setClockDriftMs(offset)
  }, [])

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
    lastBadgeReadRef.current = { value: "", at: 0 }
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
      syncServerClock(response.headers.get("date"))
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
      setFeedback(
        payload.openEvents?.length || !payload.stationNotice
          ? null
          : { kind: "error", message: payload.stationNotice }
      )
      playUnlockBeep()
    } catch (error) {
      setHandshakeError(error.message || HID_SCAN_CODES.DEVICE_UNREGISTERED)
      playRejectBuzz()
    } finally {
      setLoadingStation(false)
      focusCapture()
    }
  }, [focusCapture, syncServerClock])

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
      if (payload.now) {
        alertSinceRef.current = payload.now
        syncServerClock(payload.now)
      }
      const incoming = Array.isArray(payload.alerts) ? payload.alerts : []
      const fresh = incoming.filter((alert) => alert.id && !alertSeenRef.current.has(alert.id))
      fresh.forEach((alert) => alertSeenRef.current.add(alert.id))
      // API returns newest first; show oldest-first so the sequence makes sense.
      if (fresh.length) enqueueCrossStationAlerts([...fresh].reverse())
    } catch {
      // Best-effort. A missed poll just gets picked up next tick.
    }
  }, [enqueueCrossStationAlerts, serialNumber, syncServerClock])

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
        const merged = persisted.map((scan) => mergeStationScanRow(scanRowFromPersisted(scan), localById.get(scan.id)))
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
      if (isRepeatRead(lastSerialReadRef, scanned)) {
        setCaptureStatus(`Station QR read again at ${receivedAt} and ignored. Move the Tera away from the screen, then scan once.`)
        return
      }
      setCaptureStatus(`Station input detected at ${receivedAt}; completed by ${completion}.`)
      const error = unlockScanError(scanned, selectedSerial, REC_TERA_HW0009_DEPLOYMENTS)
      if (error) {
        setHandshakeError(error)
        playRejectBuzz()
        if (error === "UNRECOGNIZED_DEVICE") {
          window.setTimeout(() => setHandshakeError(""), 2200)
        }
        return
      }
      unlockStation(scanned)
      return
    }

    if (isRepeatRead(lastBadgeReadRef, scanned)) {
      setCaptureStatus(`Same badge read again at ${receivedAt} and ignored. Move it away from the Tera before the next badge.`)
      return
    }
    setCaptureStatus(`Badge input detected and sent at ${receivedAt}; completed by ${completion}.`)
    submitScan(scanned)
  }, [selectedSerial, serialNumber, submitScan, unlockStation])

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
    // Show server time, not the laptop's own clock, which may be wrong.
    const tick = () => setClock(formatClock(new Date(Date.now() + serverClockOffsetRef.current)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    // A refresh must return to the chooser. Restoring the last serial opened
    // whichever hall was saved (often Nile) before any unit was on screen.
    window.sessionStorage.removeItem(STATION_STORAGE_KEY)
    focusCapture()
  }, [focusCapture])

  useEffect(() => {
    if (!selectedSerial) {
      setSelectedQr("")
      return undefined
    }
    let cancelled = false
    QRCode.toDataURL(selectedSerial, {
      margin: 2,
      width: 240,
      errorCorrectionLevel: "H",
      color: { dark: "#000000", light: "#ffffff" },
    }).then((url) => {
      if (!cancelled) setSelectedQr(url)
    }).catch(() => {
      if (!cancelled) setSelectedQr("")
    })
    return () => {
      cancelled = true
    }
  }, [selectedSerial])

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
    const timer = window.setInterval(fetchTally, 60000)
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
    // Hide the unlock QR immediately so a gun still aimed at the screen
    // cannot open this station, or the unit beside it, again.
    lastSerialReadRef.current = { value: serialNumber, at: Date.now() }
    setSelectedSerial("")
    resetStationState("")
    focusCapture()
  }

  const chooseUnit = (serial) => {
    setHandshakeError("")
    setSelectedSerial(serial)
    focusCapture()
  }
  const locked = !serialNumber
  const hallUnits = REC_TERA_HW0009_DEPLOYMENTS.filter((unit) => !isGateUnit(unit))
  const gateUnits = REC_TERA_HW0009_DEPLOYMENTS.filter(isGateUnit)
  const selectedUnit = findUnlockUnit(REC_TERA_HW0009_DEPLOYMENTS, selectedSerial)
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
  const captureNote = presentCaptureStatus(captureStatus)

  const scanCaptureInput = (
    <div className="rec-station-capture">
      <span className="rec-station-capture-mark" aria-hidden="true" />
      <input
        id="rec-station-scan-input"
        ref={inputRef}
        aria-label={locked ? "Scan the white code on the gun" : "Scan a badge"}
        autoComplete="off"
        autoFocus
        className="rec-station-input"
        inputMode="none"
        placeholder={locked ? "Scan the white code on the gun" : "Scan a badge"}
        onInput={(event) => {
          // Clear the field immediately so a badge token is never displayed.
          const value = event.currentTarget.value
          event.currentTarget.value = ""
          appendCapturedText(value, "input")
        }}
      />
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
            <div className="rec-station-mast-row">
              <div className="rec-station-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badge/rec26-nrep.png" alt="NREP" />
                <div>
                  <span>{formatRecEdition(2026)} &amp; Expo</span>
                  <strong>Tera scanner station</strong>
                </div>
              </div>
              <div className="rec-station-meta">
                <Link href="/" className="rec-station-home" onClick={(event) => event.stopPropagation()}>← Home</Link>
                <span className="rec-station-chip">Fleet {REC_TERA_HW0009_DEPLOYMENTS.length}</span>
                {clock && <span className="rec-station-clock">{clock}</span>}
              </div>
            </div>
            {scanCaptureInput}
          </header>

          <section className="rec-station-hero">
            <p className="rec-station-kicker">{selectedUnit ? "Step 2 · Scan the code" : "Step 1 · Choose the gun"}</p>
            <h1>{selectedUnit ? selectedUnit.deployedLocation : "Choose the Tera in your hand"}</h1>
            <p>
              {selectedUnit
                ? `Point this gun at the white code. Only serial ${selectedUnit.serialNumber} unlocks this laptop.`
                : "Select the hall or gate printed on the gun. The white code appears after that, and only that code unlocks the station."}
            </p>
          </section>

          {!selectedUnit ? (
            <div className="rec-station-board">
              <UnitPicker title="Hall scanners" units={hallUnits} onChoose={chooseUnit} layout="halls" />
              <UnitPicker title="Main entrance" units={gateUnits} onChoose={chooseUnit} layout="gates" />
            </div>
          ) : (
            <div className="rec-station-solo">
              <UnlockCard unit={{ ...selectedUnit, qrDataUrl: selectedQr }} />
              <button className="rec-station-back" type="button" onClick={() => chooseUnit("")}>
                Choose a different unit
              </button>
            </div>
          )}

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
            <div className="rec-station-mast-row">
              <div className="rec-station-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badge/rec26-nrep.png" alt="NREP" />
                <div>
                  <strong>{allocation?.deployedLocation || "Location pending"}</strong>
                  <span>
                    {allocation?.assignedRole || "Assigned role pending"} · SN {serialNumber}
                    {allocation?.openEvents?.[0] ? ` · ${allocation.openEvents[0].name}` : ""}
                  </span>
                </div>
              </div>
              <div className="rec-station-meta">
                <Link href="/" className="rec-station-home" onClick={(event) => event.stopPropagation()}>Home</Link>
                {clock && <span className="rec-station-clock">{clock}</span>}
                <button className="rec-station-lock-btn" onClick={lockStation} type="button" disabled={pendingScans > 0}>
                  Lock
                </button>
              </div>
            </div>
            {scanCaptureInput}
          </header>

          {pendingScans > 0 && (
            <div className="rec-station-pending" role="status">
              Processing badge{pendingScans > 1 ? ` · ${pendingScans - 1} waiting` : "..."}
            </div>
          )}

          {feedback ? (
            <div className={`rec-station-result rec-station-result-${resultKind}`} aria-live="polite">
              <strong className={String(feedback.message || "").length > 40 ? "rec-station-result-detail" : ""}>
                {feedback.message}
              </strong>
              {(feedback.categoryTag || feedback.registrantName) && (
                <b className={feedback.categoryTag ? "rec-station-result-tag" : ""}>
                  {feedback.categoryTag || feedback.registrantName}
                </b>
              )}
              {feedback.scanType && (
                <span className="rec-station-result-event">
                  <small>Event</small>
                  {feedback.scanType}
                </span>
              )}
              <p>
                {[
                  feedback.registrantName && feedback.categoryTag ? feedback.registrantName : "",
                  feedback.registrantOrg,
                  feedback.categoryDirection ? `Direct to ${feedback.categoryDirection}` : "",
                  feedback.hopperDetected ? "Hall change flagged" : "",
                  feedback.detail,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          ) : null}

          {captureNote.tone === "warn" && (
            <p className="rec-station-capture-status is-warn" role="status">{captureNote.text}</p>
          )}

          {Math.abs(clockDriftMs) > CLOCK_DRIFT_WARNING_MS && (
            <p className="rec-station-feed-error" role="status">
              This laptop&apos;s clock is {Math.round(Math.abs(clockDriftMs) / 60000)} min {clockDriftMs > 0 ? "behind" : "ahead"}.
              The station clock above shows server time, which is what scans use. Correct the laptop&apos;s date and time settings.
            </p>
          )}

          <section className="rec-station-desk">
            {!feedback && (
              <div className="rec-station-ready" aria-live="polite">
                <span className="rec-station-ready-dot" aria-hidden="true" />
                <div>
                  <strong>Scan a badge</strong>
                  <p>Hold the code in front of this gun.</p>
                </div>
                {captureNote.tone === "quiet" && <em>{captureNote.text}</em>}
              </div>
            )}

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
          </section>

          <main className="rec-station-body">
            <div className="rec-station-body-top">
              <h2>This station</h2>
              <span className="rec-station-count">
                {scanRows.length === 0 ? "No scans yet" : `${scanRows.length} recorded`}
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
                  ) : scanRows.map((row) => {
                    const when = formatScanClock(row.scannedAt)
                    return (
                    <tr key={row.id}>
                      <td className="rec-station-when">
                        <strong>{when.time}</strong>
                        {when.day && <small>{when.day}</small>}
                      </td>
                      <td className="rec-station-person">
                        <strong>{row.name}</strong>
                        {row.email && <small>{row.email}</small>}
                      </td>
                      <td>
                        {row.categoryTag || "—"}
                        {row.categoryDirection && <small>{row.categoryDirection}</small>}
                      </td>
                      <td>{row.organization || "—"}</td>
                      <td className="rec-station-event">
                        <strong>{row.eventName || "—"}</strong>
                        {row.venue && <small>{row.venue}</small>}
                      </td>
                      <td>
                        <span className={resultClass(row.status)}>{resultLabel(row.status)}</span>
                        {row.note && <small>{row.note}</small>}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      )}
    </div>
  )
}
