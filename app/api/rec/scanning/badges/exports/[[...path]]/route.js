import { NextResponse } from "next/server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"
import { downloadBadgeExport, previewBadge, recBadgeExports } from "@/lib/rec-conference/badge-export-server"
import { RecBadgeError } from "@/lib/rec-conference/badge-service.mjs"

export const runtime = "nodejs"
export const maxDuration = 120

const json = (value) => NextResponse.json(value, { headers: { "Cache-Control": "no-store" } })

function errorResponse(error, fallbackMessage) {
  if (error instanceof RecBadgeError || error?.code === "badge_error") {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status || 400 })
  }
  return recScanningErrorResponse(error, fallbackMessage)
}

export async function GET(request, { params }) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response
  try {
    const { path = [] } = await params
    const query = new URL(request.url).searchParams
    if (!path.length) return json(await recBadgeExports().list(query.get("conferenceId"), query.get("page")))
    if (path.length === 1 && path[0] === "preview") return await previewBadge(query.get("conferenceId"), query)
    if (path.length === 1) return json(await recBadgeExports().detail(path[0], query.get("page")))
    if (path.length === 2 && path[1] === "download")
      return await downloadBadgeExport(path[0], auth.session.userId, query.get("packaging") || "zip")
    throw new RecBadgeError("Export not found.", 404)
  } catch (error) {
    return errorResponse(error, "Badge export could not be loaded")
  }
}

export async function POST(request, { params }) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new RecBadgeError("Cross-origin request rejected.", 403)
    const { path = [] } = await params
    if (path.length === 1) return json(await recBadgeExports().process(path[0]))
    if (path.length) throw new RecBadgeError("Export not found.", 404)
    const raw = await request.text()
    if (raw.length > 64000) throw new RecBadgeError("Export request is too large.", 413)
    let input
    try {
      input = JSON.parse(raw)
    } catch {
      throw new RecBadgeError("Provide a valid export request.")
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new RecBadgeError("Provide export options.")
    return json(await recBadgeExports().create(input, auth.session.userId))
  } catch (error) {
    return errorResponse(error, "Badge export could not be processed")
  }
}
