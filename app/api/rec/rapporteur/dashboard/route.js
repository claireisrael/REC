import { NextResponse } from "next/server"
import { forbiddenResponse } from "@/lib/auth/server-auth"
import { previewRapporteurDashboard } from "@/lib/rec-conference/rapporteur-server"
import {
  rapporteurErrorResponse,
  requireRapporteurReviewer,
  reviewerActor,
} from "@/lib/rec-conference/rapporteur-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return auth.response
  if (!reviewerActor(auth).canAssign) {
    return forbiddenResponse("Only a senior administrator can open a rapporteur dashboard.")
  }
  try {
    const assignmentId = new URL(request.url).searchParams.get("assignmentId") || ""
    return NextResponse.json(await previewRapporteurDashboard(assignmentId))
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to open the rapporteur dashboard")
  }
}
