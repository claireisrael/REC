import { NextResponse } from "next/server"
import { badgeRenderOptions, renderBadge } from "./badge-renderer.mjs"
import { recScanningErrorResponse } from "./scanning-route"

export function printHeaders(format, filename, attachment = true) {
  return {
    "Content-Type": format === "pdf" ? "application/pdf" : "image/png",
    "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, noarchive",
  }
}

export async function badgePrintResponse(badge, query) {
  const options = badgeRenderOptions(Object.fromEntries(query))
  const bytes = await renderBadge(badge, options)
  const label = badge.badge?.badgeNumberLabel || badge.badge?.badgeNumber || "REC-badge"
  return new Response(bytes, {
    headers: printHeaders(
      options.format,
      `${label}${options.bleed ? "-3mm-bleed" : ""}.${options.format}`,
      query.get("download") === "1",
    ),
  })
}

export function badgePrintErrorResponse(error, fallbackMessage) {
  if (error?.code === "badge_error" && error.status) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    )
  }
  return recScanningErrorResponse(error, fallbackMessage)
}
