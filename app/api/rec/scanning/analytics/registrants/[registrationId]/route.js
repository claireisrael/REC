import { NextResponse } from "next/server"
import { getRecScanRegistrantAnalytics } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request, { params }) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { registrationId } = await params
    const { searchParams } = new URL(request.url)
    return NextResponse.json(await getRecScanRegistrantAnalytics({
      conferenceId: searchParams.get("conferenceId") || "",
      registrationId,
    }))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load registrant scan details")
  }
}
