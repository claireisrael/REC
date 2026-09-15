import { NextResponse } from "next/server"
import { getActiveScannerAllocation } from "@/lib/appwrite/rec-scanners"
import {
  getRecScanTallyForScanner,
  getScannerContextFromBearer,
  resolveConferenceIdForTeraScan,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"
import { HID_SCAN_CODES } from "@/lib/rec-conference/scanning-rules.mjs"

export const runtime = "nodejs"

// PII-free aggregate counts for the scan station itself: how many people are
// registered vs. already signed in, per scan event. No registrant list, no
// scan log. Auth mirrors the other scanner-facing endpoints (Tera device
// serial or a scanner bearer session).
export async function GET(request) {
  try {
    const serialNumber = new URL(request.url).searchParams.get("serialNumber") || ""

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

    const data = await getRecScanTallyForScanner(conferenceId)
    return NextResponse.json(data)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load the scan tally")
  }
}
