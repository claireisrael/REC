import { NextResponse } from "next/server"
import {
  recPublicRegistrationErrorResponse,
  submitPublicRegistration,
} from "@/lib/rec-conference/public-registration-server"

export const runtime = "nodejs"

export async function POST(request) {
  try {
    const data = await request.json().catch(() => ({}))
    const result = await submitPublicRegistration(data)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const mapped = recPublicRegistrationErrorResponse(error, "Failed to complete registration")
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}
