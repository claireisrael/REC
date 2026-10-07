const string = (key, size = 64, required = false) => ["string", key, { size, required }]
const date = (key, required = false) => ["datetime", key, { required }]
const integer = (key, required = false) => ["integer", key, { required }]

export function badgeCollections(env = process.env) {
  return {
    registry: env.REC_BADGE_REGISTRY_COLLECTION_ID || "rec_badge_registry",
    history: env.REC_BADGE_HISTORY_COLLECTION_ID || "rec_badge_history",
    jobs: env.REC_BADGE_JOBS_COLLECTION_ID || "rec_badge_jobs",
    results: env.REC_BADGE_JOB_RESULTS_COLLECTION_ID || "rec_badge_job_results",
    locks: env.REC_SCANNING_LOCKS_COLLECTION_ID || "rec_scanning_locks",
  }
}

export const badgeSchema = {
  registry: {
    name: "REC Badge Registry",
    attributes: [string("conferenceId", 64, true), string("registrationId", 64, true),
      string("status", 20, true), string("tokenId"), integer("version"),
      string("name", 500), string("email", 320), string("organization", 500),
      string("searchText", 1500), string("badgeNumber", 24),
      ["boolean", "eligible", { required: true }], date("validUntil", true),
      date("changedAt"), string("operationId"), string("emailStatus", 30), date("emailAt"),
      ["varchar", "registrationTypes", { size: 100, required: false, array: true }],
      ["varchar", "daysAttending", { size: 200, required: false, array: true }],
      ["varchar", "sector", { size: 100, required: false, array: true }],
      ["varchar", "sponsorOrganization", { size: 500, required: false }],
      ["boolean", "visaLetterRequired", { required: false }]],
    indexes: [["conference_registration", "unique", ["conferenceId", "registrationId"]],
      ["conference_status", "key", ["conferenceId", "eligible", "status"]],
      ["expiry", "key", ["validUntil"]], ["name", "key", ["name"]],
      ["search", "fulltext", ["searchText"]],
      ["sponsor", "key", ["sponsorOrganization"]],
      ["visa", "key", ["visaLetterRequired"]]],
  },
  history: {
    name: "REC Badge History",
    attributes: [string("registryId", 36, true), string("conferenceId", 64, true),
      string("registrationId", 64, true), string("tokenId"), string("action", 30, true),
      string("actorId", 100, true), date("occurredAt", true), string("reason", 1000),
      string("status", 30, true), string("recipient", 320), string("providerId", 120),
      string("error", 2000), string("detailsJson", 8000)],
    indexes: [["registry_time", "key", ["registryId", "occurredAt"]],
      ["provider", "key", ["providerId"]]],
  },
  jobs: {
    name: "REC Badge Jobs",
    attributes: [string("conferenceId", 64, true), string("action", 30, true),
      string("actorId", 100, true), string("status", 30, true), date("createdAt", true),
      ["boolean", "sendEmail", { required: true }], string("reason", 1000),
      string("registrationIdsJson", 80000, true), string("requestHash", 64, true),
      integer("total", true), integer("position", true)],
    indexes: [["conference_created", "key", ["conferenceId", "createdAt"]],
      ["status", "key", ["status"]]],
  },
  results: {
    name: "REC Badge Job Results",
    attributes: [string("jobId", 36, true), string("registrationId", 64, true),
      string("name", 500), string("email", 320), string("status", 30, true),
      string("emailStatus", 30), string("message", 2000), date("processedAt", true), integer("position", true)],
    indexes: [["job_position", "unique", ["jobId", "position"]]],
  },
  locks: {
    name: "REC Scanning Locks",
    attributes: [string("scope", 200, true), string("owner", 64, true), date("createdAt", true)],
    indexes: [],
  },
}
