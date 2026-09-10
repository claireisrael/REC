import { NextResponse } from "next/server"
import { listRecScanAnalyticsRegistrants } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await listRecScanAnalyticsRegistrants({
      conferenceId: searchParams.get("conferenceId") || "",
      eventId: searchParams.get("eventId") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
      search: searchParams.get("search") || "",
      attendance: searchParams.get("attendance") || "all",
      registrationType: searchParams.get("registrationType") || "",
      participantCategory: searchParams.get("participantCategory") || "",
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "25",
    }))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load registrant attendance analytics")
  }
}
