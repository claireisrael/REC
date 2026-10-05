import test from "node:test"
import assert from "node:assert/strict"
import sharp from "sharp"
import { PDFDocument } from "pdf-lib"
import { BADGE_SIZE, renderA3BadgePdf, renderBadge } from "../lib/rec-conference/badge-renderer.mjs"

const sampleBadge = {
  conference: {
    year: 2026,
    title: "Renewable Energy Conference & Expo",
    theme: "From Systems To Scale: Transforming Uganda's Green Economy",
    startDate: "2026-10-19",
    endDate: "2026-10-22",
    venue: "Speke Resort Munyonyo",
    location: "Kampala, Uganda",
  },
  registration: {
    name: "Alex Namutebi",
    organization: "National Renewable Energy Platform",
    registrationTypes: ["Attendee"],
    daysAttending: ["Day 1", "Day 2", "Day 3", "Day 4"],
  },
  badge: { badgeNumberLabel: "REC-2026-SAMPLE" },
  qrPayload: "rec:v1:NOT_A_VALID_CREDENTIAL_PRINT_QA_0000000000000",
}

test("badge size matches the 93 by 125 millimetre tag", () => {
  assert.deepEqual(
    { width: BADGE_SIZE.width, height: BADGE_SIZE.height },
    { width: 93, height: 125 },
  )
})

test("the provided template prints at the template image resolution", async () => {
  const png = await renderBadge(sampleBadge, { format: "png" })
  const meta = await sharp(png).metadata()
  assert.equal(meta.width, 2424)
  assert.equal(meta.height, 3258)
  assert.equal(meta.density, 662)
})

test("renders the provided template as a PNG and a PDF", async () => {
  const png = await renderBadge(sampleBadge, { format: "png" })
  const pdf = await renderBadge(sampleBadge, { format: "pdf" })
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a")
  assert.equal(pdf.subarray(0, 5).toString("utf8"), "%PDF-")
  const sheet = await PDFDocument.load(await renderA3BadgePdf([png]))
  const page = sheet.getPage(0)
  const mm = 25.4 / 72
  assert.equal(sheet.getPageCount(), 1)
  assert.equal(Math.round(page.getWidth() * mm), 297)
  assert.equal(Math.round(page.getHeight() * mm), 420)
})
