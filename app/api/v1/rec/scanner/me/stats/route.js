import { NextResponse } from "next/server"
import { getScannerContextFromBearer, getScannerOwnStats } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

// A signed-in scanner operator's own scan counts and rank for their
// conference. Bearer-session only — this is "see your own place", scoped to
// whoever is currently signed in, not a public leaderboard endpoint.
export async function GET(request) {
  try {
    const context = await getScannerContextFromBearer(request)
    if (!context) {
      return NextResponse.json({ error: "Scanner authentication is required" }, { status: 401 })
    }
    const stats = await getScannerOwnStats(context)
    return NextResponse.json(stats)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load your scan stats")
  }
}
