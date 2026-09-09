import { NextResponse } from "next/server"
import { RecReportError } from "@/lib/rec-conference/reports-server"

export async function readRecReportJson(request) {
  try {
    return await request.json()
  } catch {
    throw new RecReportError("Request body must be valid JSON.", 400, "invalid_json")
  }
}

export function recReportErrorResponse(error, fallbackMessage = "REC report request failed") {
  if (error instanceof RecReportError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status || 400 }
    )
  }
  console.error(fallbackMessage, error)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}
