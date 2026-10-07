import { Readable } from "node:stream"
import yazl from "yazl"
import { config } from "@/lib/appwrite/config"
import { badgeStore, recBadges } from "./badges-server"
import { createBadgeExportService } from "./badge-export-service.mjs"
import { exportCollections } from "./badge-export-schema.mjs"
import { badgeRenderOptions, combineBadgePdfs, renderBadge } from "./badge-renderer.mjs"
import { RecBadgeError } from "./badge-service.mjs"
import { BADGE_PRINT_FIELDS } from "./badge-print-options.mjs"

const C = exportCollections()

export const exportHeaders = (format, filename, attachment = true) => ({
  "Content-Type":
    format === "pdf"
      ? "application/pdf"
      : format === "zip"
        ? "application/zip"
        : format === "csv"
          ? "text/csv;charset=utf-8"
          : "image/png",
  "Content-Disposition": `${attachment ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, noarchive",
})

async function storage(id, { method = "GET", body, suffix = "" } = {}) {
  const response = await fetch(
    `${String(config.endpoint || "").replace(/\/$/, "")}/storage/buckets/${encodeURIComponent(C.bucket)}/files${id ? `/${encodeURIComponent(id)}` : ""}${suffix}`,
    {
      method,
      body,
      cache: "no-store",
      headers: {
        "X-Appwrite-Project": config.projectId || "",
        "X-Appwrite-Key": process.env.APPWRITE_API_KEY || "",
        "X-Appwrite-Response-Format": "1.9.0",
      },
      signal: AbortSignal.timeout(60000),
    },
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw Object.assign(new Error(error.message || "Badge export storage is unavailable."), { status: response.status })
  }
  return response
}

const files = {
  async exists(id) {
    try {
      const file = await (await storage(id)).json()
      if (file.chunksUploaded < file.chunksTotal) {
        await files.remove(id)
        return false
      }
      return true
    } catch (e) {
      if (e.status === 404) return false
      throw e
    }
  },
  async put(id, buffer, format) {
    if (buffer.length > 4_900_000)
      throw new RecBadgeError("This badge exceeds the print file size limit.", 422, "badge_layout_overflow")
    const form = new FormData()
    form.set("fileId", id)
    form.set("file", new Blob([buffer], { type: format === "pdf" ? "application/pdf" : "image/png" }), `${id}.${format}`)
    try {
      await storage("", { method: "POST", body: form })
    } catch (error) {
      console.error("Badge print storage upload failed", error)
      throw new RecBadgeError("Print storage is temporarily unavailable. Your export progress is saved; continue the export after storage is restored.", 503, "export_storage_unavailable")
    }
  },
  async remove(id) {
    try {
      await storage(id, { method: "DELETE" })
    } catch (e) {
      if (e.status !== 404) throw e
    }
  },
  async get(id) {
    return Buffer.from(await (await storage(id, { suffix: "/download" })).arrayBuffer())
  },
}

export function recBadgeExports() {
  return createBadgeExportService({
    store: badgeStore,
    badges: recBadges(),
    files,
    render: renderBadge,
  })
}

export async function previewBadge(conferenceId, query) {
  const c = await badgeStore.get(config.recConferencesCollectionId, conferenceId)
  let days = c.days
  if (typeof days === "string") {
    try { days = JSON.parse(days) } catch { days = [] }
  }
  const options = badgeRenderOptions(Object.fromEntries(query))
  const bytes = await renderBadge({
    preview: true,
    conference: c,
    registration: {
      name: "SAMPLE BADGE",
      organization: "National Renewable Energy Platform",
      registrationTypes: ["Attendee"],
      badgeRole: "Delegate",
      daysAttending: Array.isArray(days) && days.length ? days.map((day) => day.label) : ["All conference days"],
    },
    badge: { badgeNumberLabel: `REC-${c.year}-SAMPLE` },
    qrPayload: "NREP-PREVIEW-NOT-A-VALID-BADGE",
  }, options)
  return new Response(bytes, { headers: exportHeaders(options.format, `sample.${options.format}`, false) })
}

const csvCell = (value) => {
  const text = String(value || "")
  return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`
}

const badgeExportReport = (rows) =>
  "\uFEFF" +
  [
    ["Badge number", "Name", "Status", "Message", "File"],
    ...rows.map((r) => [r.badgeNumber, r.name, r.status, r.message, r.file]),
  ].map((r) => r.map(csvCell).join(",")).join("\r\n")

export async function downloadBadgeExport(id, actorId, packaging = "zip") {
  if (!["zip", "pdf", "report"].includes(packaging)) throw new RecBadgeError("Unknown download format.")
  const { job, items, report, options } = await recBadgeExports().downloadItems(id, actorId)
  if (packaging === "report")
    return new Response(badgeExportReport(report), { headers: exportHeaders("csv", `REC-export-${id}.csv`) })
  if (packaging === "pdf") {
    if (options.format !== "pdf" || !items.length || items.length > 100)
      throw new RecBadgeError("Combined PDF supports 1-100 exported PDF badges. Use ZIP for larger exports.")
    const buffers = []
    let size = 0
    for (const item of items) {
      const buffer = await files.get(item.fileId)
      size += buffer.length
      if (size > 60_000_000) throw new RecBadgeError("The combined PDF is too large. Download the ZIP instead.", 413)
      buffers.push(buffer)
    }
    return new Response(await combineBadgePdfs(buffers), { headers: exportHeaders("pdf", `REC-badges-${id}.pdf`) })
  }
  const zip = new yazl.ZipFile()
  zip.on("error", (error) => zip.outputStream.destroy(error))
  for (const item of items)
    zip.addReadStreamLazy(`${item.badgeNumber.replace(/[^\w-]/g, "_")}.${options.format}`, { compress: false }, (callback) => {
      files.get(item.fileId).then((buffer) => callback(null, Readable.from(buffer))).catch(callback)
    })
  zip.addBuffer(Buffer.from(badgeExportReport(report)), "export-report.csv")
  const tagDetails = Object.hasOwn(options, "showCategory")
    ? `Printed optional fields: ${BADGE_PRINT_FIELDS.filter(({ key }) => options[key]).map(({ label }) => label).join(", ") || "none"}\nREC-ID position: left strip; hashtag position: below QR.\n`
    : "Printed optional fields: legacy template defaults.\n"
  zip.addBuffer(
    Buffer.from(
      `REC badge print export\nTrim: 93 x 125 mm\nBleed: ${options.bleed ? "3 mm each side; media 99 x 131 mm" : "none"}\n${tagDetails}PNG resolution: 300 DPI\nPrint PDF at actual size (100%), not fit to page.\nCreated: ${job.createdAt}\nExpires: ${job.expiresAt}\nTemplate: ${job.templateVersion}\nCredentials were not changed by this export. Scan points verify current access.\nKeep this archive private.\n`,
    ),
    "print-notes.txt",
  )
  zip.end()
  return new Response(Readable.toWeb(zip.outputStream), { headers: exportHeaders("zip", `REC-badges-${id}.zip`) })
}
