import { Query } from "node-appwrite"
import { config } from "@/lib/appwrite/config"
import { listRestDocuments } from "@/lib/appwrite/appwrite-rest-server"

async function conferenceForYear(year) {
  const number = Number(year)
  if (!Number.isInteger(number) || number < 2000 || number > 2200) {
    throw new Error("Select a valid conference year.")
  }
  const result = await listRestDocuments(config.recConferencesCollectionId, [
    Query.equal("year", number),
    Query.limit(1),
  ])
  const conference = result.documents?.[0]
  if (!conference) {
    const error = new Error("The selected conference was not found.")
    error.status = 404
    throw error
  }
  return conference
}

export async function getParentRegistrationStats(year) {
  const conference = await conferenceForYear(year)
  const stats = {
    total: 0,
    byType: { attendee: 0, exhibitor: 0, sponsor: 0 },
    bySector: Object.create(null),
    bySponsor: Object.create(null),
    byCountry: Object.create(null),
    byDays: Object.create(null),
    sponsoredRegistrations: 0,
    visaLettersRequired: 0,
  }
  const increment = (group, value) => {
    if (value) group[value] = (group[value] || 0) + 1
  }
  let cursor
  for (;;) {
    const page = await listRestDocuments(config.recBadgeRegistryCollectionId, [
      Query.equal("conferenceId", conference.$id),
      Query.equal("eligible", true),
      Query.orderAsc("$id"),
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ])
    if (!page.documents.length) break
    const people = await listRestDocuments(config.recRegistrationsCollectionId, [
      Query.equal("$id", page.documents.map((row) => row.registrationId)),
      Query.limit(100),
    ])
    const countries = new Map(people.documents.map((row) => [row.$id, row.country]))
    for (const row of page.documents) {
      stats.total += 1
      for (const type of row.registrationTypes || []) {
        const key = String(type).toLowerCase()
        if (Object.hasOwn(stats.byType, key)) stats.byType[key] += 1
      }
      for (const sector of row.sector || []) increment(stats.bySector, sector)
      for (const day of row.daysAttending || []) increment(stats.byDays, day)
      increment(stats.byCountry, countries.get(row.registrationId))
      increment(stats.bySponsor, row.sponsorOrganization)
      if (row.sponsorOrganization) stats.sponsoredRegistrations += 1
      if (row.visaLetterRequired) stats.visaLettersRequired += 1
    }
    if (page.documents.length < 100) break
    cursor = page.documents.at(-1).$id
  }
  return stats
}
