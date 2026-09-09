import { NextResponse } from "next/server"
import { config } from "@/lib/appwrite/config"
import { canPerformAction, getPermissionConfig } from "@/lib/auth/module-permissions-shared"

const MODULES = {
  REC_CONFERENCE: config.recModule,
}

const recAdminPermission = {
  level: "SUPER_ADMIN",
  config: getPermissionConfig("SUPER_ADMIN"),
  ...getPermissionConfig("SUPER_ADMIN"),
}

function getDevSession() {
  return {
    userId: "rec-test-admin",
    email: "rec-tester@local.test",
    name: "REC Tester",
    profile: {
      $id: "rec-test-profile",
      isActive: true,
      systemRole: "Senior Manager",
    },
    profileId: "rec-test-profile",
    systemRole: "Senior Manager",
    modulePermissions: {
      [MODULES.REC_CONFERENCE]: recAdminPermission,
    },
  }
}

export async function getServerSession() {
  return getDevSession()
}

export function unauthorizedResponse(message = "Authentication is required") {
  return NextResponse.json({ error: message }, { status: 401 })
}

export function forbiddenResponse(message = "You are not authorized to perform this action") {
  return NextResponse.json({ error: message }, { status: 403 })
}

export async function requireServerSession() {
  return { ok: true, session: getDevSession() }
}

export function isSeniorManager(session) {
  return session?.systemRole === "Senior Manager"
}

export function canAccessModule(session, module, action = "view") {
  return (
    isSeniorManager(session) ||
    canPerformAction(session?.modulePermissions, module, action)
  )
}

export async function requireModuleAction(request, module, action = "view") {
  const auth = await requireServerSession(request)
  if (!auth.ok) return auth

  if (!canAccessModule(auth.session, module, action)) {
    return { ok: false, response: forbiddenResponse() }
  }

  return auth
}

export { MODULES }
