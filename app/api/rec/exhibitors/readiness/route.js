import { NextResponse } from "next/server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"
import { listExhibitorReadiness } from "@/lib/rec-conference/exhibitor-readiness-server"
import { ExhibitorError } from "@/lib/rec-conference/exhibitor-rules.mjs"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams)
    return NextResponse.json(await listExhibitorReadiness(query.conferenceId, query), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof ExhibitorError) {
      return NextResponse.json({ error: error.message, fields: error.fields }, { status: error.status || 400 })
    }
    return recScanningErrorResponse(error, "Unable to load exhibitor readiness.")
  }
}
