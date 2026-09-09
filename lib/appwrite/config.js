// REC-only Appwrite configuration. Values come from `.env` / `.env.local`.

export const config = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID,

  recConferenceBucketId: process.env.NEXT_PUBLIC_REC_CONFERENCE_BUCKET_ID,
  recRegistrationsCollectionId: process.env.NEXT_PUBLIC_REC_REGISTRATIONS_COLLECTION_ID,
  recConferencesCollectionId: process.env.NEXT_PUBLIC_REC_CONFERENCES_COLLECTION_ID,
  recCouponsCollectionId: process.env.NEXT_PUBLIC_REC_COUPONS_COLLECTION_ID,
  recRegistrationImportsCollectionId:
    process.env.REC_REGISTRATION_IMPORTS_COLLECTION_ID || "rec_registration_imports",
  recRegistrationImportRowsCollectionId:
    process.env.REC_REGISTRATION_IMPORT_ROWS_COLLECTION_ID || "rec_registration_import_rows",
  recRegistrationLocksCollectionId:
    process.env.REC_REGISTRATION_LOCKS_COLLECTION_ID || "rec_registration_locks",
  recSessionsCollectionId: process.env.NEXT_PUBLIC_REC_SESSIONS_COLLECTION_ID,
  recProgrammesCollectionId: process.env.NEXT_PUBLIC_REC_PROGRAMMES_COLLECTION_ID,
  recProgramTimeBlocksCollectionId: process.env.NEXT_PUBLIC_REC_PROGRAM_TIME_BLOCKS_COLLECTION_ID,
  recSponsorCategoriesCollectionId:
    process.env.NEXT_PUBLIC_REC_SPONSOR_CATEGORIES_COLLECTION_ID || "rec_sponsor_categories",
  recSponsorsCollectionId: process.env.NEXT_PUBLIC_REC_SPONSORS_COLLECTION_ID || "rec_sponsors",
  recMediaItemsCollectionId: process.env.NEXT_PUBLIC_REC_MEDIA_ITEMS_COLLECTION_ID || "rec_media_items",
  recConferenceReportsCollectionId:
    process.env.NEXT_PUBLIC_REC_CONFERENCE_REPORTS_COLLECTION_ID || "rec_conference_reports",
  recScanEventsCollectionId: process.env.NEXT_PUBLIC_REC_SCAN_EVENTS_COLLECTION_ID || "rec_scan_events",
  recScansCollectionId: process.env.NEXT_PUBLIC_REC_SCANS_COLLECTION_ID || "rec_scans",
  recBadgeTokensCollectionId: process.env.NEXT_PUBLIC_REC_BADGE_TOKENS_COLLECTION_ID || "rec_badge_tokens",
  recScannerOperatorsCollectionId:
    process.env.NEXT_PUBLIC_REC_SCANNER_OPERATORS_COLLECTION_ID || "rec_scanner_operators",
  recScannerOtpsCollectionId: process.env.NEXT_PUBLIC_REC_SCANNER_OTPS_COLLECTION_ID || "rec_scanner_otps",
  recScannerSessionsCollectionId:
    process.env.NEXT_PUBLIC_REC_SCANNER_SESSIONS_COLLECTION_ID || "rec_scanner_sessions",
  recScannerAllocationsCollectionId:
    process.env.NEXT_PUBLIC_REC_SCANNER_ALLOCATIONS_COLLECTION_ID || "scanner_allocations",
  recEventScansCollectionId:
    process.env.NEXT_PUBLIC_REC_EVENT_SCANS_COLLECTION_ID || "event_scans",
  recSessionCrossFlagsCollectionId:
    process.env.NEXT_PUBLIC_REC_SESSION_CROSS_FLAGS_COLLECTION_ID || "session_cross_flags",
  recPublicSiteUrl:
    process.env.REC_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_REC_PUBLIC_SITE_URL ||
    "http://localhost:3000",

  recModule: "rec-conference",
}
