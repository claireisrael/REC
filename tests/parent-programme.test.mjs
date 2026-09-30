import assert from "node:assert/strict"
import test from "node:test"
import {
  applyProgrammeSessionSync,
  isParentProgrammeConfigured,
  isScannableProgrammeSession,
  programmeDocumentChanged,
  programmeDocumentFromParent,
  scanEventFromProgrammeSession,
  shouldRefreshParentSync,
} from "../lib/rec-conference/parent-programme.mjs"

test("a published parent session becomes one hall scan event", () => {
  const session = {
    $id: "session-1",
    programId: "program-1",
    title: "Opening Session",
    status: "PUBLISHED",
    day: 1,
    startTime: "2026-10-19T05:30:00.000+00:00",
    toTime: "2026-10-19T06:20:00.000+00:00",
    venueHall: "Victoria Hall (Main Auditorium)",
  }

  assert.equal(isScannableProgrammeSession(session), true)
  assert.equal(isScannableProgrammeSession({ ...session, status: "DRAFT" }), false)
  const event = scanEventFromProgrammeSession(session, "conference-1")
  assert.equal(event.key, "session-session-1")
  assert.equal(event.type, "session_entry")
  assert.equal(event.venue, "Victoria Hall (Main Auditorium)")
  assert.equal(event.endTime, "2026-10-19T06:20:00.000+00:00")
  assert.equal(event.isActive, true)
})

test("programme sync creates a missing scan event and updates a moved session", async () => {
  const created = []
  const updated = []
  const written = []
  const result = await applyProgrammeSessionSync({
    conferenceId: "conference-1",
    sessions: [
      {
        $id: "new-session",
        programId: "program-1",
        title: "New hall session",
        status: "PUBLISHED",
        day: 2,
        startTime: "2026-10-20T05:30:00.000+00:00",
        toTime: "2026-10-20T07:00:00.000+00:00",
        venueHall: "Katonga Hall",
      },
      {
        $id: "moved-session",
        programId: "program-1",
        title: "Moved session",
        status: "PUBLISHED",
        day: 3,
        startTime: "2026-10-21T08:00:00.000+00:00",
        toTime: "2026-10-21T09:00:00.000+00:00",
        venueHall: "Nile Hall",
      },
    ],
    existingEvents: [{
      $id: "event-1",
      key: "session-moved-session",
      name: "Moved session",
      venue: "Achwa Hall",
      startTime: "2026-10-21T08:00:00.000+00:00",
      endTime: "2026-10-21T09:00:00.000+00:00",
      day: 3,
      isActive: true,
    }],
    readSession: async () => null,
    writeSession: async (sessionId) => {
      written.push(sessionId)
    },
    createEvent: async (event) => {
      created.push(event.key)
      return event
    },
    updateEvent: async (eventId, event) => {
      updated.push({ eventId, venue: event.venue })
    },
  })

  assert.deepEqual(written, ["new-session", "moved-session"])
  assert.deepEqual(created, ["session-new-session"])
  assert.deepEqual(updated, [{ eventId: "event-1", venue: "Nile Hall" }])
  assert.equal(result.failures.length, 0)
})

test("parent programmes copy the fields REC already stores, and sync stays quiet for five minutes", () => {
  const document = programmeDocumentFromParent({
    $id: "program-1",
    conferenceId: "conference-1",
    title: "REC26 Programme",
    description: "Main halls",
    daysCount: "4",
    status: "PUBLISHED",
    internalNote: "do not copy",
  })
  assert.equal(document.daysCount, 4)
  assert.equal(document.internalNote, undefined)
  assert.equal(programmeDocumentChanged({ title: "Old" }, document), true)
  assert.equal(programmeDocumentChanged({ ...document }, document), false)
  const now = Date.parse("2026-09-29T10:00:00.000Z")
  assert.equal(shouldRefreshParentSync(now - 60 * 1000, now), false)
  assert.equal(shouldRefreshParentSync(now - 6 * 60 * 1000, now), true)
  assert.equal(shouldRefreshParentSync(0, now), true)
})

test("programme copy stays off when REC already uses the parent database", () => {
  const settings = {
    endpoint: "https://appwrite.example/v1",
    projectId: "parent-project",
    apiKey: "secret",
    databaseId: "parent-database",
    programmesCollectionId: "programmes",
    sessionsCollectionId: "sessions",
  }
  const env = {
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: "parent-project",
    NEXT_PUBLIC_APPWRITE_DATABASE_ID: "parent-database",
  }
  assert.equal(isParentProgrammeConfigured(settings, env), false)
  assert.equal(isParentProgrammeConfigured(settings, {
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: "other-project",
    NEXT_PUBLIC_APPWRITE_DATABASE_ID: "rec_system",
  }), true)
})
