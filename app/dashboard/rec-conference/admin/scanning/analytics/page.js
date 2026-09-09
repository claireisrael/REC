import RecScanningAnalytics from "@/components/rec-registration/RecScanningAnalytics"

export default async function RecScanningAnalyticsPage({ searchParams }) {
  const params = await searchParams
  return (
    <RecScanningAnalytics
      initialConferenceId={typeof params?.conferenceId === "string" ? params.conferenceId : ""}
    />
  )
}
