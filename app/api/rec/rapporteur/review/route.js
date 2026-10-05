import { NextResponse } from "next/server"
import {
  approveRapporteurReport,
  commentOnReport,
  openReportForReview,
  returnRapporteurReport,
} from "@/lib/rec-conference/rapporteur-server"
import {
  rapporteurErrorResponse,
  requireRapporteurReviewer,
  reviewerActor,
} from "@/lib/rec-conference/rapporteur-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return auth.response
  try {
    const reportId = new URL(request.url).searchParams.get("reportId") || ""
    const detail = await openReportForReview(reportId, reviewerActor(auth))
    return NextResponse.json(detail)
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to open report")
  }
}

export async function POST(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const actor = reviewerActor(auth)
    const reportId = body.reportId || ""
    if (body.action === "approve") return NextResponse.json(await approveRapporteurReport(reportId, actor))
    if (body.action === "return") return NextResponse.json(await returnRapporteurReport(reportId, actor, body.message))
    if (body.action === "comment") return NextResponse.json(await commentOnReport(reportId, actor, body.message))
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to update report")
  }
}
