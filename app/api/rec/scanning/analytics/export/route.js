import { exportRecScanAnalytics } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const result = await exportRecScanAnalytics({
      kind: searchParams.get("kind") || "attendance",
      conferenceId: searchParams.get("conferenceId") || "",
      eventId: searchParams.get("eventId") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
      search: searchParams.get("search") || "",
      attendance: searchParams.get("attendance") || "all",
      registrationType: searchParams.get("registrationType") || "",
      participantCategory: searchParams.get("participantCategory") || "",
      status: searchParams.get("status") || "",
      scanner: searchParams.get("scanner") || "",
    })
    return new Response(`\uFEFF${result.csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to export REC scanning analytics")
  }
}
