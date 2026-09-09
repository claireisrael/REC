import { NextResponse } from "next/server"
import { MODULES, requireModuleAction } from "@/lib/auth/server-auth"
import { deleteRecReport, updateRecReport } from "@/lib/rec-conference/reports-server"
import { readRecReportJson, recReportErrorResponse } from "@/lib/rec-conference/reports-route"

export const runtime = "nodejs"

export async function PATCH(request, { params }) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    const { reportId } = await params
    const input = await readRecReportJson(request)
    const report = await updateRecReport(reportId, input, auth.session.userId)
    return NextResponse.json({ report })
  } catch (error) {
    return recReportErrorResponse(error, "Failed to update REC report")
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    const { reportId } = await params
    return NextResponse.json(await deleteRecReport(reportId))
  } catch (error) {
    return recReportErrorResponse(error, "Failed to delete REC report")
  }
}
