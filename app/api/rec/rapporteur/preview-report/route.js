import { NextResponse } from "next/server"
import { forbiddenResponse } from "@/lib/auth/server-auth"
import {
  addRapporteurComment,
  listRapporteurComments,
  openRapporteurReport,
  rapporteurContextForAssignment,
  saveRapporteurReport,
  submitRapporteurReport,
} from "@/lib/rec-conference/rapporteur-server"
import {
  rapporteurErrorResponse,
  requireRapporteurReviewer,
  reviewerActor,
} from "@/lib/rec-conference/rapporteur-route"

export const runtime = "nodejs"

async function authorize(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return auth
  if (!reviewerActor(auth).canAssign) {
    return { ok: false, response: forbiddenResponse("Only a senior administrator can open a rapporteur dashboard.") }
  }
  return auth
}

export async function GET(request) {
  const auth = await authorize(request)
  if (!auth.ok) return auth.response
  try {
    const url = new URL(request.url)
    const context = await rapporteurContextForAssignment(url.searchParams.get("assignmentId"))
    const sessionKey = url.searchParams.get("sessionKey") || ""
    if (url.searchParams.get("commentsOnly") === "1") {
      return NextResponse.json(await listRapporteurComments(context, sessionKey), { headers: { "Cache-Control": "no-store" } })
    }
    const report = await openRapporteurReport(context, sessionKey)
    const { comments } = await listRapporteurComments(context, sessionKey)
    return NextResponse.json({ report, comments }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to open the session")
  }
}

export async function PUT(request) {
  const auth = await authorize(request)
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const context = await rapporteurContextForAssignment(body.assignmentId)
    return NextResponse.json(await saveRapporteurReport(context, body), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to save the report")
  }
}

export async function POST(request) {
  const auth = await authorize(request)
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const context = await rapporteurContextForAssignment(body.assignmentId)
    const result = body.action === "comment"
      ? await addRapporteurComment(context, body)
      : await submitRapporteurReport(context, body.sessionKey)
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to update the report")
  }
}
