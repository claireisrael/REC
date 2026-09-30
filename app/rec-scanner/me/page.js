"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  clearScannerToken,
  consumeJustSignedIn,
  getScannerToken,
  scannerFetch,
} from "@/lib/rec-conference/scanner-session-client"
import "../login/rec-scanner-auth.css"

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
  gain.gain.setValueAtTime(0.16, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + durationMs / 1000)
  oscillator.start()
  oscillator.stop(context.currentTime + durationMs / 1000)
  oscillator.onended = () => context.close().catch(() => {})
}

function playWelcomeChime() {
  playTone(880, 120, "sine")
  window.setTimeout(() => playTone(1175, 140, "sine"), 130)
}

function playCrossAlertChime() {
  playTone(660, 160, "triangle")
  window.setTimeout(() => playTone(990, 160, "triangle"), 180)
}

function formatAlertLocation(alert) {
  return alert?.eventName || alert?.venue || "another scan point"
}

function formatAlertTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" })
}

function formatScanTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" })
}

function scanStatusLabel(status) {
  if (status === "accepted") return "Accepted"
  if (status === "duplicate") return "Duplicate"
  if (status === "rejected") return "Rejected"
  return status || "Unknown"
}

export default function RecScannerMePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState(null)
  const [welcome, setWelcome] = useState(false)
  const [crossStationAlert, setCrossStationAlert] = useState(null)

  const alertQueueRef = useRef([])
  const alertSeenRef = useRef(new Set())
  const alertSinceRef = useRef(new Date().toISOString())
  const alertTimerRef = useRef(null)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    const token = getScannerToken()
    if (!token) {
      router.replace("/rec-scanner/login")
      return
    }
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      const [meResult, statsResult] = await Promise.allSettled([
        scannerFetch("/api/v1/rec/scanner/auth/me", { signal: controller.signal }),
        scannerFetch("/api/v1/rec/scanner/me/stats", { signal: controller.signal }),
      ])
      if (getScannerToken() !== token) return
      const meResponse = meResult.status === "fulfilled" ? meResult.value : null
      const statsResponse = statsResult.status === "fulfilled" ? statsResult.value : null
      if ([meResponse, statsResponse].some((response) => response?.status === 401 || response?.status === 403)) {
        clearScannerToken()
        setProfile(null)
        setStats(null)
        setError("Your scanner session has expired. Please sign in again.")
        router.replace("/rec-scanner/login")
        return
      }
      if (!meResponse?.ok || !statsResponse?.ok) {
        const failedResponse = !meResponse?.ok ? meResponse : statsResponse
        const payload = await failedResponse?.json().catch(() => ({}))
        throw new Error(payload?.error || "Could not refresh scanner information. Please retry.")
      }
      const [mePayload, statsPayload] = await Promise.all([
        meResponse.json(),
        statsResponse.json(),
      ])
      if (getScannerToken() !== token) return
      setProfile(mePayload)
      setStats(statsPayload)
      setError("")
    } catch (err) {
      if (getScannerToken() === token) {
        setError(err.message || "Could not refresh scanner information. Please retry.")
      }
    } finally {
      window.clearTimeout(timeout)
      loadingRef.current = false
      setLoading(false)
    }
  }, [router])

  // Shows the "you're signed in" toast exactly once, right after arriving
  // here from a successful sign-in - not on every later refresh.
  useEffect(() => {
    if (consumeJustSignedIn()) {
      setWelcome(true)
      playWelcomeChime()
      const timer = window.setTimeout(() => setWelcome(false), 4000)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 12000)
    return () => window.clearInterval(timer)
  }, [load])

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
    if (!getScannerToken()) return
    try {
      const response = await scannerFetch(`/api/v1/rec/scanner/alerts?since=${encodeURIComponent(alertSinceRef.current)}`)
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
  }, [enqueueCrossStationAlerts])

  useEffect(() => {
    pollCrossStationAlerts()
    const timer = window.setInterval(pollCrossStationAlerts, 6000)
    return () => window.clearInterval(timer)
  }, [pollCrossStationAlerts])

  const signOut = async () => {
    await scannerFetch("/api/v1/rec/scanner/auth/logout", { method: "POST" }).catch(() => {})
    clearScannerToken()
    router.replace("/rec-scanner/login")
  }

  if (loading && !profile) {
    return (
      <div className="rec-scanner-auth">
        <p className="rec-scanner-auth-status">Loading your scanner profile…</p>
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="rec-scanner-auth">
        <div className="rec-scanner-auth-status" role="alert">
          <p>{error}</p>
          <button type="button" className="rec-scanner-auth-link" onClick={load} disabled={loading}>
            {loading ? "Retrying..." : "Retry"}
          </button>
        </div>
      </div>
    )
  }

  const mine = stats?.mine || {}

  return (
    <div className="rec-scanner-auth">
      {welcome && (
        <div className="rec-scanner-welcome-toast" role="status">
          Signed in as {profile?.operator?.name || "scanner"} ✓
        </div>
      )}

      {crossStationAlert && (
        <div className="rec-scanner-cross-alert" role="alert">
          <strong>⚠ Badge re-scanned elsewhere</strong>
          <p>
            Already used at {formatAlertLocation(crossStationAlert)}
            {crossStationAlert.scannedAt ? ` · ${formatAlertTime(crossStationAlert.scannedAt)}` : ""}
          </p>
        </div>
      )}

      <div className="rec-scanner-auth-card rec-scanner-auth-card-wide">
        {error && (
          <div className="rec-scanner-auth-error" role="status">
            {error} Last successful information is shown. <button type="button" className="rec-scanner-auth-link" onClick={load} disabled={loading}>{loading ? "Retrying..." : "Retry"}</button>
          </div>
        )}
        <Link href="/" className="rec-scanner-auth-back">← Home</Link>
        <p className="rec-scanner-auth-kicker">
          {profile?.conference?.title || profile?.conference?.shortName || "REC Scanner"}
        </p>
        <h1>{profile?.operator?.name || "Scanner"}</h1>
        <p className="rec-scanner-auth-hint">{profile?.operator?.email}</p>

        <div className="rec-scanner-me-stats">
          <div>
            <strong>{mine.accepted ?? 0}</strong>
            <span>Accepted scans</span>
          </div>
          <div>
            <strong>{mine.uniqueRegistrants ?? 0}</strong>
            <span>People signed in</span>
          </div>
          <div>
            <strong>{mine.acceptanceRate ?? 0}%</strong>
            <span>Acceptance rate</span>
          </div>
        </div>

        <p className="rec-scanner-me-rank">
          {stats?.rank
            ? `You're ranked #${stats.rank} of ${stats.totalScanners} scanner${stats.totalScanners === 1 ? "" : "s"} today.`
            : "You haven't recorded a scan yet."}
        </p>

        <div className="rec-scanner-me-scans">
          <div className="rec-scanner-me-scans-head">
            <h2>Scanner performance</h2>
            <span>{stats?.leaderboard?.length || 0} active</span>
          </div>
          <div className="rec-scanner-me-scans-table-wrap">
            <table className="rec-scanner-me-scans-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Scanner</th>
                  <th>Accepted</th>
                  <th>Rejected</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {stats?.leaderboard?.length ? (
                  stats.leaderboard.map((scanner, index) => (
                    <tr
                      key={scanner.key}
                      className={scanner.key === mine.key ? "rec-scanner-me-scans-mine" : ""}
                    >
                      <td>{index + 1}</td>
                      <td>
                        {scanner.name}
                        {scanner.key === mine.key && <small>You</small>}
                      </td>
                      <td>{scanner.accepted}</td>
                      <td>{scanner.rejected}</td>
                      <td>{scanner.acceptanceRate}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="rec-scanner-me-scans-empty">
                      No scans recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rec-scanner-me-scans">
          <div className="rec-scanner-me-scans-head">
            <h2>Recent conference scans</h2>
            <span>{stats?.recentConferenceScans?.length || 0} latest</span>
          </div>
          <div className="rec-scanner-me-scans-table-wrap">
            <table className="rec-scanner-me-scans-table rec-scanner-me-conference-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Registrant</th>
                  <th>Event</th>
                  <th>Scanner</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentConferenceScans?.length ? (
                  stats.recentConferenceScans.map((scan) => (
                    <tr key={scan.scanId}>
                      <td>{formatScanTime(scan.scannedAt)}</td>
                      <td>{scan.registrantName || "—"}</td>
                      <td>{scan.eventName || "—"}</td>
                      <td>
                        {scan.scannerName || "Unknown scanner"}
                        {scan.deviceLabel && scan.deviceLabel !== scan.scannerName && <small>{scan.deviceLabel}</small>}
                      </td>
                      <td>
                        <span className={`rec-scanner-me-scan-pill rec-scanner-me-scan-pill-${scan.status}`}>
                          {scanStatusLabel(scan.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="rec-scanner-me-scans-empty">
                      No scans recorded for this conference yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rec-scanner-me-scans">
          <div className="rec-scanner-me-scans-head">
            <h2>Your scans so far</h2>
            <span>{stats?.recentScans?.length || 0} shown</span>
          </div>
          <div className="rec-scanner-me-scans-table-wrap">
            <table className="rec-scanner-me-scans-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Time</th>
                  <th>Registrant</th>
                  <th>Event</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentScans?.length ? (
                  stats.recentScans.map((scan, index) => (
                    <tr key={scan.scanId}>
                      <td>{index + 1}</td>
                      <td>{formatScanTime(scan.scannedAt)}</td>
                      <td>
                        {scan.registrantName || "—"}
                        {scan.organization && <small>{scan.organization}</small>}
                      </td>
                      <td>{scan.eventName || "—"}</td>
                      <td>
                        <span className={`rec-scanner-me-scan-pill rec-scanner-me-scan-pill-${scan.status}`}>
                          {scanStatusLabel(scan.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="rec-scanner-me-scans-empty">
                      No scans recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <button type="button" className="rec-scanner-auth-signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
