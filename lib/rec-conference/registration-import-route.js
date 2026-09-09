import { NextResponse } from "next/server"
import {
  MODULES,
  requireModuleAction,
} from "@/lib/auth/server-auth"
import { RecRegistrationImportError } from "@/lib/rec-conference/registration-import-server"

export async function requireRecRegistrationEditor(request) {
  return requireModuleAction(request, MODULES.REC_CONFERENCE, "edit")
}

export function recRegistrationImportErrorResponse(
  error,
  fallbackMessage = "REC registration import request failed"
) {
  if (error instanceof RecRegistrationImportError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details || {},
      },
      { status: error.status || 400 }
    )
  }

  console.error(fallbackMessage, error)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}
