import { NextResponse } from "next/server"
import {
  createRecScannerOperator,
  listRecScannerOperators,
  syncTeraScannerOperators,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const conferenceId = searchParams.get("conferenceId") || ""
    if (searchParams.get("syncTera") === "1" && conferenceId) {
      await syncTeraScannerOperators(conferenceId, auth.session.userId)
    }
    return NextResponse.json(await listRecScannerOperators({
      conferenceId,
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "10",
    }))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load scanner operators")
  }
}

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json()
    const operator = await createRecScannerOperator(data, auth.session.userId)
    return NextResponse.json({ operator }, { status: 201 })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to save scanner operator")
  }
}
