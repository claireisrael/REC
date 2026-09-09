import { NextResponse } from "next/server"
import {
  forbiddenResponse,
  isSeniorManager,
  MODULES,
  requireServerSession,
} from "@/lib/auth/server-auth"
import { canPerformAction } from "@/lib/auth/module-permissions-shared"
import { RecScanningError } from "@/lib/rec-conference/scanning-server"

export const runtime = "nodejs"

export function recScanningErrorResponse(error, fallbackMessage = "REC scanning request failed") {
  if (error instanceof RecScanningError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details || {} },
      { status: error.status || 400 }
    )
  }

  console.error(fallbackMessage, error)
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}

export async function requireRecScanningAdmin(request) {
  const auth = await requireServerSession(request)
  if (!auth.ok) return auth

  if (isSeniorManager(auth.session)) return auth

  const permission = auth.session.modulePermissions?.[MODULES.REC_CONFERENCE]
  const canManage = canPerformAction(auth.session.modulePermissions, MODULES.REC_CONFERENCE, "manage")
  const isSuperAdmin = permission?.level === "SUPER_ADMIN"

  if (!canManage && !isSuperAdmin) {
    return { ok: false, response: forbiddenResponse("REC scanning setup requires manage access.") }
  }

  return auth
}

export async function requireRecScanningOperator(request) {
  const auth = await requireServerSession(request)
  if (!auth.ok) return auth

  if (isSeniorManager(auth.session)) return auth

  const canEdit = canPerformAction(auth.session.modulePermissions, MODULES.REC_CONFERENCE, "edit")
  const canManage = canPerformAction(auth.session.modulePermissions, MODULES.REC_CONFERENCE, "manage")

  if (!canEdit && !canManage) {
    return { ok: false, response: forbiddenResponse("REC scanner operation requires edit access.") }
  }

  return auth
}

