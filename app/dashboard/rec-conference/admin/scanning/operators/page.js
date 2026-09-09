import RecScanningAdminWorkspace from "@/components/rec-registration/RecScanningAdminWorkspace"

export default async function RecScanningOperatorsPage({ searchParams }) {
  const params = await searchParams
  return (
    <RecScanningAdminWorkspace
      activeView="operators"
      initialConferenceId={typeof params?.conferenceId === "string" ? params.conferenceId : ""}
    />
  )
}
