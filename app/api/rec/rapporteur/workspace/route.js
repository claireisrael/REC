import { NextResponse } from "next/server"
import { forbiddenResponse } from "@/lib/auth/server-auth"
import { listRecScanningConferences } from "@/lib/rec-conference/scanning-server"
import { isRapporteurApprover, loadRapporteurWorkspace } from "@/lib/rec-conference/rapporteur-server"
import {
  rapporteurErrorResponse,
  requireRapporteurReviewer,
  reviewerActor,
} from "@/lib/rec-conference/rapporteur-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return auth.response
  const actor = reviewerActor(auth)
  try {
    if (!actor.canAssign && !(await isRapporteurApprover(actor.email))) {
      return forbiddenResponse("You do not have access to rapporteur reports.")
    }
    const conferenceId = new URL(request.url).searchParams.get("conferenceId") || ""
    if (!conferenceId) {
      const conferences = await listRecScanningConferences()
      return NextResponse.json({ conferences: conferences.documents || [], canAssign: actor.canAssign })
    }
    const workspace = await loadRapporteurWorkspace(conferenceId, {
      canAssign: actor.canAssign,
      reviewerEmail: actor.email,
    })
    return NextResponse.json(workspace)
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to load rapporteur reports")
  }
}
