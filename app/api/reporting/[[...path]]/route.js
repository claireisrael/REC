import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { dispatchPublicRapporteur, rapporteurErrorResponse } from "@/lib/rec-conference/rapporteur-route"

export const runtime = "nodejs"

const COOKIE = "rec-rapporteur-session"

function cookieOptions(expires) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/reporting",
    ...(expires ? { expires: new Date(expires) } : {}),
  }
}

async function handle(request, context) {
  const params = await context.params
  const parts = params?.path || []
  const jar = await cookies()
  try {
    const result = await dispatchPublicRapporteur(request, parts, jar.get(COOKIE)?.value || "")
    const { token, expiresAt, ...safe } = result || {}
    const response = NextResponse.json(safe || { success: true }, { headers: { "Cache-Control": "no-store" } })
    if (token) response.cookies.set(COOKIE, token, cookieOptions(expiresAt))
    if (request.method === "POST" && parts.join("/") === "auth/logout") {
      response.cookies.set(COOKIE, "", { ...cookieOptions(), maxAge: 0 })
    }
    return response
  } catch (error) {
    const response = rapporteurErrorResponse(error)
    if (error?.status === 401) response.cookies.set(COOKIE, "", { ...cookieOptions(), maxAge: 0 })
    return response
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
