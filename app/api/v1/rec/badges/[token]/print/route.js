import { badgePrintErrorResponse, badgePrintResponse } from "@/lib/rec-conference/badge-print-server"
import { resolvePublicRecBadge } from "@/lib/rec-conference/scanning-server"

export const runtime = "nodejs"

export async function GET(request, { params }) {
  try {
    const { token } = await params
    return await badgePrintResponse(
      await resolvePublicRecBadge(token),
      new URL(request.url).searchParams,
    )
  } catch (error) {
    return badgePrintErrorResponse(error, "Badge could not be rendered")
  }
}
