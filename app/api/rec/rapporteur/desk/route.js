import { NextResponse } from "next/server"
import { isRapporteurApprover } from "@/lib/rec-conference/rapporteur-server"
import { requireRapporteurReviewer, reviewerActor } from "@/lib/rec-conference/rapporteur-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRapporteurReviewer(request)
  if (!auth.ok) return NextResponse.json({ desk: "none" })
  const actor = reviewerActor(auth)
  if (actor.canAssign) return NextResponse.json({ desk: "admin" })
  if (await isRapporteurApprover(actor.email)) return NextResponse.json({ desk: "approver" })
  return NextResponse.json({ desk: "none" })
}
