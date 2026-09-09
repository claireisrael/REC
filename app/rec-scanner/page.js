"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  HID_KEYSTROKE_WINDOW_MS,
  HID_SCAN_CODES,
  REC_TERA_HW0009_SERIALS,
  isTeraHardwareSerial,
} from "@/lib/rec-conference/scanning-rules.mjs"

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
      setFeedback({ kind: "error", message: "SCAN REJECTED" })
    } finally {
      submittingRef.current = false
      window.setTimeout(() => setFeedback(null), 2200)
      focusCapture()
    }
  }, [focusCapture, serialNumber])

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
    const stored = window.sessionStorage.getItem(STATION_STORAGE_KEY)
    if (stored && isTeraHardwareSerial(stored)) {
      unlockStation(stored)
    }
    focusCapture()
  }, [focusCapture, unlockStation])

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
    setHandshakeError("")
    window.sessionStorage.removeItem(STATION_STORAGE_KEY)
    focusCapture()
  }

  const locked = !serialNumber

  return (
    <div
      id="rec-tera-station"
      className="flex min-h-screen flex-col bg-slate-950 text-white"
      onClick={focusCapture}
    >
      <input
        ref={inputRef}
        aria-label="HID scanner capture"
        autoComplete="off"
        autoFocus
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        inputMode="none"
        onBlur={focusCapture}
        readOnly
      />

      {locked ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-6xl font-black tracking-tight md:text-8xl">🔒 STATION LOCKED</p>
          <p className="max-w-2xl text-lg text-slate-300 md:text-2xl">
            Scan this Tera HW0009 serial barcode to unlock the station.
          </p>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
            Fleet {REC_TERA_HW0009_SERIALS.length} units
          </p>
          {loadingStation && <p className="text-amber-300">Authorizing device…</p>}
          {handshakeError && (
            <div className="rounded-2xl bg-red-700 px-8 py-5 text-2xl font-black">
              🛑 SCAN REJECTED
              <div className="mt-2 text-lg font-semibold">{handshakeError}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-screen flex-col">
          <header className="flex items-center justify-between gap-4 bg-cyan-700 px-6 py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-100">Active unit location</p>
              <h1 className="text-3xl font-black md:text-5xl">
                {allocation?.deployedLocation || "Location pending"}
              </h1>
              <p className="mt-1 text-sm text-cyan-100">
                {allocation?.assignedRole || "Assigned role pending"} · SN {serialNumber}
              </p>
              {allocation?.openEvents?.[0] && (
                <p className="mt-2 text-base font-semibold text-white">
                  Event: {allocation.openEvents[0].name}
                </p>
              )}
            </div>
            <button
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white"
              onClick={lockStation}
              type="button"
            >
              Lock station
            </button>
          </header>

          <main className="relative flex flex-1 items-center justify-center px-6 py-10">
            {!feedback && (
              <p className="text-center text-3xl font-bold text-slate-300 md:text-5xl">
                Ready for badge QR / barcode
              </p>
            )}

            {feedback?.kind === "ok" && (
              <div className="w-full max-w-3xl rounded-3xl bg-emerald-500 px-8 py-12 text-center shadow-2xl">
                <p className="text-5xl font-black md:text-7xl">✅ SCANNED OK</p>
                {feedback.registrantName && (
                  <p className="mt-6 text-3xl font-black">{feedback.registrantName}</p>
                )}
                {feedback.registrantOrg && (
                  <p className="mt-2 text-lg font-semibold">{feedback.registrantOrg}</p>
                )}
                {feedback.scanType && (
                  <p className="mt-4 text-xl font-semibold uppercase tracking-wide">
                    {String(feedback.scanType).replaceAll("_", " ")}
                  </p>
                )}
                {feedback.hopperDetected && (
                  <div className="mt-6 rounded-2xl bg-amber-300 px-5 py-4 text-2xl font-black text-amber-950">
                    Hopper detected — hall change flagged
                  </div>
                )}
              </div>
            )}

            {feedback?.kind === "duplicate" && (
              <div className="w-full max-w-3xl rounded-3xl bg-amber-400 px-8 py-12 text-center text-amber-950 shadow-2xl">
                <p className="text-5xl font-black md:text-7xl">ALREADY SCANNED</p>
                {feedback.registrantName && (
                  <p className="mt-6 text-3xl font-black">{feedback.registrantName}</p>
                )}
                {feedback.scanType && (
                  <p className="mt-4 text-xl font-semibold uppercase tracking-wide">
                    {String(feedback.scanType).replaceAll("_", " ")}
                  </p>
                )}
              </div>
            )}

            {feedback?.kind === "error" && (
              <div className="w-full max-w-3xl rounded-3xl bg-red-700 px-8 py-12 text-center shadow-2xl">
                <p className="text-5xl font-black md:text-7xl">🛑 SCAN REJECTED</p>
                <p className="mt-6 text-2xl font-bold tracking-wide">{feedback.message}</p>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  )
}
