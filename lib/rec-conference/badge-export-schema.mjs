export const exportCollections = (env = process.env) => ({
  jobs: env.REC_BADGE_EXPORT_JOBS_COLLECTION_ID || "rec_badge_export_jobs",
  items: env.REC_BADGE_EXPORT_ITEMS_COLLECTION_ID || "rec_badge_export_items",
  bucket: env.REC_BADGE_EXPORTS_BUCKET_ID || "rec_badge_exports",
});
const s = (key, size = 64, required = false) => [
  "varchar",
  key,
  { size, required },
];
const i = (key) => ["integer", key, { required: false }];
const d = (key) => ["datetime", key, { required: true }];
export const exportSchema = {
  jobs: {
    name: "REC Badge Exports",
    attributes: [
      s("conferenceId", 64, true),
      s("actorId", 100, true),
      s("status", 30, true),
      s("optionsJson", 2000, true),
      ["mediumtext", "selectionJson", { required: true }],
      s("cursor", 64),
      s("requestHash", 64, true),
      s("templateVersion", 64, true),
      d("createdAt"),
      d("expiresAt"),
      i("total"),
      i("prepared"),
      i("processed"),
      i("exported"),
      i("skipped"),
      i("failed"),
      i("downloadCount"),
      s("lastDownloadedBy", 100),
      s("lastDownloadedAt", 40),
    ],
    indexes: [
      ["conference_created", "key", ["conferenceId", "createdAt"]],
      ["status_expiry", "key", ["status", "expiresAt"]],
      ["actor_created", "key", ["actorId", "createdAt"]],
    ],
  },
  items: {
    name: "REC Badge Export Items",
    attributes: [
      s("jobId", 36, true),
      s("registrationId", 64, true),
      s("tokenId", 64),
      i("tokenVersion"),
      i("position"),
      s("name", 500),
      s("badgeNumber", 24),
      s("status", 30, true),
      s("fileId", 36),
      s("message", 1000),
    ],
    indexes: [
      ["job_position", "unique", ["jobId", "position"]],
      ["job_status", "key", ["jobId", "status"]],
    ],
  },
};
