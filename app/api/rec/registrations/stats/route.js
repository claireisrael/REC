import { NextResponse } from "next/server"
import { MODULES, requireModuleAction } from "@/lib/auth/server-auth"
import { getParentRegistrationStats } from "@/lib/rec-conference/registration-count-server"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "view")
  if (!auth.ok) return auth.response
  try {
    const year = new URL(request.url).searchParams.get("year")
    return NextResponse.json(await getParentRegistrationStats(year), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    const status = Number(error?.status) || 500
    return NextResponse.json(
      { error: error?.message || "Failed to load registration totals" },
      { status }
    )
  }
}
