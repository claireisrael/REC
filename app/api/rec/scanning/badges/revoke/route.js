import { NextResponse } from "next/server"
import { revokeRecBadgeToken } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json()
    const badge = await revokeRecBadgeToken(data, auth.session.userId)
    return NextResponse.json({ badge })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to revoke REC badge")
  }
}
