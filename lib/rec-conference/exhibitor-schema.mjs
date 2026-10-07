const str = (key, size = 255, required = false) =>
  size > 1000
    ? [size > 16383 ? "mediumtext" : "text", key, { required }]
    : ["string", key, { size, required }]
const int = (key, required = false) => ["integer", key, { required, min: 0 }]
export const exhibitorCollections = {
  settings: "rec_exhibition_settings",
  applications: "rec_exhibitor_applications",
  representatives: "rec_exhibitor_representatives",
  activity: "rec_exhibitor_activity",
  imports: "rec_exhibitor_imports",
  rows: "rec_exhibitor_import_rows",
  access: "rec_exhibitor_access"
}
export const exhibitorSchema = {
  settings: {
    attributes: [
      str("settingsJson", 16000, true),
      int("revision", true),
      int("reservedCount", true)
    ],
    indexes: []
  },
  applications: {
    attributes: [
      str("conferenceId", 36, true),
      str("companyName", 250, true),
      str("companyKey", 250, true),
      str("ownerEmail", 320, true),
      ["varchar", "representativeEmails", { size: 320, required: false, array: true }],
      str("status", 32, true),
      ["boolean", "correctionRequested", { required: false }],
      str("source", 30, true),
      str("sourceKey", 64),
      str("dataJson", 50000, true),
      str("consentJson", 10000),
      str("decisionJson", 6000),
      str("admissionJson", 6000),
      str("searchText", 1000, true),
      int("revision", true),
      str("submittedAt", 40),
      str("confirmationDeadline", 40)
    ],
    indexes: [
      ["conf_status", "key", ["conferenceId", "status"]],
      ["conf_owner", "key", ["conferenceId", "ownerEmail"]],
      ["conf_company", "key", ["conferenceId", "companyKey"]],
      ["source_key", "unique", ["sourceKey"]],
      ["search", "fulltext", ["searchText"]]
    ]
  },
  representatives: {
    attributes: [
      str("applicationId", 36, true),
      str("conferenceId", 36, true),
      str("representativeId", 36, true),
      str("registrationId", 36, true),
      str("email", 320, true),
      str("daysJson", 4000, true),
      ["boolean", "active", { required: true }]
    ],
    indexes: [
      ["application", "key", ["applicationId"]],
      ["conference_registration", "key", ["conferenceId", "registrationId"]],
      ["identity", "unique", ["applicationId", "representativeId"]]
    ]
  },
  activity: {
    attributes: [
      str("applicationId", 36, true),
      str("conferenceId", 36, true),
      str("kind", 30, true),
      str("actorId", 320, true),
      str("actorName", 320, true),
      str("detailsJson", 16000, true),
      str("deliveryStatus", 20),
      str("email", 320),
      str("messageId", 200),
      str("deliveryError", 1000)
    ],
    indexes: [
      ["application_kind", "key", ["applicationId", "kind"]],
      ["delivery", "key", ["deliveryStatus"]],
      ["conference", "key", ["conferenceId"]]
    ]
  },
  imports: {
    attributes: [
      str("conferenceId", 36, true),
      str("name", 255, true),
      str("actorId", 64, true),
      str("status", 20, true),
      int("rowCount", true),
      int("preparedCount"),
      str("sourceJson", 50000),
      str("requestHash", 64),
      str("admissionJson", 6000),
      ["boolean", "sendEmails", { required: true }]
    ],
    indexes: [["conference", "key", ["conferenceId"]]]
  },
  rows: {
    attributes: [
      str("importId", 36, true),
      int("rowNumber", true),
      str("status", 20, true),
      str("payloadJson", 50000, true),
      str("errorsJson", 6000),
      str("sourceKey", 64),
      str("applicationId", 36)
    ],
    indexes: [
      ["job_row", "unique", ["importId", "rowNumber"]],
      ["job_status", "key", ["importId", "status"]]
    ]
  },
  access: {
    attributes: [
      str("kind", 20, true),
      str("conferenceId", 36, true),
      str("email", 320, true),
      str("secretHash", 64),
      str("expiresAt", 40, true),
      str("requestedAt", 40),
      int("attempts", true)
    ],
    indexes: [["expiration", "key", ["expiresAt"]]]
  }
}
