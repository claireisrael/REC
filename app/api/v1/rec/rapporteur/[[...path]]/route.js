import { NextResponse } from "next/server"
import { dispatchPublicRapporteur, rapporteurErrorResponse } from "@/lib/rec-conference/rapporteur-route"
import { readBearerToken } from "@/lib/rec-conference/rapporteur-server"

export const runtime = "nodejs"

async function handle(request, context) {
  const params = await context.params
  try {
    const result = await dispatchPublicRapporteur(request, params?.path || [], readBearerToken(request))
    return NextResponse.json(result || { success: true }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return rapporteurErrorResponse(error)
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
