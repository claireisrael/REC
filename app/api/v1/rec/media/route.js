import { NextResponse } from "next/server"
import { listRecMediaItems, RecMediaError } from "@/lib/rec-conference/media-server"

export const runtime = "nodejs"

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const result = await listRecMediaItems({
      conferenceId: searchParams.get("conferenceId") || "",
      mediaType: searchParams.get("type") || "",
      featuredOnly: searchParams.get("featured") === "true",
      publicOnly: true,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 25,
    })
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    })
  } catch (error) {
    if (error instanceof RecMediaError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 400 })
    }
    console.error("Failed to load public REC media", error)
    return NextResponse.json({ error: "Failed to load REC media" }, { status: 500 })
  }
}
