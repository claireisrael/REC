import { NextResponse } from "next/server"
import { listRecScanAnalyticsLog } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await listRecScanAnalyticsLog({
      conferenceId: searchParams.get("conferenceId") || "",
      eventId: searchParams.get("eventId") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
      search: searchParams.get("search") || "",
      status: searchParams.get("status") || "",
      scanner: searchParams.get("scanner") || "",
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "25",
    }))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load REC scan log")
  }
}
