import { NextResponse } from "next/server"
import { deleteRecScanEvent, updateRecScanEvent } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function PATCH(request, { params }) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { eventId } = await params
    const data = await request.json()
    const event = await updateRecScanEvent(eventId, data, auth.session.userId)
    return NextResponse.json({ event })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to update REC scan event")
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { eventId } = await params
    return NextResponse.json(await deleteRecScanEvent(eventId, auth.session.userId))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to delete REC scan event")
  }
}
