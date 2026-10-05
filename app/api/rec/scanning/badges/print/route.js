import { NextResponse } from "next/server"
import { PDFDocument } from "pdf-lib"
import { addA3BadgePages, renderBadge } from "@/lib/rec-conference/badge-renderer.mjs"
import { loadRecBadgePrintCards } from "@/lib/rec-conference/scanning-server"
import { recScanningErrorResponse, requireRecScanningAdmin } from "@/lib/rec-conference/scanning-route"

export const runtime = "nodejs"

const A3_LOAD_SIZE = 36

function printJson(result) {
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  })
}

function registrationIdList(registrationIds) {
  const source = Array.isArray(registrationIds) ? registrationIds : String(registrationIds || "").split(",")
  return Array.from(new Set(source.map((id) => String(id || "").trim()).filter(Boolean)))
}

export async function GET(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const result = await loadRecBadgePrintCards({
      conferenceId: searchParams.get("conferenceId") || "",
      registrationIds: searchParams.get("ids") || "",
    })
    return printJson(result)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to open badge cards for print")
  }
}

export async function POST(request) {
  const auth = await requireRecScanningAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const data = await request.json().catch(() => ({}))
    const conferenceId = data.conferenceId || ""
    const registrationIds = registrationIdList(data.registrationIds)
    if (data.format === "a3") {
      const pdf = await PDFDocument.create()
      let rendered = 0
      let pending = []
      for (let index = 0; index < registrationIds.length; index += A3_LOAD_SIZE) {
        const result = await loadRecBadgePrintCards({
          conferenceId,
          registrationIds: registrationIds.slice(index, index + A3_LOAD_SIZE),
        })
        for (const card of result.cards) {
          pending.push(await renderBadge(card, { format: "png" }))
          rendered += 1
          if (pending.length === 6) {
            await addA3BadgePages(pdf, pending)
            pending = []
          }
        }
      }
      if (pending.length) await addA3BadgePages(pdf, pending)
      if (!rendered) {
        return NextResponse.json(
          { error: "No cards to print. Revoke the active badge, generate a replacement, then try again." },
          { status: 409 },
        )
      }
      pdf.setTitle("REC tags")
      const bytes = Buffer.from(await pdf.save())
      const disposition = data.download ? "attachment" : "inline"
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="rec-tags-a3.pdf"`,
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      })
    }
    const result = await loadRecBadgePrintCards({ conferenceId, registrationIds })
    return printJson(result)
  } catch (error) {
    return recScanningErrorResponse(error, "Failed to open badge cards for print")
  }
}
