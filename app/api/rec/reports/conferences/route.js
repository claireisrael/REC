import { NextResponse } from "next/server"
import { MODULES, requireModuleAction } from "@/lib/auth/server-auth"
import { listRecReportConferences } from "@/lib/rec-conference/reports-server"
import { recReportErrorResponse } from "@/lib/rec-conference/reports-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    return NextResponse.json(await listRecReportConferences())
  } catch (error) {
    return recReportErrorResponse(error, "Failed to load completed REC conferences")
  }
}
