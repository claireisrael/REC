const SESSION_FIELDS = [
  "programId",
  "day",
  "startTime",
  "toTime",
  "venueHall",
  "theme",
  "title",
  "preamble",
  "organizer",
  "speakers",
  "status",
  "createdBy",
  "updatedAt",
  "createdAt",
  "timeBlockIds",
  "sessionSpanType",
  "updateHistory",
]

const PROGRAMME_FIELDS = ["conferenceId", "title", "description", "daysCount", "status", "createdBy", "updatedAt", "createdAt"]
const SCANNABLE_SESSION_STATUSES = new Set(["PUBLISHED", "ONGOING"])
export const PARENT_SYNC_MAX_AGE_MS = 5 * 60 * 1000

export function parentProgrammeSettings(env = process.env) {
  const endpoint = String(env.REC_PARENT_APPWRITE_ENDPOINT || env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "").replace(/\/$/, "")
  return {
    endpoint: endpoint.endsWith("/v1") ? endpoint : (endpoint ? `${endpoint}/v1` : ""),
    projectId: String(env.REC_PARENT_APPWRITE_PROJECT_ID || "").trim(),
    apiKey: String(env.REC_PARENT_APPWRITE_API_KEY || "").trim(),
    databaseId: String(env.REC_PARENT_APPWRITE_DATABASE_ID || "").trim(),
    programmesCollectionId: String(env.REC_PARENT_PROGRAMMES_COLLECTION_ID || "").trim(),
    sessionsCollectionId: String(env.REC_PARENT_SESSIONS_COLLECTION_ID || "").trim(),
  }
}

export function isParentProgrammeConfigured(settings = parentProgrammeSettings(), env = process.env) {
  const configured = Boolean(
    settings.endpoint
    && settings.projectId
    && settings.apiKey
    && settings.databaseId
    && settings.programmesCollectionId
    && settings.sessionsCollectionId
  )
  if (!configured) return false
  const ownProject = String(env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "").trim()
  const ownDatabase = String(env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || "").trim()
  return !(settings.projectId === ownProject && settings.databaseId === ownDatabase)
}

export function shouldRefreshParentSync(lastSyncedAt, now = Date.now(), maxAgeMs = PARENT_SYNC_MAX_AGE_MS) {
  const at = Number(lastSyncedAt)
  if (!Number.isFinite(at) || at <= 0) return true
  return now - at >= maxAgeMs
}

export function programmeDocumentFromParent(program) {
  const document = {}
  for (const field of PROGRAMME_FIELDS) {
    const value = program?.[field]
    if (value === undefined || value === null || value === "") continue
    document[field] = field === "daysCount" ? Number(value) : value
  }
  if (document.daysCount !== undefined && !Number.isFinite(document.daysCount)) delete document.daysCount
  return document
}

export function programmeDocumentChanged(current, next) {
  if (!current) return true
  return PROGRAMME_FIELDS.some((field) => {
    if (next[field] === undefined) return false
    return String(current[field] ?? "") !== String(next[field] ?? "")
  })
}

export function sessionDocumentFromParent(session) {
  const document = {}
  for (const field of SESSION_FIELDS) {
    const value = session?.[field]
    if (value === undefined || value === null || value === "") continue
    document[field] = value
  }
  return document
}

export function scanEventFromProgrammeSession(session, conferenceId) {
  const status = String(session?.status || "").toUpperCase()
  return {
    conferenceId,
    programId: String(session?.programId || ""),
    sessionId: String(session?.$id || ""),
    key: `session-${session?.$id || ""}`,
    name: String(session?.title || "Session Entry").trim() || "Session Entry",
    type: "session_entry",
    day: session?.day || null,
    startTime: session?.startTime || "",
    endTime: session?.toTime || session?.endTime || "",
    venue: session?.venueHall || "",
    scanRule: "once_per_event",
    isActive: SCANNABLE_SESSION_STATUSES.has(status),
    sortOrder: Number(session?.day || 0) * 1000 + 100,
  }
}

export function isScannableProgrammeSession(session) {
  return SCANNABLE_SESSION_STATUSES.has(String(session?.status || "").toUpperCase()) && Boolean(session?.$id)
}

async function parentRequest(settings, path, queries = []) {
  const url = new URL(`${settings.endpoint}${path}`)
  for (const query of queries) url.searchParams.append("queries[]", JSON.stringify(query))
  const response = await fetch(url, {
    headers: {
      "X-Appwrite-Project": settings.projectId,
      "X-Appwrite-Key": settings.apiKey,
      "X-Appwrite-Response-Format": "1.9.0",
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || "Parent programme request failed")
    error.status = response.status
    throw error
  }
  return payload
}

async function listParentDocuments(settings, collectionId, filters = []) {
  const documents = []
  let offset = 0
  while (documents.length < 5000) {
    const page = await parentRequest(
      settings,
      `/databases/${encodeURIComponent(settings.databaseId)}/collections/${encodeURIComponent(collectionId)}/documents`,
      [...filters, { method: "limit", values: [100] }, { method: "offset", values: [offset] }]
    )
    const rows = page.documents || []
    documents.push(...rows)
    if (rows.length < 100) break
    offset += 100
  }
  return documents
}

export function programmeScanEventChanged(current, next) {
  return current?.name !== next.name
    || String(current?.venue || "") !== String(next.venue || "")
    || String(current?.startTime || "") !== String(next.startTime || "")
    || String(current?.endTime || "") !== String(next.endTime || "")
    || Number(current?.day || 0) !== Number(next.day || 0)
    || current?.isActive !== next.isActive
}

export async function applyProgrammeSessionSync({
  conferenceId,
  sessions,
  existingEvents,
  readSession,
  writeSession,
  createEvent,
  updateEvent,
}) {
  const results = {
    sessions: sessions.length,
    copiedSessions: 0,
    createdEvents: 0,
    updatedEvents: 0,
    failures: [],
  }
  const eventsByKey = new Map((existingEvents || []).map((event) => [event.key, event]))

  for (const session of sessions) {
    try {
      const existingSession = await readSession(session.$id)
      await writeSession(session.$id, sessionDocumentFromParent(session), existingSession)
      results.copiedSessions += 1

      const next = scanEventFromProgrammeSession(session, conferenceId)
      const current = eventsByKey.get(next.key)
      if (!current) {
        const created = await createEvent(next)
        if (created?.key) eventsByKey.set(created.key, created)
        results.createdEvents += 1
        continue
      }
      if (!programmeScanEventChanged(current, next)) continue
      await updateEvent(current.$id, next)
      results.updatedEvents += 1
    } catch (error) {
      results.failures.push({
        title: String(session?.title || session?.$id || "Session"),
        message: error?.message || "Session sync failed",
      })
    }
  }

  return results
}

export async function listParentConferenceSessions(settings, conferenceId) {
  const programs = await listParentDocuments(settings, settings.programmesCollectionId, [
    { method: "equal", attribute: "conferenceId", values: [conferenceId] },
  ])
  const sessions = []
  for (const program of programs) {
    const rows = await listParentDocuments(settings, settings.sessionsCollectionId, [
      { method: "equal", attribute: "programId", values: [program.$id] },
    ])
    sessions.push(...rows.filter(isScannableProgrammeSession))
  }
  return { programs, sessions }
}
