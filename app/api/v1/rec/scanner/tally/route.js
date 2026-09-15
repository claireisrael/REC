import { NextResponse } from "next/server"
import { getRecScanTallyForScanner } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireAnyScannerContext } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

// PII-free aggregate counts for the scan station itself: how many people are
// registered vs. already signed in, per scan event. No registrant list, no
// scan log. Requires the same session token as any other scanner request - a
// Tera station's own session (issued at handshake) or an operator's bearer
// session.
export async function GET(request) {
  try {
    const context = await requireAnyScannerContext(request)
    const data = await getRecScanTallyForScanner(context.conferenceId)
    return NextResponse.json(data)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load the scan tally")
  }
}
