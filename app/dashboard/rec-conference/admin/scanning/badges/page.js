import RecScanningAdminWorkspace from "@/components/rec-registration/RecScanningAdminWorkspace"

export default async function RecScanningBadgesPage({ searchParams }) {
  const params = await searchParams
  return (
    <RecScanningAdminWorkspace
      activeView="badges"
      initialConferenceId={typeof params?.conferenceId === "string" ? params.conferenceId : ""}
    />
  )
}
