import { NextResponse } from "next/server"
import {
  deleteRecScannerOperator,
  updateRecScannerOperator,
} from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

export async function PATCH(request, { params }) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { operatorId } = await params
    const data = await request.json()
    return NextResponse.json(await updateRecScannerOperator(operatorId, data, auth.session.userId))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to update scanner operator")
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { operatorId } = await params
    return NextResponse.json(await deleteRecScannerOperator(operatorId))
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to delete scanner operator")
  }
}
