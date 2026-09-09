import RecScanningAdminWorkspace from "@/components/rec-registration/RecScanningAdminWorkspace"

export default async function RecScanningEventsPage({ searchParams }) {
  const params = await searchParams
  return (
    <RecScanningAdminWorkspace
      activeView="events"
      initialConferenceId={typeof params?.conferenceId === "string" ? params.conferenceId : ""}
    />
  )
}
