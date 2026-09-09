import { NextResponse } from "next/server"
import {
  listRegistrationImports,
  validateRegistrationImport,
} from "@/lib/rec-conference/registration-import-server"
import {
  recRegistrationImportErrorResponse,
  requireRecRegistrationEditor,
} from "@/lib/rec-conference/registration-import-route"

export const runtime = "nodejs"

function formBoolean(value) {
  return ["true", "1", "yes", "on"].includes(String(value || "").toLowerCase())
}

export async function GET(request) {
  const auth = await requireRecRegistrationEditor(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const result = await listRegistrationImports({
      conferenceId: searchParams.get("conferenceId") || "",
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
    })
    return NextResponse.json(result)
  } catch (error) {
    return recRegistrationImportErrorResponse(
      error,
      "Failed to list REC registration imports"
    )
  }
}

export async function POST(request) {
  const auth = await requireRecRegistrationEditor(request)
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const result = await validateRegistrationImport({
      file: formData.get("file"),
      conferenceId: String(formData.get("conferenceId") || ""),
      templateType: String(formData.get("templateType") || ""),
      sendEmails: formBoolean(formData.get("sendEmails")),
      updateExisting: formBoolean(formData.get("updateExisting")),
      actor: auth.session,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return recRegistrationImportErrorResponse(
      error,
      "Failed to validate REC registration import"
    )
  }
}
