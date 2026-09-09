import { NextResponse } from "next/server"
import { getFeaturedPreviousRecReport } from "@/lib/rec-conference/reports-server"
import { recReportErrorResponse } from "@/lib/rec-conference/reports-route"

export const runtime = "nodejs"

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const result = await getFeaturedPreviousRecReport({
      conferenceId: searchParams.get("conferenceId") || "",
    })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    })
  } catch (error) {
    return recReportErrorResponse(error, "Failed to load previous conference report")
  }
}
