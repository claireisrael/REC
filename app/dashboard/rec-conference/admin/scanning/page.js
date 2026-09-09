import { redirect } from "next/navigation"

export default async function RecScanningPage({ searchParams }) {
  const params = await searchParams
  const conferenceId = typeof params?.conferenceId === "string" ? params.conferenceId : ""
  redirect(`/dashboard/rec-conference/admin/scanning/events${conferenceId ? `?conferenceId=${encodeURIComponent(conferenceId)}` : ""}`)
}
