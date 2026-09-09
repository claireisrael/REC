import { NextResponse } from "next/server"
import { listRecScanningConferences } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    return NextResponse.json(await listRecScanningConferences())
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load REC conferences for scanning")
  }
}

