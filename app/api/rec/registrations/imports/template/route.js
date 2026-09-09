import { NextResponse } from "next/server"
import { buildRegistrationImportTemplate } from "@/lib/rec-conference/registration-import-server"
import {
  recRegistrationImportErrorResponse,
  requireRecRegistrationEditor,
} from "@/lib/rec-conference/registration-import-route"

export const runtime = "nodejs"

function safeYear(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear()
}

export async function GET(request) {
  const auth = await requireRecRegistrationEditor(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const templateType = searchParams.get("type") || "standard"
    const conferenceId = searchParams.get("conferenceId") || ""
    const year = safeYear(searchParams.get("year"))
    const csv = await buildRegistrationImportTemplate(templateType, conferenceId)
    const fileName = `rec-${year}-${templateType}-attendees-template.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return recRegistrationImportErrorResponse(
      error,
      "Failed to create REC registration template"
    )
  }
}
