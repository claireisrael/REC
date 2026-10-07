import QRCode from "qrcode"
import { config } from "@/lib/appwrite/config"
import {
  createRestDocumentWithId,
  deleteRestDocument,
  getRestDocument,
  listRestDocuments,
  updateRestDocument,
} from "@/lib/appwrite/appwrite-rest-server"
import { createBadgeService } from "./badge-service.mjs"
import { getExhibitorAccessForRegistrations, getExhibitorRegistrationAccess } from "./exhibitor-access-server"

export const badgeStore = {
  get: getRestDocument,
  list: listRestDocuments,
  create: createRestDocumentWithId,
  update: updateRestDocument,
  remove: deleteRestDocument,
}

async function sendSystemEmail({ email, subject, text, html }) {
  const baseUrl = String(config.apiBaseUrl || "").replace(/\/+$/, "")
  if (!baseUrl) throw Object.assign(new Error("The email service is not configured."), { status: 503 })
  const response = await fetch(`${baseUrl}/api/general/send-email`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, subject, text, ...(html ? { html } : {}) }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw Object.assign(new Error(`Email delivery failed (${response.status}).`), {
      status: response.status,
      definitelyRejected: response.status < 500,
    })
  }
  return response.json().catch(() => ({}))
}

export function recBadges() {
  return createBadgeService({
    config,
    getRegistrationAccess: getExhibitorRegistrationAccess,
    getRegistrationsAccess: getExhibitorAccessForRegistrations,
    secret: process.env.REC_SCANNER_TOKEN_SECRET || process.env.AUTH_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || process.env.APPWRITE_API_KEY,
    store: badgeStore,
    sendEmail: sendSystemEmail,
    qrCode: (payload) => QRCode.toDataURL(payload, { margin: 4, width: 360, errorCorrectionLevel: "M" }),
  })
}
