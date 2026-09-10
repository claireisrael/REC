import { NextResponse } from "next/server"
import { sendRecRegistrationConfirmationEmail } from "@/lib/rec-conference/registration-email"
import { requireRecRegistrationEditor } from "@/lib/rec-conference/registration-import-route"

export const runtime = "nodejs"

export async function POST(request) {
  const auth = await requireRecRegistrationEditor(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json().catch(() => ({}))
    const registrationData = body.registrationData || body
    if (!registrationData?.email) {
      return NextResponse.json({ error: "A recipient email is required." }, { status: 400 })
    }

    await sendRecRegistrationConfirmationEmail(registrationData, {
      year: body.year ?? registrationData.year ?? null,
      sponsorshipPackageUrl: body.sponsorshipPackageUrl || null,
      administrativeInvite: body.administrativeInvite !== false,
    })

    return NextResponse.json({ sent: true }, { status: 202 })
  } catch (error) {
    console.error("Failed to send confirmation email", error)
    return NextResponse.json(
      { error: error.message || "Failed to send confirmation email" },
      { status: 502 }
    )
  }
}
