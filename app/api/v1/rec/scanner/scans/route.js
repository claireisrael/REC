import { NextResponse } from "next/server"
import { HidScanError, getTeraStationHandshake, processHidScannerCapture } from "@/lib/appwrite/rec-scanners"
import {
  getScannerContextFromBearer,
  getTeraStationContextFromToken,
  RecScanningError,
  recordRecScan,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"
import { HID_SCAN_CODES, normalizeHidSerial } from "@/lib/rec-conference/scanning-rules.mjs"

export const runtime = "nodejs"

function hidErrorResponse(error) {
  if (error instanceof HidScanError) {
    return NextResponse.json({ error: error.code, code: error.code }, { status: error.status })
  }
  console.error("HID scanner capture failed", error)
  return NextResponse.json({ error: "SCAN_PROCESSING_FAILED" }, { status: 500 })
}

export async function GET(request) {
  try {
    const serialNumber = new URL(request.url).searchParams.get("serialNumber") || ""
    if (!serialNumber) {
      return NextResponse.json({ error: HID_SCAN_CODES.MISSING_SERIAL, code: HID_SCAN_CODES.MISSING_SERIAL }, { status: 422 })
    }

    const handshake = await getTeraStationHandshake(serialNumber, request)
    if (!handshake?.allocation) {
      return NextResponse.json(
        { error: HID_SCAN_CODES.DEVICE_UNREGISTERED, code: HID_SCAN_CODES.DEVICE_UNREGISTERED },
        { status: 403 }
      )
    }

    return NextResponse.json({
      ok: true,
      allocation: handshake.allocation,
      events: handshake.events,
      openEvents: handshake.openEvents,
      // The station must send this back as `Authorization: Bearer <token>`
      // on every following request (scans, alerts, tally). The serial number
      // alone is not a credential - it's printed on the hardware.
      station: handshake.session,
    })
  } catch (error) {
    if (error instanceof RecScanningError) return recScanningErrorResponse(error, "Failed to unlock Tera station")
    return hidErrorResponse(error)
  }
}

export async function POST(request) {
  try {
    const data = await request.json().catch(() => ({}))
    const isHidCapture = Boolean(data?.serialNumber)

    if (isHidCapture) {
      const stationContext = await getTeraStationContextFromToken(request)
      if (!stationContext) {
        return NextResponse.json(
          { error: "Scanner session has expired. Unlock the station again.", code: "scanner_session_expired" },
          { status: 401 }
        )
      }
      if (stationContext.serialNumber !== normalizeHidSerial(data.serialNumber)) {
        return NextResponse.json(
          { error: HID_SCAN_CODES.DEVICE_UNREGISTERED, code: HID_SCAN_CODES.DEVICE_UNREGISTERED },
          { status: 403 }
        )
      }

      const result = await processHidScannerCapture({
        serialNumber: stationContext.serialNumber,
        qrData: data.qrData || data.qrPayload,
      })
      const status = result.status === "duplicate" ? 200 : 201
      return NextResponse.json(result, { status })
    }

    const context = await getScannerContextFromBearer(request)
    if (!context) {
      return NextResponse.json({ error: "Scanner authentication is required" }, { status: 401 })
    }
    const result = await recordRecScan(data, context)
    const status = result.status === "duplicate" ? 200 : 201
    return NextResponse.json(result, { status })
  } catch (error) {
    if (error instanceof HidScanError) return hidErrorResponse(error)
    return recScanningErrorResponse(error, "Failed to record scan")
  }
}
