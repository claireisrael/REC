import { NextResponse } from "next/server"
import { verifyScannerOtp } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function POST(request) {
  try {
    const data = await request.json()
    const response = await verifyScannerOtp(data, request)
    return NextResponse.json(response)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to verify scanner access code")
  }
}

