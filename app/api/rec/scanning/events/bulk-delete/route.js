import { NextResponse } from "next/server"
import { bulkDeleteRecScanEvents } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json()
    return NextResponse.json(await bulkDeleteRecScanEvents(data, auth.session.userId))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to delete REC scan events")
  }
}
