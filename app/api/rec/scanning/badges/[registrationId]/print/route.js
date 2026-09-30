import { badgePrintErrorResponse, badgePrintResponse } from "@/lib/rec-conference/badge-print-server"
import { loadRecBadgePrintCards, RecScanningError } from "@/lib/rec-conference/scanning-server"
import { requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request, { params }) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { registrationId } = await params
    const query = new URL(request.url).searchParams
    const { cards } = await loadRecBadgePrintCards({
      conferenceId: query.get("conferenceId") || "",
      registrationIds: registrationId,
    })
    if (!cards[0]) {
      throw new RecScanningError(
        "This active badge cannot be printed because its card link is missing. Revoke it, then generate a replacement.",
        409,
        "badge_token_unrecoverable",
      )
    }
    return await badgePrintResponse(cards[0], query)
  } catch (error) {
    return badgePrintErrorResponse(error, "Badge could not be rendered")
  }
}
