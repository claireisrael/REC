import { NextResponse } from "next/server"
import { resolvePublicRecBadge } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

async function viewerIsStaff(request) {
  try {
    return (await requireRecScanningAdmin(request)).ok === true
  } catch {
    return false
  }
}

export async function GET(request, { params }) {
  try {
    const { token } = await params
    const [badge, staff] = await Promise.all([resolvePublicRecBadge(token), viewerIsStaff(request)])
    return NextResponse.json({ ...badge, viewerCanPrint: staff }, {
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load REC badge")
  }
}
