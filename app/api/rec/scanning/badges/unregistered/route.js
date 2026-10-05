import { NextResponse } from "next/server"
import { releaseUnregisteredQrCodes } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json()
    const result = await releaseUnregisteredQrCodes({
      conferenceId: data.conferenceId || "",
      count: data.count,
    }, auth.session.userId)
    return NextResponse.json(result, { status: result.failed ? 207 : 200 })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to release unregistered QR codes")
  }
}
