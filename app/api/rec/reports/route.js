import { NextResponse } from "next/server"
import { MODULES, requireModuleAction } from "@/lib/auth/server-auth"
import { createRecReport, listRecReports } from "@/lib/rec-conference/reports-server"
import { readRecReportJson, recReportErrorResponse } from "@/lib/rec-conference/reports-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await listRecReports({
      conferenceId: searchParams.get("conferenceId") || "",
      reportType: searchParams.get("type") || "",
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 12,
    }))
  } catch (error) {
    return recReportErrorResponse(error, "Failed to load REC reports")
  }
}

export async function POST(request) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    const input = await readRecReportJson(request)
    const report = await createRecReport(input, auth.session.userId)
    return NextResponse.json({ report }, { status: 201 })
  } catch (error) {
    return recReportErrorResponse(error, "Failed to create REC report")
  }
}
