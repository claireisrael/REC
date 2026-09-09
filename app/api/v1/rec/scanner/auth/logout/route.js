import { NextResponse } from "next/server"
import { revokeScannerSession } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function POST(request) {
  try {
    return NextResponse.json(await revokeScannerSession(request))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to end scanner session")
  }
}

