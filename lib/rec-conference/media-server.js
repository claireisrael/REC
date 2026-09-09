import { Query } from "node-appwrite"
import {
  createRestDocument,
  createRestFile,
  deleteRestDocument,
  deleteRestFile,
  getRestDocument,
  getRestFileViewUrl,
  listRestDocuments,
  updateRestDocument,
} from "@/lib/appwrite/appwrite-rest-server"
import { config } from "@/lib/appwrite/config"

export const REC_MEDIA_TYPES = {
  IMAGE_ALBUM: "image_album",
  VIDEO: "video",
}

const MAX_SAMPLE_IMAGES = 4
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

export class RecMediaError extends Error {
  constructor(message, status = 400, code = "rec_media_error") {
    super(message)
    this.name = "RecMediaError"
    this.status = status
    this.code = code
  }
}

function assertCollectionConfigured(collectionId, label) {
  if (!collectionId) {
    throw new RecMediaError(`${label} collection is not configured.`, 500, "missing_collection")
  }
}

function assertBucketConfigured() {
  if (!config.recConferenceBucketId) {
    throw new RecMediaError("REC conference storage bucket is not configured.", 500, "missing_bucket")
  }
}

function nowIso() {
  return new Date().toISOString()
}

function text(value) {
  const trimmed = String(value || "").trim()
  return trimmed || ""
}

function nullableText(value) {
  const valueText = text(value)
  return valueText || null
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback
  if (typeof value === "boolean") return value
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase())
}

function compactData(data) {
  return Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined) acc[key] = value
    return acc
  }, {})
}

function slugify(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeMediaType(value) {
  return Object.values(REC_MEDIA_TYPES).includes(value) ? value : REC_MEDIA_TYPES.IMAGE_ALBUM
}

function validateHttpsUrl(value, label, { required = false } = {}) {
  const raw = text(value)
  if (!raw) {
    if (required) throw new RecMediaError(`${label} is required.`, 400, "missing_url")
    return null
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:") {
      throw new Error("Only HTTPS URLs are allowed.")
    }
    return url.toString()
  } catch {
    throw new RecMediaError(`${label} must be a valid HTTPS URL.`, 400, "invalid_url")
  }
}

export function parseSampleImagesJson(value) {
  if (!value) return []
  if (Array.isArray(value)) return normalizeSampleImages(value)
  try {
    return normalizeSampleImages(JSON.parse(value))
  } catch {
    return []
  }
}

function normalizeSampleImages(images = []) {
  return (Array.isArray(images) ? images : [])
    .map((image, index) => ({
      fileId: text(image.fileId),
      url: text(image.url),
      name: text(image.name),
      caption: text(image.caption),
      sortOrder: numberValue(image.sortOrder, index + 1),
    }))
    .filter((image) => image.fileId && image.url)
    .slice(0, MAX_SAMPLE_IMAGES)
}

function serializeSampleImages(images = []) {
  const normalized = normalizeSampleImages(images)
  const json = JSON.stringify(normalized)
  if (json.length > 4000) {
    throw new RecMediaError("Sample image metadata is too large.", 400, "sample_images_too_large")
  }
  return json
}

function resequenceSampleImages(images = []) {
  return normalizeSampleImages(images).map((image, index) => ({
    ...image,
    sortOrder: index + 1,
  }))
}

function publicMediaItem(doc) {
  if (!doc) return null
  const sampleImages = parseSampleImagesJson(doc.sampleImagesJson)
  return {
    $id: doc.$id,
    conferenceId: doc.conferenceId,
    mediaType: doc.mediaType,
    title: doc.title || "",
    slug: doc.slug || "",
    description: doc.description || "",
    externalUrl: doc.externalUrl || "",
    videoUrl: doc.videoUrl || "",
    thumbnailUrl: doc.thumbnailUrl || "",
    thumbnailFileId: doc.thumbnailFileId || "",
    sampleImages,
    coverImageUrl: doc.thumbnailUrl || sampleImages[0]?.url || "",
    displayOrder: doc.displayOrder || 0,
    isFeatured: doc.isFeatured === true,
    isPublished: doc.isPublished === true,
    createdBy: doc.createdBy || "",
    updatedBy: doc.updatedBy || "",
    createdAt: doc.createdAt || doc.$createdAt || "",
    updatedAt: doc.updatedAt || doc.$updatedAt || "",
  }
}

function parseFormPayload(formData) {
  return {
    conferenceId: text(formData.get("conferenceId")),
    mediaType: normalizeMediaType(text(formData.get("mediaType"))),
    title: text(formData.get("title")),
    slug: text(formData.get("slug")),
    description: text(formData.get("description")),
    externalUrl: text(formData.get("externalUrl")),
    videoUrl: text(formData.get("videoUrl")),
    thumbnailUrl: text(formData.get("thumbnailUrl")),
    displayOrder: numberValue(formData.get("displayOrder"), 0),
    isFeatured: booleanValue(formData.get("isFeatured"), false),
    isPublished: booleanValue(formData.get("isPublished"), false),
    keptImages: parseSampleImagesJson(formData.get("keptImagesJson")),
    imageFiles: formData
      .getAll("sampleImages")
      .filter((file) => file && typeof file.arrayBuffer === "function" && file.size > 0),
  }
}

function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new RecMediaError("Sample images must be JPEG, PNG, or WebP.", 400, "invalid_image_type")
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new RecMediaError("Each sample image must be 5MB or smaller.", 400, "image_too_large")
  }
}

async function uploadSampleImages(files = []) {
  assertBucketConfigured()
  const uploaded = []
  for (const file of files) {
    validateImageFile(file)
    const upload = await createRestFile(config.recConferenceBucketId, file, {
      permissions: ['read("any")'],
    })
    uploaded.push({
      fileId: upload.$id,
      url: getRestFileViewUrl(config.recConferenceBucketId, upload.$id),
      name: file.name || upload.name || "",
      caption: "",
      sortOrder: uploaded.length + 1,
    })
  }
  return uploaded
}

async function deleteSampleFiles(images = []) {
  assertBucketConfigured()
  await Promise.all(
    normalizeSampleImages(images).map((image) =>
      deleteRestFile(config.recConferenceBucketId, image.fileId).catch(() => null)
    )
  )
}

function validateMediaPayload(payload, sampleImages) {
  if (!payload.conferenceId) {
    throw new RecMediaError("Conference is required.", 400, "missing_conference")
  }
  if (!payload.title) {
    throw new RecMediaError("Title is required.", 400, "missing_title")
  }
  if (sampleImages.length > MAX_SAMPLE_IMAGES) {
    throw new RecMediaError("Image albums can only include up to 4 sample images.", 400, "too_many_images")
  }

  if (payload.mediaType === REC_MEDIA_TYPES.IMAGE_ALBUM) {
    payload.externalUrl = validateHttpsUrl(payload.externalUrl, "External album link", {
      required: payload.isPublished,
    })
    payload.videoUrl = null
    if (payload.isPublished && sampleImages.length === 0) {
      throw new RecMediaError("Published image albums need at least one sample image.", 400, "missing_sample_image")
    }
  }

  if (payload.mediaType === REC_MEDIA_TYPES.VIDEO) {
    payload.videoUrl = validateHttpsUrl(payload.videoUrl, "Video URL", {
      required: payload.isPublished,
    })
    payload.externalUrl = null
    sampleImages.length = 0
  }

  payload.thumbnailUrl = validateHttpsUrl(payload.thumbnailUrl, "Thumbnail URL")
}

export async function listRecMediaConferences() {
  assertCollectionConfigured(config.recConferencesCollectionId, "REC conferences")
  const result = await listRestDocuments(config.recConferencesCollectionId, [
    Query.orderDesc("year"),
    Query.limit(100),
  ])
  return {
    documents: result.documents || [],
    total: result.total || 0,
  }
}

async function listAllDocuments(collectionId, queries = []) {
  const documents = []
  let total = 0
  do {
    const result = await listRestDocuments(collectionId, [
      ...queries,
      Query.limit(100),
      Query.offset(documents.length),
    ])
    documents.push(...(result.documents || []))
    total = result.total || documents.length
  } while (documents.length < total)

  return documents
}

function conferenceSortValue(conference) {
  const year = Number(conference.year)
  if (Number.isFinite(year)) return year
  const startDate = Date.parse(conference.startDate || "")
  return Number.isFinite(startDate) ? startDate : 0
}

export async function listPublicRecMediaConferences() {
  assertCollectionConfigured(config.recConferencesCollectionId, "REC conferences")
  assertCollectionConfigured(config.recMediaItemsCollectionId, "REC media")

  const mediaItems = await listAllDocuments(config.recMediaItemsCollectionId, [
    Query.equal("isPublished", true),
  ])
  const mediaCounts = mediaItems.reduce((counts, item) => {
    counts.set(item.conferenceId, (counts.get(item.conferenceId) || 0) + 1)
    return counts
  }, new Map())

  if (!mediaCounts.size) {
    return { documents: [], total: 0 }
  }

  const conferences = await listAllDocuments(config.recConferencesCollectionId, [
    Query.orderDesc("year"),
  ])

  const documents = conferences
    .filter((conference) => mediaCounts.has(conference.$id))
    .map((conference) => ({
      ...conference,
      mediaCount: mediaCounts.get(conference.$id) || 0,
    }))
    .sort((a, b) => {
      if (a.isActive === true && b.isActive !== true) return -1
      if (b.isActive === true && a.isActive !== true) return 1
      return conferenceSortValue(b) - conferenceSortValue(a)
    })

  return {
    documents,
    total: documents.length,
  }
}

async function getActiveConference() {
  assertCollectionConfigured(config.recConferencesCollectionId, "REC conferences")
  const result = await listRestDocuments(config.recConferencesCollectionId, [
    Query.equal("isActive", true),
    Query.limit(1),
  ])
  return result.documents?.[0] || null
}

export async function listRecMediaItems({
  conferenceId,
  mediaType = "",
  publicOnly = false,
  featuredOnly = false,
  page = 1,
  limit = 25,
} = {}) {
  assertCollectionConfigured(config.recMediaItemsCollectionId, "REC media")
  let resolvedConferenceId = text(conferenceId)
  if (!resolvedConferenceId && publicOnly) {
    const activeConference = await getActiveConference()
    resolvedConferenceId = activeConference?.$id || ""
  }
  if (!resolvedConferenceId) {
    throw new RecMediaError("Conference is required.", 400, "missing_conference")
  }

  const safePage = Math.max(1, Number.parseInt(page, 10) || 1)
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25))
  const queries = [
    Query.equal("conferenceId", resolvedConferenceId),
    Query.orderAsc("displayOrder"),
    Query.limit(safeLimit),
    Query.offset((safePage - 1) * safeLimit),
  ]
  const normalizedType = text(mediaType)
  if (Object.values(REC_MEDIA_TYPES).includes(normalizedType)) {
    queries.splice(1, 0, Query.equal("mediaType", normalizedType))
  }
  if (publicOnly) queries.splice(1, 0, Query.equal("isPublished", true))
  if (featuredOnly) queries.splice(1, 0, Query.equal("isFeatured", true))

  const result = await listRestDocuments(config.recMediaItemsCollectionId, queries)
  const total = result.total || 0
  return {
    documents: (result.documents || []).map(publicMediaItem),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  }
}

export async function createRecMediaItem(formData, actorId) {
  assertCollectionConfigured(config.recMediaItemsCollectionId, "REC media")
  const payload = parseFormPayload(formData)
  if (payload.mediaType === REC_MEDIA_TYPES.VIDEO && payload.imageFiles.length) {
    throw new RecMediaError("Videos use links only. Remove image uploads before saving.", 400, "video_files_not_allowed")
  }
  if (payload.imageFiles.length > MAX_SAMPLE_IMAGES) {
    throw new RecMediaError("Image albums can only include up to 4 sample images.", 400, "too_many_images")
  }
  const uploadedImages = payload.mediaType === REC_MEDIA_TYPES.IMAGE_ALBUM
    ? await uploadSampleImages(payload.imageFiles)
    : []
  const sampleImages = resequenceSampleImages(uploadedImages)

  try {
    validateMediaPayload(payload, sampleImages)
    const timestamp = nowIso()
    const data = compactData({
      conferenceId: payload.conferenceId,
      mediaType: payload.mediaType,
      title: payload.title,
      slug: nullableText(payload.slug || slugify(payload.title)),
      description: nullableText(payload.description),
      externalUrl: payload.externalUrl,
      videoUrl: payload.videoUrl,
      thumbnailUrl: payload.thumbnailUrl,
      thumbnailFileId: null,
      sampleImagesJson: serializeSampleImages(sampleImages),
      displayOrder: payload.displayOrder,
      isFeatured: payload.isFeatured,
      isPublished: payload.isPublished,
      createdBy: actorId || "",
      updatedBy: actorId || "",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return publicMediaItem(await createRestDocument(config.recMediaItemsCollectionId, data))
  } catch (error) {
    await deleteSampleFiles(uploadedImages)
    throw error
  }
}

export async function updateRecMediaItem(mediaId, formData, actorId) {
  assertCollectionConfigured(config.recMediaItemsCollectionId, "REC media")
  const existing = await getRestDocument(config.recMediaItemsCollectionId, mediaId)
  if (!existing) throw new RecMediaError("Media item was not found.", 404, "media_not_found")

  const payload = parseFormPayload(formData)
  payload.conferenceId = payload.conferenceId || existing.conferenceId
  const existingImages = parseSampleImagesJson(existing.sampleImagesJson)
  const existingIds = new Set(existingImages.map((image) => image.fileId))
  const keptImages = payload.keptImages.filter((image) => existingIds.has(image.fileId))
  const keptIds = new Set(keptImages.map((image) => image.fileId))
  const removedImages = existingImages.filter((image) => !keptIds.has(image.fileId))
  if (payload.mediaType === REC_MEDIA_TYPES.VIDEO && payload.imageFiles.length) {
    throw new RecMediaError("Videos use links only. Remove image uploads before saving.", 400, "video_files_not_allowed")
  }
  if (keptImages.length + payload.imageFiles.length > MAX_SAMPLE_IMAGES) {
    throw new RecMediaError("Image albums can only include up to 4 sample images.", 400, "too_many_images")
  }
  const uploadedImages = payload.mediaType === REC_MEDIA_TYPES.IMAGE_ALBUM
    ? await uploadSampleImages(payload.imageFiles)
    : []
  const sampleImages = resequenceSampleImages([...keptImages, ...uploadedImages])

  try {
    validateMediaPayload(payload, sampleImages)
    const data = compactData({
      conferenceId: payload.conferenceId,
      mediaType: payload.mediaType,
      title: payload.title,
      slug: nullableText(payload.slug || slugify(payload.title)),
      description: nullableText(payload.description),
      externalUrl: payload.externalUrl,
      videoUrl: payload.videoUrl,
      thumbnailUrl: payload.thumbnailUrl,
      sampleImagesJson: serializeSampleImages(sampleImages),
      displayOrder: payload.displayOrder,
      isFeatured: payload.isFeatured,
      isPublished: payload.isPublished,
      updatedBy: actorId || "",
      updatedAt: nowIso(),
    })
    const updated = await updateRestDocument(config.recMediaItemsCollectionId, mediaId, data)
    await deleteSampleFiles(removedImages)
    if (payload.mediaType === REC_MEDIA_TYPES.VIDEO) await deleteSampleFiles(existingImages)
    return publicMediaItem(updated)
  } catch (error) {
    await deleteSampleFiles(uploadedImages)
    throw error
  }
}

export async function deleteRecMediaItem(mediaId) {
  assertCollectionConfigured(config.recMediaItemsCollectionId, "REC media")
  const existing = await getRestDocument(config.recMediaItemsCollectionId, mediaId)
  if (!existing) throw new RecMediaError("Media item was not found.", 404, "media_not_found")
  await deleteSampleFiles(parseSampleImagesJson(existing.sampleImagesJson))
  if (existing.thumbnailFileId) {
    await deleteRestFile(config.recConferenceBucketId, existing.thumbnailFileId).catch(() => null)
  }
  await deleteRestDocument(config.recMediaItemsCollectionId, mediaId)
  return { success: true }
}
