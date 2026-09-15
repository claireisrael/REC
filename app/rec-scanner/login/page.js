"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { setScannerToken } from "@/lib/rec-conference/scanner-session-client"
import "./rec-scanner-auth.css"

export default function RecScannerLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState("email")
  const [email, setEmail] = useState("")
  const [conferences, setConferences] = useState([])
  const [conferenceId, setConferenceId] = useState("")
  const [otpId, setOtpId] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [devOtpCode, setDevOtpCode] = useState("")

  const sendCode = async (selectedConferenceId) => {
    setError("")
    setLoading(true)
    try {
      const response = await fetch("/api/v1/rec/scanner/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ email, conferenceId: selectedConferenceId }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Could not send an access code.")
      setConferenceId(selectedConferenceId)
      setOtpId(payload.otpId)
      // Only ever set when the server could not email the code (no email API
      // configured in this environment) and is not running in production.
      setDevOtpCode(payload.devOtpCode || "")
      if (payload.devOtpCode) setCode(payload.devOtpCode)
      setStep("otp")
    } catch (err) {
      setError(err.message || "Could not send an access code.")
    } finally {
      setLoading(false)
    }
  }

  const lookupConferences = async (event) => {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      const response = await fetch(
        `/api/v1/rec/scanner/auth/request-otp?email=${encodeURIComponent(email)}`,
        { cache: "no-store" }
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "Could not look up scanner access.")
      const eligible = payload.conferences || []
      if (!eligible.length) {
        throw new Error("This email is not set up for scanner access on any conference.")
      }
      setConferences(eligible)
      if (eligible.length === 1) {
        await sendCode(eligible[0].$id)
      } else {
        setLoading(false)
        setStep("conference")
      }
    } catch (err) {
      setError(err.message || "Could not look up scanner access.")
      setLoading(false)
    }
  }

  const chooseConference = (event) => {
    event.preventDefault()
    if (!conferenceId) {
      setError("Choose a conference.")
      return
    }
    sendCode(conferenceId)
  }

  const verifyCode = async (event) => {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      const response = await fetch("/api/v1/rec/scanner/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          email,
          conferenceId,
          otpId,
          code,
          deviceLabel: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || "That code did not work.")
      setScannerToken(payload.token)
      router.push("/rec-scanner/me")
    } catch (err) {
      setError(err.message || "That code did not work.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rec-scanner-auth">
      <div className="rec-scanner-auth-card">
        <p className="rec-scanner-auth-kicker">REC Scanner</p>
        <h1>Sign in</h1>

        {error && <div className="rec-scanner-auth-error">{error}</div>}

        {step === "email" && (
          <form onSubmit={lookupConferences}>
            <label htmlFor="scanner-email">Email address</label>
            <input
              id="scanner-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button type="submit" disabled={loading || !email}>
              {loading ? "Checking…" : "Continue"}
            </button>
          </form>
        )}

        {step === "conference" && (
          <form onSubmit={chooseConference}>
            <p className="rec-scanner-auth-hint">You have scanner access on more than one conference.</p>
            <label htmlFor="scanner-conference">Conference</label>
            <select
              id="scanner-conference"
              required
              value={conferenceId}
              onChange={(event) => setConferenceId(event.target.value)}
            >
              <option value="">Select a conference</option>
              {conferences.map((conference) => (
                <option key={conference.$id} value={conference.$id}>
                  {conference.title || conference.shortName}
                </option>
              ))}
            </select>
            <button type="submit" disabled={loading || !conferenceId}>
              {loading ? "Sending…" : "Send access code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyCode}>
            {devOtpCode ? (
              <div className="rec-scanner-auth-dev-otp">
                <strong>TEST MODE - no email is configured here</strong>
                <p>Your access code is <code>{devOtpCode}</code> (pre-filled below).</p>
              </div>
            ) : (
              <p className="rec-scanner-auth-hint">We emailed a 6-digit code to {email}.</p>
            )}
            <label htmlFor="scanner-code">Access code</label>
            <input
              id="scanner-code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
            <button type="submit" disabled={loading || code.length !== 6}>
              {loading ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              className="rec-scanner-auth-link"
              onClick={() => setStep(conferences.length > 1 ? "conference" : "email")}
            >
              Use a different email or conference
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
