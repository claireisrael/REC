import { config } from "@/lib/appwrite/config"

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function displayValue(value, fallback = "N/A") {
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value || "").trim()
  return escapeHtml(text || fallback)
}

function detailRow(label, value, shaded = false) {
  return `
    <tr style="background:${shaded ? "#f1f5f9" : "#ffffff"};">
      <td style="padding:10px 12px;border:1px solid #dbe4ea;color:#475569;font-weight:700;width:38%;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:10px 12px;border:1px solid #dbe4ea;color:#172033;">
        ${value}
      </td>
    </tr>
  `
}

export function buildRecRegistrationConfirmationEmail(
  registrationData,
  { year = null, sponsorshipPackageUrl = null, administrativeInvite = false } = {}
) {
  const fullName = [
    registrationData.title,
    registrationData.firstName,
    registrationData.otherName,
    registrationData.lastName,
  ].filter(Boolean).join(" ")
  const sponsor = registrationData.sponsorOrganization
    ? `${displayValue(registrationData.sponsorOrganization)}${
        registrationData.sponsorSector
          ? ` (${displayValue(registrationData.sponsorSector)})`
          : ""
      }`
    : ""
  const sponsorshipPackage = (
    registrationData.registrationType?.toLowerCase() === "sponsor" &&
    sponsorshipPackageUrl
  )
    ? detailRow(
        "Sponsorship Package",
        `<a href="${escapeHtml(sponsorshipPackageUrl)}" style="color:#176F91;font-weight:700;">View sponsorship package</a>`,
        true
      )
    : ""

  return `
    <div style="margin:0;padding:24px;background:#f4f7f9;font-family:Arial,sans-serif;color:#172033;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe4ea;border-radius:8px;overflow:hidden;">
        <div style="background:#0B5E78;padding:24px;color:#ffffff;">
          <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#F5C078;">
            Renewable Energy Conference &amp; Expo
          </div>
          <h1 style="font-size:24px;line-height:1.25;margin:8px 0 0;">
            REC ${escapeHtml(year || "")} registration confirmed
          </h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 14px;line-height:1.6;">Hello ${displayValue(fullName, "Attendee")},</p>
          <p style="margin:0 0 20px;line-height:1.6;color:#475569;">
            ${
              administrativeInvite
                ? "A conference administrator has registered you to attend the event."
                : "Thank you for registering to attend the event."
            }
            Your recorded details are shown below.
          </p>
          <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">
            ${detailRow("Full Name", displayValue(fullName))}
            ${detailRow("Email", displayValue(registrationData.email), true)}
            ${detailRow("Phone", displayValue(registrationData.phone))}
            ${detailRow("Organization", displayValue(registrationData.organization), true)}
            ${detailRow("Sector", displayValue(registrationData.sector))}
            ${sponsor ? detailRow("Sponsored By", sponsor, true) : ""}
            ${detailRow(
              "Location",
              displayValue(
                [registrationData.city, registrationData.stateRegion, registrationData.country]
                  .filter(Boolean)
                  .join(", ")
              ),
              Boolean(sponsor)
            )}
            ${detailRow("Registration Type", displayValue(registrationData.registrationType), !sponsor)}
            ${sponsorshipPackage}
            ${detailRow("Days Attending", displayValue(registrationData.daysAttending))}
            ${detailRow(
              "Visa Letter Required",
              registrationData.visaLetterRequired ? "Yes" : "No",
              true
            )}
          </table>
          <p style="margin:22px 0 0;line-height:1.6;color:#475569;">
            We look forward to welcoming you to the conference.
          </p>
        </div>
      </div>
    </div>
  `
}

export async function sendRecRegistrationConfirmationEmail(
  registrationData,
  options = {}
) {
  const year = options.year ?? null
  const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "")
  if (!apiBaseUrl) throw new Error("The email API base URL is not configured.")

  const response = await fetch(`${apiBaseUrl}/api/rec/send-reg-confirmation-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      year,
      email: registrationData.email,
      subject: `Renewable Energy Conference ${year} & EXPO: Registration Confirmation`,
      text: buildRecRegistrationConfirmationEmail(registrationData, options),
      eventEnd: registrationData.eventEnd,
      eventStart: registrationData.eventStart,
    }),
  })

  if (!response.ok) {
    const responseText = await response.text().catch(() => "")
    throw new Error(
      `Failed to send confirmation email (${response.status})${
        responseText ? `: ${responseText.slice(0, 300)}` : ""
      }`
    )
  }

  return true
}
