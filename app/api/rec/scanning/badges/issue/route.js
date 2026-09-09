import { NextResponse } from "next/server"
import { issueRecBadgeTokens } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json()
    const result = await issueRecBadgeTokens(data, auth.session.userId)
    return NextResponse.json(result, { status: result.failed ? 207 : 200 })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to issue REC badge tokens")
  }
}
