import { NextResponse } from "next/server"
import {
  getParentProgrammeSyncStatus,
  syncParentProgrammeIfStale,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const conferenceId = searchParams.get("conferenceId") || ""
    return NextResponse.json(getParentProgrammeSyncStatus(conferenceId))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to read the parent programme sync")
  }
}

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json().catch(() => ({}))
    const conferenceId = data.conferenceId || ""
    const result = await syncParentProgrammeIfStale(conferenceId, auth.session.userId, {
      force: data.force === true,
    })
    return NextResponse.json(result)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to sync programmes from the parent system")
  }
}
