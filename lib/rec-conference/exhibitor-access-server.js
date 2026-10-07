import { Query } from "node-appwrite"
import { getRestDocument, listRestDocuments } from "@/lib/appwrite/appwrite-rest-server"
import { exhibitorCollections as C } from "./exhibitor-schema.mjs"
import { mergeExhibitorAccess } from "./exhibitor-access.mjs"

async function listAll(table, queries) {
  const result = []
  let cursor
  for (;;) {
    const page = await listRestDocuments(table, [
      ...queries,
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ])
    result.push(...page.documents)
    if (page.documents.length < 100) return result
    cursor = page.documents.at(-1).$id
  }
}

export async function getExhibitorRegistrationAccess(registration, conference) {
  const links = await listAll(C.representatives, [
    Query.equal("conferenceId", conference.$id),
    Query.equal("registrationId", registration.$id),
  ])
  const applications = []
  for (const id of new Set(links.map((r) => r.applicationId)))
    applications.push(await getRestDocument(C.applications, id))
  return mergeExhibitorAccess(registration, conference, applications, links)
}

export async function getExhibitorAccessForRegistrations(registrations, conference) {
  if (!registrations.length) return []
  const links = await listAll(C.representatives, [
    Query.equal("conferenceId", conference.$id),
    Query.equal("registrationId", registrations.map((r) => r.$id)),
  ])
  const ids = [...new Set(links.map((l) => l.applicationId))]
  const applications = []
  for (let i = 0; i < ids.length; i += 50)
    applications.push(...await listAll(C.applications, [Query.equal("$id", ids.slice(i, i + 50))]))
  return registrations.map((registration) => mergeExhibitorAccess(registration, conference, applications, links))
}
