import { NextResponse } from "next/server"
import {
  createRecScanEvent,
  listRecScanEvents,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const conferenceId = searchParams.get("conferenceId") || ""
    const page = searchParams.get("page") || "1"
    const limit = searchParams.get("limit") || "25"
    return NextResponse.json(await listRecScanEvents({ conferenceId, page, limit }))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load REC scan events")
  }
}

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json()
    const event = await createRecScanEvent(data, auth.session.userId)
    return NextResponse.json({ event }, { status: 201 })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to create REC scan event")
  }
}
