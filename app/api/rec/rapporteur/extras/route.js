import { NextResponse } from "next/server"
import { createUnplannedSession } from "@/lib/rec-conference/rapporteur-server"
import {
  rapporteurErrorResponse,
  requireRapporteurReviewer,
  reviewerActor,
} from "@/lib/rec-conference/rapporteur-route"
import { forbiddenResponse } from "@/lib/auth/server-auth"

export const runtime = "nodejs"

export async function POST(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return auth.response
  if (!reviewerActor(auth).canAssign) return forbiddenResponse("Adding a session requires REC manage access.")
  try {
    const body = await request.json()
    const session = await createUnplannedSession(body)
    return NextResponse.json({ session })
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to add session")
  }
}
