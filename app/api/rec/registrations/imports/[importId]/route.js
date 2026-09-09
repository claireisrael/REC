import { NextResponse } from "next/server"
import { getRegistrationImport } from "@/lib/rec-conference/registration-import-server"
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
    const { searchParams } = new URL(request.url)
    const result = await getRegistrationImport(importId, {
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 25,
      status: searchParams.get("status") || "",
    })
    return NextResponse.json(result)
  } catch (error) {
    return recRegistrationImportErrorResponse(
      error,
      "Failed to load REC registration import"
    )
  }
}
