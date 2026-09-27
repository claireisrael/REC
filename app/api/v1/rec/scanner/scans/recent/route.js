import { NextResponse } from "next/server"
import { getTeraStationContextFromToken, listRecentTeraStationScans } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  try {
    const context = await getTeraStationContextFromToken(request)
    if (!context) {
      return NextResponse.json({ error: "Tera station authentication is required" }, { status: 401 })
    }

    const data = await listRecentTeraStationScans({
      conferenceId: context.conferenceId,
      serialNumber: context.serialNumber,
    })
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load recent station scans")
  }
}
