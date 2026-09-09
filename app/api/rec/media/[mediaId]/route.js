import { NextResponse } from "next/server"
import {
  deleteRecMediaItem,
  RecMediaError,
  updateRecMediaItem,
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

export async function PATCH(request, { params }) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    const { mediaId } = await params
    const formData = await request.formData()
    const media = await updateRecMediaItem(mediaId, formData, auth.session.userId)
    return NextResponse.json({ media })
  } catch (error) {
    return mediaErrorResponse(error, "Failed to update REC media item")
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireModuleAction(request, MODULES.REC_CONFERENCE, "manage")
  if (!auth.ok) return auth.response

  try {
    const { mediaId } = await params
    return NextResponse.json(await deleteRecMediaItem(mediaId))
  } catch (error) {
    return mediaErrorResponse(error, "Failed to delete REC media item")
  }
}
