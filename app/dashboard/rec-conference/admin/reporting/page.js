import RecRapporteurDesk from "@/components/rec-registration/RecRapporteurDesk"
import "../../rec-dashboard.css"

export default async function RecRapporteurPage({ searchParams }) {
  const params = await searchParams
  return (
    <RecRapporteurDesk
      initialConferenceId={typeof params?.conferenceId === "string" ? params.conferenceId : ""}
      initialReportId={typeof params?.reportId === "string" ? params.reportId : ""}
    />
  )
}
