import { NextResponse } from "next/server"
import { commitRegistrationImport } from "@/lib/rec-conference/registration-import-server"
import {
  recRegistrationImportErrorResponse,
  requireRecRegistrationEditor,
} from "@/lib/rec-conference/registration-import-route"

export const runtime = "nodejs"

export async function POST(request, context) {
  const auth = await requireRecRegistrationEditor(request)
  if (!auth.ok) return auth.response

  try {
    const { importId } = await context.params
    const body = await request.json().catch(() => ({}))
    const result = await commitRegistrationImport(importId, {
      retryFailed: body.retryFailed === true,
    })
    return NextResponse.json(result)
  } catch (error) {
    return recRegistrationImportErrorResponse(
      error,
      "Failed to process REC registration import"
    )
  }
}
