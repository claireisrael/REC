import { NextResponse } from "next/server"
import { listRecReports } from "@/lib/rec-conference/reports-server"
import { recReportErrorResponse } from "@/lib/rec-conference/reports-route"

export const runtime = "nodejs"

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const result = await listRecReports({
      conferenceId: searchParams.get("conferenceId") || "",
      reportType: searchParams.get("type") || "",
      publicOnly: true,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 12,
    })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    })
  } catch (error) {
    return recReportErrorResponse(error, "Failed to load public REC reports")
  }
}
