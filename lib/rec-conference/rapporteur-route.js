import { NextResponse } from "next/server"
import { config } from "@/lib/appwrite/config"
import { canPerformAction } from "@/lib/auth/module-permissions-shared"
import {
  isSeniorManager,
  requireServerSession,
} from "@/lib/auth/server-auth"
import {
  RecRapporteurError,
  addRapporteurComment,
  getRapporteurContext,
  listAssignedSessions,
  listRapporteurComments,
  listRapporteurConferences,
  logoutRapporteur,
  openRapporteurReport,
  requestRapporteurOtp,
  saveRapporteurReport,
  submitRapporteurReport,
  verifyRapporteurOtp,
} from "@/lib/rec-conference/rapporteur-server"

export const runtime = "nodejs"

export function rapporteurErrorResponse(error, fallback = "Rapporteur request failed") {
  if (error instanceof RecRapporteurError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 400 })
  }
  console.error(fallback, error)
  const status = Number(error?.status) || 500
  const message = status === 503 && error?.message ? error.message : fallback
  return NextResponse.json({ error: message }, { status })
}

export async function requireRapporteurReviewer(request) {
  const auth = await requireServerSession(request)
  if (!auth.ok) return auth
  const canAssign = isSeniorManager(auth.session)
    || auth.session?.modulePermissions?.[config.recModule]?.level === "SUPER_ADMIN"
    || canPerformAction(auth.session?.modulePermissions, config.recModule, "manage")
  return { ...auth, canAssign: Boolean(canAssign) }
}

export function reviewerActor(auth) {
  return {
    canAssign: Boolean(auth.canAssign),
    email: auth.session?.email || "",
    name: auth.session?.name || "",
    userId: auth.session?.userId || "",
  }
}

export async function dispatchPublicRapporteur(request, parts = [], token = "") {
  const path = parts.map((part) => decodeURIComponent(part)).join("/")
  const method = request.method
  const url = new URL(request.url)
  if (method === "GET" && path === "auth/request-otp") {
    return listRapporteurConferences(url.searchParams.get("email") || "")
  }
  const body = method === "GET" ? {} : await request.json().catch(() => ({}))
  if (method === "POST" && path === "auth/request-otp") return requestRapporteurOtp(body)
  if (method === "POST" && path === "auth/verify-otp") return verifyRapporteurOtp(body)
  if (method === "POST" && path === "auth/logout") return logoutRapporteur(token)
  const context = await getRapporteurContext(token)
  if (method === "GET" && path === "sessions") return listAssignedSessions(context)
  if (method === "GET" && path === "report") return openRapporteurReport(context, url.searchParams.get("sessionKey") || "")
  if (method === "PUT" && path === "report") return saveRapporteurReport(context, body)
  if (method === "POST" && path === "report/submit") return submitRapporteurReport(context, body.sessionKey)
  if (method === "GET" && path === "comments") return listRapporteurComments(context, url.searchParams.get("sessionKey") || "")
  if (method === "POST" && path === "comments") return addRapporteurComment(context, body)
  throw new RecRapporteurError("Not found", 404, "not_found")
}
