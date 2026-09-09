import { NextResponse } from "next/server"
import { listRecBadgeRegistrations } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const result = await listRecBadgeRegistrations({
      conferenceId: searchParams.get("conferenceId") || "",
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 25,
      status: searchParams.get("status") || "all",
      search: searchParams.get("search") || "",
    })
    return NextResponse.json(result)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load REC badge registry")
  }
}
