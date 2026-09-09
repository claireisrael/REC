import { NextResponse } from "next/server"
import { listRecMediaConferences, RecMediaError } from "@/lib/rec-conference/media-server"
import { MODULES, requireModuleAction } from "@/lib/auth/server-auth"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    return NextResponse.json(await listRecMediaConferences())
  } catch (error) {
    if (error instanceof RecMediaError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 400 })
    }
    console.error("Failed to load REC media conferences", error)
    return NextResponse.json({ error: "Failed to load REC media conferences" }, { status: 500 })
  }
}
