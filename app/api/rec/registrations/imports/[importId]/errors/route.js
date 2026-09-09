import { NextResponse } from "next/server"
import { buildRegistrationImportErrorCsv } from "@/lib/rec-conference/registration-import-server"
import {
  recRegistrationImportErrorResponse,
  requireRecRegistrationEditor,
} from "@/lib/rec-conference/registration-import-route"

export const runtime = "nodejs"

export async function GET(request, context) {
  const auth = await requireRecRegistrationEditor(request)
  if (!auth.ok) return auth.response

  try {
    const { importId } = await context.params
    const result = await buildRegistrationImportErrorCsv(importId)
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "no-store",
        "X-REC-Import-Issue-Count": String(result.count),
      },
    })
  } catch (error) {
    return recRegistrationImportErrorResponse(
      error,
      "Failed to export REC registration import issues"
    )
  }
}
