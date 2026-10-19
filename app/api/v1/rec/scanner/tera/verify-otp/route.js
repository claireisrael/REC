import { NextResponse } from "next/server"
import { openTeraStationForOperator } from "@/lib/appwrite/rec-scanners"
import { verifyTeraStationOtp } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"
import { HID_SCAN_CODES } from "@/lib/rec-conference/scanning-rules.mjs"

export const runtime = "nodejs"

// Step 2: checks the emailed code and opens the station for that operator.
// The response matches the serial-only handshake, plus the operator's name.
export async function POST(request) {
  try {
    const data = await request.json().catch(() => ({}))
    const { operator } = await verifyTeraStationOtp(data)
    const station = await openTeraStationForOperator({
      serialNumber: data.serialNumber,
      stationOperator: operator,
      request,
    })
    if (!station?.allocation) {
      return NextResponse.json(
        { error: HID_SCAN_CODES.DEVICE_UNREGISTERED, code: HID_SCAN_CODES.DEVICE_UNREGISTERED },
        { status: 403 }
      )
    }
    return NextResponse.json({
      ok: true,
      allocation: station.allocation,
      events: station.events,
      openEvents: station.openEvents,
      stationNotice: station.stationNotice || "",
      stationOperator: station.stationOperator,
      station: station.session,
    })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to verify the station access code")
  }
}
