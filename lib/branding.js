/**
 * Shared branding URLs (browser-safe — NEXT_PUBLIC only).
 */

export function getNrepLogoUrl() {
  return String(process.env.NEXT_PUBLIC_NREP_LOGO_URL || "").trim()
}
