import crypto from "node:crypto";
import { Query } from "node-appwrite";
import { badgeId, RecBadgeError } from "./badge-service.mjs";
import { exportCollections } from "./badge-export-schema.mjs";
import {
  BADGE_TEMPLATE_VERSION,
  badgeRenderOptions,
} from "./badge-renderer.mjs";

const json = (value) => JSON.parse(value);
const safeItem = (value) => {
  const item = { ...value };
  delete item.fileId;
  delete item.tokenId;
  return item;
};
export function normalizeExport(input) {
  const render = badgeRenderOptions(input);
  if (
    typeof input.conferenceId !== "string" ||
    !/^[\w-]{1,64}$/.test(input.conferenceId)
  )
    throw new RecBadgeError("Select a conference.");
  if (!["selected", "filtered"].includes(input.scope))
    throw new RecBadgeError(
      "Choose selected badges or all matching active badges.",
    );
  const ids = input.scope === "selected" ? input.registrationIds : [];
  if (
    !Array.isArray(ids) ||
    ids.length > 500 ||
    ids.some((id) => typeof id !== "string" || !/^[\w-]{1,64}$/.test(id)) ||
    (input.scope === "selected" && !ids.length)
  )
    throw new RecBadgeError("Select between 1 and 500 badges.");
  const registrationType = String(input.registrationType || "");
  if (
    registrationType &&
    !["Attendee", "Exhibitor", "Sponsor"].includes(registrationType)
  )
    throw new RecBadgeError("Invalid participation filter.");
  return {
    conferenceId: input.conferenceId,
    ids: [...new Set(ids)].sort(),
    options: {
      ...render,
      scope: input.scope,
      registrationType,
      day: String(input.day || "").slice(0, 200),
      search: String(input.search || "")
        .trim()
        .slice(0, 150),
    },
  };
}

// Export jobs never mutate registrations, tokens, issuance jobs or email state.
export function createBadgeExportService({
  store,
  badges,
  files,
  render,
  collections = exportCollections(),
  now = () => new Date(),
}) {
  const C = collections,
    iso = () => now().toISOString();
  const safeJob = (value) => {
    const job = { ...value, options: json(value.optionsJson) };
    delete job.selectionJson;
    delete job.requestHash;
    delete job.optionsJson;
    if (Date.parse(job.expiresAt) <= +now()) job.status = "expired";
    return job;
  };
  const optional = async (table, id) => {
    try {
      return await store.get(table, id);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  };
  const queries = (job) => {
    const o = json(job.optionsJson);
    return [
      Query.equal("conferenceId", job.conferenceId),
      Query.equal("eligible", true),
      Query.equal("status", "active"),
      Query.greaterThanEqual("validUntil", job.createdAt),
      Query.lessThanEqual("$createdAt", job.createdAt),
      ...(o.registrationType
        ? [Query.contains("registrationTypes", [o.registrationType])]
        : []),
      ...(o.day ? [Query.contains("daysAttending", [o.day])] : []),
      ...(o.search ? [Query.search("searchText", o.search)] : []),
    ];
  };
  const ensureAvailable = (job) => {
    if (
      Date.parse(job.expiresAt) <= +now() ||
      ["expired", "cancelled"].includes(job.status)
    )
      throw new RecBadgeError(
        "This export expired or was cancelled. Create a new export.",
        410,
        "export_expired",
      );
  };
  async function detail(id, page = 1) {
    const job = await store.get(C.jobs, id),
      limit = 25,
      safePage = Math.max(1, parseInt(page) || 1);
    const result = await store.list(C.items, [
      Query.equal("jobId", id),
      Query.orderAsc("position"),
      Query.limit(limit),
      Query.offset((safePage - 1) * limit),
    ]);
    return {
      ...safeJob(job),
      results: {
        ...result,
        documents: result.documents.map(safeItem),
        page: safePage,
        limit,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    };
  }
  async function list(conferenceId, page = 1) {
    if (typeof conferenceId !== "string" || !/^[\w-]{1,64}$/.test(conferenceId))
      throw new RecBadgeError("Select a conference.");
    const limit = 10,
      p = Math.max(1, parseInt(page) || 1);
    const result = await store.list(C.jobs, [
      Query.equal("conferenceId", conferenceId),
      Query.orderDesc("createdAt"),
      Query.limit(limit),
      Query.offset((p - 1) * limit),
    ]);
    return {
      ...result,
      documents: result.documents.map(safeJob),
      page: p,
      limit,
      totalPages: Math.max(1, Math.ceil(result.total / limit)),
    };
  }
  async function create(input, actorId) {
    if (!/^[\w-]{8,80}$/.test(input.requestId || ""))
      throw new RecBadgeError("A request identifier is required.");
    const value = normalizeExport(input),
      id = badgeId("export", actorId, input.requestId);
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex");
    return badges.withLock(`export:${id}`, async () => {
      const existing = await optional(C.jobs, id);
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new RecBadgeError(
            "This request identifier belongs to different export options.",
            409,
          );
        return detail(id);
      }
      const recent = await store.list(C.jobs, [
        Query.equal("actorId", actorId),
        Query.greaterThanEqual(
          "createdAt",
          new Date(+now() - 60000).toISOString(),
        ),
        Query.limit(1),
      ]);
      if (recent.total >= 5)
        throw new RecBadgeError(
          "Too many exports. Wait a minute before trying again.",
          429,
        );
      const job = {
        conferenceId: value.conferenceId,
        actorId,
        status: "preparing",
        optionsJson: JSON.stringify(value.options),
        selectionJson: JSON.stringify(value.ids),
        cursor: "",
        requestHash,
        templateVersion: BADGE_TEMPLATE_VERSION,
        createdAt: iso(),
        expiresAt: new Date(+now() + 86400000).toISOString(),
        prepared: 0,
        processed: 0,
        exported: 0,
        skipped: 0,
        failed: 0,
        downloadCount: 0,
        total: value.ids.length,
      };
      if (value.options.scope === "filtered")
        job.total = (
          await store.list(badges.collections.registry, [
            ...queries(job),
            Query.limit(1),
          ])
        ).total;
      if (!job.total)
        throw new RecBadgeError("No active badges match these filters.", 409);
      if (job.total > 5000)
        throw new RecBadgeError(
          "Limit the export to 5,000 badges using the filters.",
        );
      await store.create(C.jobs, id, job);
      return detail(id);
    });
  }
  async function process(id) {
    return badges.withLock(`export:${id}`, async () => {
      let job = await store.get(C.jobs, id);
      ensureAvailable(job);
      if (job.status === "completed") return detail(id);
      if (job.templateVersion !== BADGE_TEMPLATE_VERSION)
        throw new RecBadgeError(
          "The badge template changed. Create a new export.",
          409,
        );
      const options = json(job.optionsJson);
      if (job.status === "preparing") {
        let rows, done;
        if (options.scope === "selected") {
          const ids = json(job.selectionJson).slice(
            job.prepared,
            job.prepared + 100,
          );
          rows = [];
          for (const registrationId of ids)
            rows.push(
              (await optional(
                badges.collections.registry,
                badgeId(job.conferenceId, registrationId),
              )) || { registrationId },
            );
          done = job.prepared + rows.length >= job.total;
        } else {
          rows = (
            await store.list(badges.collections.registry, [
              ...queries(job),
              Query.orderAsc("$id"),
              Query.limit(100),
              ...(job.cursor ? [Query.cursorAfter(job.cursor)] : []),
            ])
          ).documents;
          done = rows.length < 100;
        }
        if (job.prepared + rows.length > 5000)
          throw new RecBadgeError("This export exceeds its batch limit.");
        for (let n = 0; n < rows.length; n++) {
          const row = rows[n],
            itemId = badgeId(id, job.prepared + n);
          if (!(await optional(C.items, itemId)))
            await store.create(C.items, itemId, {
              jobId: id,
              registrationId: row.registrationId,
              tokenId: row.tokenId || "",
              tokenVersion: row.version || 0,
              position: job.prepared + n,
              name: row.name || "Registrant",
              badgeNumber: row.badgeNumber || "",
              status: "pending",
              fileId: badgeId("print", itemId),
              message: "",
            });
        }
        job = await store.update(C.jobs, id, {
          prepared: job.prepared + rows.length,
          cursor: rows.at(-1)?.$id || job.cursor,
          status: done ? "processing" : "preparing",
          ...(done ? { total: job.prepared + rows.length } : {}),
        });
        return detail(id);
      }
      for (let count = 0; count < 3 && job.processed < job.total; count++) {
        const itemId = badgeId(id, job.processed);
        let item = await store.get(C.items, itemId);
        if (item.status === "pending") {
          try {
            if (!item.tokenId)
              throw new RecBadgeError(
                "No active badge existed when this export was prepared.",
                409,
                "badge_not_exportable",
              );
            const badge = await badges.exportBadge(
              job.conferenceId,
              item.registrationId,
              item,
            );
            const fileId = badgeId("print", itemId);
            if (!(await files.exists(fileId)))
              await files.put(
                fileId,
                await render(badge, options),
                options.format,
              );
            await badges.exportBadge(
              job.conferenceId,
              item.registrationId,
              item,
            );
            item = await store.update(C.items, itemId, {
              status: "exported",
              fileId,
              message: "",
              name: badge.registration.name,
              badgeNumber: badge.badge.badgeNumberLabel,
            });
          } catch (error) {
            if (error.status >= 500 || error.status === 429 || (!(error instanceof RecBadgeError) && error.status !== 404))
              throw error;
            const status =
              error.code === "badge_layout_overflow" ? "failed" : "skipped";
            await files.remove(badgeId("print", itemId));
            item = await store.update(C.items, itemId, {
              status,
              fileId: "",
              message: String(error.message).slice(0, 1000),
            });
          }
        }
        job = await store.update(C.jobs, id, {
          processed: job.processed + 1,
          [item.status]: job[item.status] + 1,
        });
      }
      if (job.processed >= job.total)
        await store.update(C.jobs, id, { status: "completed" });
      return detail(id);
    });
  }
  async function downloadItems(id, actorId) {
    const job = await store.get(C.jobs, id);
    ensureAvailable(job);
    if (job.status !== "completed")
      throw new RecBadgeError("Complete the export before downloading.", 409);
    const rows = await badges.all(C.items, [Query.equal("jobId", id)]);
    rows.sort((a, b) => a.position - b.position);
    const current = await badges.validExportItems(
      job.conferenceId,
      rows.filter((item) => item.status === "exported"),
    );
    const valid = [],
      report = [];
    for (const item of rows) {
      let status = item.status,
        message = item.message;
      if (status === "exported") {
        if (current.has(item.$id)) valid.push(item);
        else {
          status = "skipped";
          message =
            "Badge is no longer valid. Start a new export after checking its status.";
        }
      }
      report.push({
        badgeNumber: item.badgeNumber,
        name: item.name,
        status,
        message,
        file:
          status === "exported"
            ? `${item.badgeNumber}.${json(job.optionsJson).format}`
            : "",
      });
    }
    await store.update(C.jobs, id, {
      downloadCount: (job.downloadCount || 0) + 1,
      lastDownloadedBy: actorId,
      lastDownloadedAt: iso(),
    });
    return { job, items: valid, report, options: json(job.optionsJson) };
  }
  async function cleanup() {
    const jobs = await store.list(C.jobs, [
      Query.lessThan("expiresAt", iso()),
      Query.notEqual("status", "expired"),
      Query.limit(1),
    ]);
    if (!jobs.documents.length) return { cleaned: 0 };
    const job = jobs.documents[0];
    return badges.withLock(`export:${job.$id}`, async () => {
      const items = await store.list(C.items, [
        Query.equal("jobId", job.$id),
        Query.notEqual("fileId", ""),
        Query.limit(25),
      ]);
      for (const item of items.documents) {
        await files.remove(item.fileId);
        await store.update(C.items, item.$id, { fileId: "" });
      }
      if (items.total <= 25)
        await store.update(C.jobs, job.$id, { status: "expired" });
      return { cleaned: items.documents.length };
    });
  }
  async function worker() {
    const cleanupResult = await cleanup();
    const jobs = await store.list(C.jobs, [
      Query.equal("status", ["preparing", "processing"]),
      Query.greaterThanEqual("expiresAt", iso()),
      Query.orderAsc("createdAt"),
      Query.limit(1),
    ]);
    return {
      ...cleanupResult,
      job: jobs.documents[0] ? await process(jobs.documents[0].$id) : null,
    };
  }
  return { create, process, detail, list, downloadItems, cleanup, worker };
}
