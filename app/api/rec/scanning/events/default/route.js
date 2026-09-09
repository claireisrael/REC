import { NextResponse } from "next/server"
import { generateDefaultRecScanEvents } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json()
    const created = await generateDefaultRecScanEvents(data.conferenceId, auth.session.userId, {
      includeSessions: data.includeSessions !== false,
    })
    return NextResponse.json({ created, count: created.length }, { status: 201 })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to generate default REC scan events")
  }
}

