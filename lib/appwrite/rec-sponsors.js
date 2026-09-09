import { ID, Query } from "appwrite"
import { config } from "./config"

export const DEFAULT_SPONSOR_CATEGORIES = [
  { name: "Platinum", slug: "platinum", accentColor: "#6b7280", displayOrder: 1, isActive: true },
  { name: "Gold", slug: "gold", accentColor: "#d97706", displayOrder: 2, isActive: true },
  { name: "Silver", slug: "silver", accentColor: "#94a3b8", displayOrder: 3, isActive: true },
  { name: "Bronze", slug: "bronze", accentColor: "#b45309", displayOrder: 4, isActive: true },
]

const CATEGORY_FIELDS = [
  "conferenceId",
  "name",
  "slug",
  "description",
  "accentColor",
  "displayOrder",
  "isActive",
  "createdAt",
  "updatedAt",
]

const SPONSOR_FIELDS = [
  "conferenceId",
  "categoryId",
  "name",
  "description",
  "siteUrl",
  "logoUrl",
  "logoFileId",
  "displayOrder",
  "isActive",
  "isFeatured",
  "contactPerson",
  "contactEmail",
  "internalNotes",
  "createdAt",
  "updatedAt",
]

const isPersistedId = (id) => Boolean(id && !String(id).startsWith("tmp-"))

const toSlug = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const compactDocument = (data, fields) =>
  fields.reduce((acc, field) => {
    if (data[field] !== undefined) acc[field] = data[field]
    return acc
  }, {})

const nullableText = (value) => {
  const trimmed = String(value || "").trim()
  return trimmed || null
}

const booleanValue = (value, fallback = false) =>
  value === undefined || value === null ? fallback : Boolean(value)

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const createSponsorCategoryDraft = (overrides = {}) => {
  const localId = overrides.localId || `tmp-category-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    localId,
    name: "",
    slug: "",
    description: "",
    accentColor: "#2E9ECC",
    displayOrder: 0,
    isActive: true,
    ...overrides,
  }
}

export const createSponsorDraft = (overrides = {}) => {
  const localId = overrides.localId || `tmp-sponsor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    localId,
    categoryId: "",
    name: "",
    description: "",
    siteUrl: "",
    logoUrl: "",
    logoFileId: "",
    displayOrder: 0,
    isActive: true,
    isFeatured: false,
    contactPerson: "",
    contactEmail: "",
    internalNotes: "",
    ...overrides,
  }
}

const normalizeCategory = (category, index = 0) => {
  const name = String(category.name || "").trim()
  return {
    ...category,
    localId: category.localId || category.$id || `tmp-category-${index}`,
    name,
    slug: nullableText(category.slug || toSlug(name)),
    description: nullableText(category.description),
    accentColor: nullableText(category.accentColor) || "#2E9ECC",
    displayOrder: numberValue(category.displayOrder, index + 1),
    isActive: booleanValue(category.isActive, true),
  }
}

const normalizeSponsor = (sponsor, index = 0) => ({
  ...sponsor,
  localId: sponsor.localId || sponsor.$id || `tmp-sponsor-${index}`,
  categoryId: nullableText(sponsor.categoryId),
  name: String(sponsor.name || "").trim(),
  description: nullableText(sponsor.description),
  siteUrl: nullableText(sponsor.siteUrl),
  logoUrl: nullableText(sponsor.logoUrl),
  logoFileId: nullableText(sponsor.logoFileId),
  displayOrder: numberValue(sponsor.displayOrder, index + 1),
  isActive: booleanValue(sponsor.isActive, true),
  isFeatured: booleanValue(sponsor.isFeatured, false),
  contactPerson: nullableText(sponsor.contactPerson),
  contactEmail: nullableText(sponsor.contactEmail),
  internalNotes: nullableText(sponsor.internalNotes),
})

const sortByDisplayOrder = (a, b) =>
  numberValue(a.displayOrder, 0) - numberValue(b.displayOrder, 0) || String(a.name || "").localeCompare(String(b.name || ""))

export const uploadSponsorLogo = async (file, appwriteServices) => {
  const fileId = `sponsor-logo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const uploadedFile = await appwriteServices.storage.createFile(
    config.recConferenceBucketId,
    fileId,
    file
  )

  const fileUrl = appwriteServices.storage.getFileView(
    config.recConferenceBucketId,
    uploadedFile.$id
  )

  return {
    fileId: uploadedFile.$id,
    fileUrl: fileUrl?.toString ? fileUrl.toString() : String(fileUrl),
  }
}

export const getSponsorCategoriesByConference = async (conferenceId, appwriteServices, options = {}) => {
  const queries = [
    Query.equal("conferenceId", conferenceId),
    Query.orderAsc("displayOrder"),
    Query.orderAsc("name"),
    Query.limit(options.limit || 200),
  ]

  if (!options.includeInactive) {
    queries.splice(1, 0, Query.equal("isActive", true))
  }

  const response = await appwriteServices.databases.listDocuments(
    config.databaseId,
    config.recSponsorCategoriesCollectionId,
    queries
  )

  return {
    ...response,
    documents: response.documents.map((category, index) => normalizeCategory(category, index)),
  }
}

export const getSponsorsByConference = async (conferenceId, appwriteServices, options = {}) => {
  const queries = [
    Query.equal("conferenceId", conferenceId),
    Query.orderAsc("displayOrder"),
    Query.orderAsc("name"),
    Query.limit(options.limit || 500),
  ]

  if (!options.includeInactive) {
    queries.splice(1, 0, Query.equal("isActive", true))
  }

  const response = await appwriteServices.databases.listDocuments(
    config.databaseId,
    config.recSponsorsCollectionId,
    queries
  )

  return {
    ...response,
    documents: response.documents.map((sponsor, index) => normalizeSponsor(sponsor, index)),
  }
}

export const getConferenceSponsorsSetup = async (conferenceId, appwriteServices, options = {}) => {
  const [categoriesResponse, sponsorsResponse] = await Promise.all([
    getSponsorCategoriesByConference(conferenceId, appwriteServices, options),
    getSponsorsByConference(conferenceId, appwriteServices, options),
  ])

  return {
    categories: categoriesResponse.documents,
    sponsors: sponsorsResponse.documents,
  }
}

export const groupSponsorsByCategory = (categories = [], sponsors = []) => {
  const categoryMap = new Map()
  const activeCategories = [...categories].sort(sortByDisplayOrder)

  activeCategories.forEach((category) => {
    categoryMap.set(category.$id || category.localId, {
      category,
      sponsors: [],
    })
  })

  const uncategorized = {
    category: {
      $id: "uncategorized",
      localId: "uncategorized",
      name: "Other Sponsors",
      accentColor: "#64748b",
      displayOrder: 9999,
      isActive: true,
    },
    sponsors: [],
  }

  sponsors
    .filter((sponsor) => sponsor.isActive !== false)
    .sort(sortByDisplayOrder)
    .forEach((sponsor) => {
      const target = sponsor.categoryId && categoryMap.get(sponsor.categoryId)
      if (target) target.sponsors.push(sponsor)
      else uncategorized.sponsors.push(sponsor)
    })

  const grouped = [...categoryMap.values()].filter((group) => group.sponsors.length > 0)
  if (uncategorized.sponsors.length > 0) grouped.push(uncategorized)
  return grouped
}

export const saveConferenceSponsorsSetup = async (
  conferenceId,
  categories = [],
  sponsors = [],
  appwriteServices,
  logoFilesBySponsor = {}
) => {
  const now = new Date().toISOString()
  const categoryIdMap = new Map()
  const normalizedCategories = categories.map(normalizeCategory)
  const normalizedSponsors = sponsors.map(normalizeSponsor)

  for (const category of normalizedCategories) {
    const sourceId = category.$id || category.localId

    if (category._delete) {
      if (isPersistedId(category.$id)) {
        await appwriteServices.databases.deleteDocument(
          config.databaseId,
          config.recSponsorCategoriesCollectionId,
          category.$id
        )
      }
      continue
    }

    if (!category.name) continue

    const payload = compactDocument({
      ...category,
      conferenceId,
      slug: category.slug || toSlug(category.name),
      updatedAt: now,
      createdAt: category.createdAt || now,
    }, CATEGORY_FIELDS)

    let savedCategory
    if (isPersistedId(category.$id)) {
      savedCategory = await appwriteServices.databases.updateDocument(
        config.databaseId,
        config.recSponsorCategoriesCollectionId,
        category.$id,
        payload
      )
    } else {
      savedCategory = await appwriteServices.databases.createDocument(
        config.databaseId,
        config.recSponsorCategoriesCollectionId,
        ID.unique(),
        payload
      )
    }

    categoryIdMap.set(sourceId, savedCategory.$id)
    categoryIdMap.set(savedCategory.$id, savedCategory.$id)
  }

  for (const sponsor of normalizedSponsors) {
    if (sponsor._delete) {
      if (isPersistedId(sponsor.$id)) {
        await appwriteServices.databases.deleteDocument(
          config.databaseId,
          config.recSponsorsCollectionId,
          sponsor.$id
        )
      }
      continue
    }

    if (!sponsor.name) continue

    const sourceId = sponsor.$id || sponsor.localId
    const logoFile = logoFilesBySponsor?.[sourceId] || logoFilesBySponsor?.[sponsor.localId]
    let logoData = {}

    if (logoFile) {
      logoData = await uploadSponsorLogo(logoFile, appwriteServices)
    }

    const resolvedCategoryId = sponsor.categoryId ? categoryIdMap.get(sponsor.categoryId) || sponsor.categoryId : null
    const payload = compactDocument({
      ...sponsor,
      conferenceId,
      categoryId: resolvedCategoryId,
      logoUrl: logoData.fileUrl || sponsor.logoUrl,
      logoFileId: logoData.fileId || sponsor.logoFileId,
      updatedAt: now,
      createdAt: sponsor.createdAt || now,
    }, SPONSOR_FIELDS)

    if (isPersistedId(sponsor.$id)) {
      await appwriteServices.databases.updateDocument(
        config.databaseId,
        config.recSponsorsCollectionId,
        sponsor.$id,
        payload
      )
    } else {
      await appwriteServices.databases.createDocument(
        config.databaseId,
        config.recSponsorsCollectionId,
        ID.unique(),
        payload
      )
    }
  }

  return getConferenceSponsorsSetup(conferenceId, appwriteServices, { includeInactive: true })
}
