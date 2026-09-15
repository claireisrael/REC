import { NextResponse } from "next/server"
import { getActiveScannerAllocation } from "@/lib/appwrite/rec-scanners"
import {
  getScannerContextFromBearer,
  listRecentRecScanAlerts,
  resolveConferenceIdForTeraScan,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"
import { HID_SCAN_CODES } from "@/lib/rec-conference/scanning-rules.mjs"

export const runtime = "nodejs"

// Read-only, PII-free feed of recent "badge already used" events for this
// conference, so any scan station (Tera hardware or phone/OTP) can pop up a
// warning when a duplicate is caught anywhere, not just at the station that
// caught it. Auth mirrors POST /scanner/scans: either a Tera device serial
// or a scanner bearer session.
export async function GET(request) {
  try {
    const url = new URL(request.url)
    const serialNumber = url.searchParams.get("serialNumber") || ""
    const since = url.searchParams.get("since") || ""
    const limit = url.searchParams.get("limit") || ""

    let conferenceId = ""

    if (serialNumber) {
      const allocation = await getActiveScannerAllocation(serialNumber)
      if (!allocation) {
        return NextResponse.json(
          { error: HID_SCAN_CODES.DEVICE_UNREGISTERED, code: HID_SCAN_CODES.DEVICE_UNREGISTERED },
          { status: 403 }
        )
      }
      conferenceId = await resolveConferenceIdForTeraScan("")
    } else {
      const context = await getScannerContextFromBearer(request)
      if (!context) {
        return NextResponse.json({ error: "Scanner authentication is required" }, { status: 401 })
      }
      conferenceId = context.conferenceId
    }

    const data = await listRecentRecScanAlerts({ conferenceId, sinceIso: since, limit })
    return NextResponse.json(data)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load scan alerts")
  }
}
