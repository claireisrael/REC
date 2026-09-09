import { NextResponse } from "next/server"
import { listPublicRecMediaConferences, RecMediaError } from "@/lib/rec-conference/media-server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const result = await listPublicRecMediaConferences()
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    })
  } catch (error) {
    if (error instanceof RecMediaError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 400 })
    }
    console.error("Failed to load public REC media conferences", error)
    return NextResponse.json({ error: "Failed to load REC media conferences" }, { status: 500 })
  }
}
