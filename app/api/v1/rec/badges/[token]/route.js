import { NextResponse } from "next/server"
import { resolvePublicRecBadge } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(_request, { params }) {
  try {
    const { token } = await params
    const badge = await resolvePublicRecBadge(token)
    return NextResponse.json(badge, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load REC badge")
  }
}
