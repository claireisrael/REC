import { NextResponse } from "next/server"
import { listRecentRecScanAlerts } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireAnyScannerContext } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

// Read-only, PII-free feed of recent "badge already used" events for this
// conference, so any scan station (Tera hardware or phone/OTP) can pop up a
// warning when a duplicate is caught anywhere, not just at the station that
// caught it. Requires the same session token as any other scanner request -
// a Tera station's own session (issued at handshake) or an operator's bearer
// session.
export async function GET(request) {
  try {
    const url = new URL(request.url)
    const since = url.searchParams.get("since") || ""
    const limit = url.searchParams.get("limit") || ""

    const context = await requireAnyScannerContext(request)
    const data = await listRecentRecScanAlerts({ conferenceId: context.conferenceId, sinceIso: since, limit })
    return NextResponse.json(data)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load scan alerts")
  }
}
