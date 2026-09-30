import { NextResponse } from "next/server"
import { loadRecBadgePrintCards } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const result = await loadRecBadgePrintCards({
      conferenceId: searchParams.get("conferenceId") || "",
      registrationIds: searchParams.get("ids") || "",
    })
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to open badge cards for print")
  }
}
