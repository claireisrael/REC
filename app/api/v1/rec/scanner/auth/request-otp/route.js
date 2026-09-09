import { NextResponse } from "next/server"
import {
  listEligibleScannerConferences,
  requestScannerOtp,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const conferences = await listEligibleScannerConferences(searchParams.get("email") || "")
    return NextResponse.json({ conferences })
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to load scanner conference access")
  }
}

export async function POST(request) {
  try {
    const data = await request.json()
    const response = await requestScannerOtp(data, request)
    return NextResponse.json(response)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to request scanner access code")
  }
}

