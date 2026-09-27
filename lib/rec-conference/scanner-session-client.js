"use client"

// Client-only helpers for the phone/OTP scanner operator session. Never
// import this from server code - it touches window/localStorage directly.

const TOKEN_KEY = "rec.scanner.token"
const JUST_SIGNED_IN_KEY = "rec.scanner.justSignedIn"

export function getScannerToken() {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(TOKEN_KEY) || ""
  } catch {
    return ""
  }
}

export function setScannerToken(token) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Ignore storage failures (private browsing, quota, etc.).
  }
}

export function clearScannerToken() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore.
  }
}

// A one-shot flag so /rec-scanner/me can show a "you're signed in" welcome
// the moment it first loads after sign-in, without showing it again on
// every later refresh/poll.
export function markJustSignedIn() {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(JUST_SIGNED_IN_KEY, "1")
  } catch {
    // Ignore.
  }
}

export function consumeJustSignedIn() {
  if (typeof window === "undefined") return false
  try {
    const value = window.sessionStorage.getItem(JUST_SIGNED_IN_KEY)
    window.sessionStorage.removeItem(JUST_SIGNED_IN_KEY)
    return value === "1"
  } catch {
    return false
  }
}

export async function scannerFetch(path, options = {}) {
  const token = getScannerToken()
  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(path, { ...options, headers, cache: "no-store" })
}
