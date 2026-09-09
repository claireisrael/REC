import { NextResponse } from "next/server"
import { getRecScanAnalytics } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await getRecScanAnalytics({
      conferenceId: searchParams.get("conferenceId") || "",
      eventId: searchParams.get("eventId") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
    }))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load REC scan analytics")
  }
}

