"use client"

// Client-only helpers for the phone/OTP scanner operator session. Never
// import this from server code - it touches window/localStorage directly.

const TOKEN_KEY = "rec.scanner.token"

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

export async function scannerFetch(path, options = {}) {
  const token = getScannerToken()
  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(path, { ...options, headers, cache: "no-store" })
}
