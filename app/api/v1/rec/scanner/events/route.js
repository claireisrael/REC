import { NextResponse } from "next/server"
import {
  getScannerContextFromBearer,
  listRecScanEvents,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  try {
    const context = await getScannerContextFromBearer(request)
    if (!context) return NextResponse.json({ error: "Scanner authentication is required" }, { status: 401 })
    const events = await listRecScanEvents({ conferenceId: context.conferenceId, activeOnly: true })
    const operator = context.operator
    const filtered = events.documents.filter((event) => {
      if (operator.allowedEventIds.length && !operator.allowedEventIds.includes(event.$id)) return false
      if (operator.allowedEventTypes.length && !operator.allowedEventTypes.includes(event.type)) return false
      if (operator.allowedVenues.length && event.venue && !operator.allowedVenues.includes(event.venue)) return false
      if (operator.allowedDays.length && event.day && !operator.allowedDays.includes(String(event.day))) return false
      return true
    })
    return NextResponse.json({ documents: filtered, total: filtered.length })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load scanner events")
  }
}

