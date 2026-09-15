"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { clearScannerToken, getScannerToken, scannerFetch } from "@/lib/rec-conference/scanner-session-client"
import "../login/rec-scanner-auth.css"

export default function RecScannerMePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState(null)

  const load = useCallback(async () => {
    if (!getScannerToken()) {
      router.replace("/rec-scanner/login")
      return
    }
    setLoading(true)
    try {
      const [meResponse, statsResponse] = await Promise.all([
        scannerFetch("/api/v1/rec/scanner/auth/me"),
        scannerFetch("/api/v1/rec/scanner/me/stats"),
      ])
      const mePayload = await meResponse.json().catch(() => ({}))
      const statsPayload = await statsResponse.json().catch(() => ({}))
      if (!meResponse.ok) throw new Error(mePayload.error || "Your session has expired.")
      if (!statsResponse.ok) throw new Error(statsPayload.error || "Could not load your stats.")
      setProfile(mePayload)
      setStats(statsPayload)
      setError("")
    } catch (err) {
      clearScannerToken()
      setError(err.message || "Your session has expired.")
      window.setTimeout(() => router.replace("/rec-scanner/login"), 1800)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [load])

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
        <p className="rec-scanner-auth-status">{error}</p>
      </div>
    )
  }

  const mine = stats?.mine || {}

  return (
    <div className="rec-scanner-auth">
      <div className="rec-scanner-auth-card rec-scanner-auth-card-wide">
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

        <button type="button" className="rec-scanner-auth-signout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
