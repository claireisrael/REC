import { NextResponse } from "next/server"
import {
  createRecMediaItem,
  listRecMediaItems,
  RecMediaError,
} from "@/lib/rec-conference/media-server"
import { MODULES, requireModuleAction } from "@/lib/auth/server-auth"

export const runtime = "nodejs"

function mediaErrorResponse(error, fallbackMessage = "REC media request failed") {
  if (error instanceof RecMediaError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status || 400 }
    )
  }
  console.error(fallbackMessage, error)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}

export async function GET(request) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const result = await listRecMediaItems({
      conferenceId: searchParams.get("conferenceId") || "",
      mediaType: searchParams.get("type") || "",
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 25,
    })
    return NextResponse.json(result)
  } catch (error) {
    return mediaErrorResponse(error, "Failed to load REC media")
  }
}

export async function POST(request) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const media = await createRecMediaItem(formData, auth.session.userId)
    return NextResponse.json({ media }, { status: 201 })
  } catch (error) {
    return mediaErrorResponse(error, "Failed to create REC media item")
  }
}
