import { NextResponse } from "next/server"
import { syncTeraScannerOperators } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json().catch(() => ({}))
    const conferenceId = data.conferenceId || new URL(request.url).searchParams.get("conferenceId") || ""
    const access = {}
    if (Object.hasOwn(data, "accessStartsAt") || Object.hasOwn(data, "accessEndsAt")) {
      access.accessStartsAt = data.accessStartsAt || ""
      access.accessEndsAt = data.accessEndsAt || ""
    }
    if (Object.hasOwn(data, "allowedDays")) {
      access.allowedDays = data.allowedDays
    }
    return NextResponse.json(await syncTeraScannerOperators(conferenceId, auth.session.userId, access))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to register Tera barcode scanners")
  }
}
