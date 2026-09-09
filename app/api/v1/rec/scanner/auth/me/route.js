import { NextResponse } from "next/server"
import {
  getRecScanningConference,
  getScannerContextFromBearer,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  try {
    const context = await getScannerContextFromBearer(request)
    if (!context) return NextResponse.json({ error: "Scanner authentication is required" }, { status: 401 })
    const conference = await getRecScanningConference(context.conferenceId)
    return NextResponse.json({
      operator: context.operator,
      conference: {
        $id: conference.$id,
        year: conference.year,
        title: conference.title,
        shortName: conference.shortName,
        days: Array.isArray(conference.days) ? conference.days : [],
      },
      expiresAt: context.session.expiresAt,
    })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load scanner profile")
  }
}

