import { NextResponse } from "next/server"
import { requestTeraStationOtp } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

// Step 1 of unlocking a Tera station: emails a code to the operator, but
// only if they are assigned to this unit.
export async function POST(request) {
  try {
    const data = await request.json().catch(() => ({}))
    return NextResponse.json(await requestTeraStationOtp(data, request))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to send the station access code")
  }
}
