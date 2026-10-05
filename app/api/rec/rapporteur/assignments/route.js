import { NextResponse } from "next/server"
import { createRapporteurAssignment, deleteRapporteurAssignment, updateRapporteurAssignment } from "@/lib/rec-conference/rapporteur-server"
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
  const actor = reviewerActor(auth)
  if (!actor.canAssign) return forbiddenResponse("Assigning rapporteurs requires REC manage access.")
  try {
    const body = await request.json()
    return NextResponse.json(await createRapporteurAssignment(body, actor))
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to assign rapporteur")
  }
}

export async function PUT(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return auth.response
  const actor = reviewerActor(auth)
  if (!actor.canAssign) return forbiddenResponse("Assigning rapporteurs requires REC manage access.")
  try {
    const body = await request.json()
    return NextResponse.json(await updateRapporteurAssignment(body.assignmentId || "", body))
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to update rapporteur")
  }
}

export async function DELETE(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return auth.response
  const actor = reviewerActor(auth)
  if (!actor.canAssign) return forbiddenResponse("Assigning rapporteurs requires REC manage access.")
  try {
    const assignmentId = new URL(request.url).searchParams.get("assignmentId") || ""
    return NextResponse.json(await deleteRapporteurAssignment(assignmentId))
  } catch (error) {
    return rapporteurErrorResponse(error, "Failed to remove rapporteur")
  }
}
