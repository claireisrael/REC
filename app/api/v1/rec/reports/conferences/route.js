import { NextResponse } from "next/server"
import { listRecReportConferences } from "@/lib/rec-conference/reports-server"
import { recReportErrorResponse } from "@/lib/rec-conference/reports-route"

export const runtime = "nodejs"

export async function GET() {
  try {
    const result = await listRecReportConferences({ publicOnly: true })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    })
  } catch (error) {
    return recReportErrorResponse(error, "Failed to load REC report conferences")
  }
}
