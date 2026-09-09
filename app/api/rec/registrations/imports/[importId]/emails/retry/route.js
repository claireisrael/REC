import { NextResponse } from "next/server"
import { retryRegistrationImportEmails } from "@/lib/rec-conference/registration-import-server"
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
    const result = await retryRegistrationImportEmails(importId)
    return NextResponse.json(result)
  } catch (error) {
    return recRegistrationImportErrorResponse(
      error,
      "Failed to retry REC registration emails"
    )
  }
}
