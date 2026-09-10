import { NextResponse } from "next/server"
import {
  getPublicRegistrationConference,
  recPublicRegistrationErrorResponse,
} from "@/lib/rec-conference/public-registration-server"

export const runtime = "nodejs"

export async function GET() {
  try {
    const conference = await getPublicRegistrationConference()
    return NextResponse.json({ conference })
  } catch (error) {
    const mapped = recPublicRegistrationErrorResponse(error, "Failed to load registration")
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
