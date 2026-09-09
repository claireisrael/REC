# REC Public API Reference

This document covers the public API surface under `app/api/v1` for external REC integrations, including public media, previous conference reports, digital badge lookup, scanner OTP access, scanner events, and badge scans.

The examples use `{HR_BASE_URL}` as the deployed HR portal origin, for example:

```text
https://hr.nrep.ug
```

All endpoints are prefixed with:

```text
{HR_BASE_URL}/api/v1
```

## General Conventions

### Content Type

Send JSON request bodies with:

```http
Content-Type: application/json
```

Most responses are JSON.

### Authentication

The public API has two access modes:

- Public unauthenticated endpoints for published media and digital badge display.
- Scanner endpoints protected by a scanner bearer token issued through the OTP flow.

Scanner endpoints require:

```http
Authorization: Bearer <scanner-token>
```

Do not put scanner tokens in URLs. Store them securely on the scanner client and clear them on logout.

### Timestamps

Timestamps are ISO 8601 strings. Client applications should format times for their target timezone. REC scanner and program UI normally displays conference times in Africa/Kampala.

### Paginated Responses

Paginated endpoints use this shape:

```json
{
  "documents": [],
  "total": 0,
  "page": 1,
  "limit": 25,
  "totalPages": 1
}
```

### Error Responses

Errors normally use:

```json
{
  "error": "Human readable message",
  "code": "machine_readable_code",
  "details": {}
}
```

Some generic server errors may only return:

```json
{
  "error": "Failed to complete request"
}
```

Integrations should handle both forms.

## Public Media

These endpoints are designed for public REC websites and other public displays. They only return published media.

### List Conferences With Media

```http
GET /api/v1/rec/media/conferences
```

Returns REC conferences that have published media. Active conferences are ordered first, followed by previous conferences.

Caching:

```http
Cache-Control: public, max-age=60, s-maxage=300
```

Example:

```js
const response = await fetch(`${HR_BASE_URL}/api/v1/rec/media/conferences`);
const data = await response.json();
```

Response:

```json
{
  "documents": [
    {
      "$id": "6863b66...",
      "title": "Renewable Energy Conference & Expo 2026",
      "shortName": "REC 2026",
      "year": 2026,
      "startDate": "2026-10-19",
      "endDate": "2026-10-22",
      "isActive": true,
      "mediaCount": 6
    }
  ],
  "total": 1,
  "siteConference": {
    "$id": "active_conference_id",
    "year": 2026,
    "title": "Renewable Energy Conference & Expo 2026",
    "isActive": true
  }
}
```

`siteConference` contains public branding, contact, registration, and website-configuration fields for the active conference. It lets public clients render consistent navigation and branding even when the report archive is empty.

The conference object is the REC conference document plus `mediaCount`. External clients should rely only on stable display fields such as `$id`, `title`, `shortName`, `year`, `startDate`, `endDate`, `isActive`, and `mediaCount`.

### List Public Media Items

```http
GET /api/v1/rec/media
```

Query parameters:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `conferenceId` | string | No | Conference to load media for. If omitted, the active conference is used. |
| `type` | string | No | `image_album` or `video`. |
| `featured` | boolean | No | Use `true` to return featured items only. |
| `page` | number | No | Page number. Defaults to `1`. |
| `limit` | number | No | Page size. Defaults to `25`, maximum `100`. |

Caching:

```http
Cache-Control: public, max-age=60, s-maxage=300
```

Example:

```js
const params = new URLSearchParams({
  conferenceId: "6863b66...",
  page: "1",
  limit: "100"
});

const response = await fetch(`${HR_BASE_URL}/api/v1/rec/media?${params}`);
const data = await response.json();
```

Response:

```json
{
  "documents": [
    {
      "$id": "media_item_id",
      "conferenceId": "6863b66...",
      "mediaType": "image_album",
      "title": "Opening Day Highlights",
      "slug": "opening-day-highlights",
      "description": "Selected photos from the opening day.",
      "externalUrl": "https://photos.example.com/album",
      "videoUrl": "",
      "thumbnailUrl": "",
      "thumbnailFileId": "",
      "sampleImages": [
        {
          "fileId": "storage_file_id",
          "url": "https://hr.nrep.ug/api/...",
          "name": "opening.jpg",
          "caption": "Opening ceremony",
          "sortOrder": 1
        }
      ],
      "coverImageUrl": "https://hr.nrep.ug/api/...",
      "displayOrder": 1,
      "isFeatured": true,
      "isPublished": true,
      "createdBy": "user_id",
      "updatedBy": "user_id",
      "createdAt": "2026-10-19T08:00:00.000Z",
      "updatedAt": "2026-10-19T08:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 100,
  "totalPages": 1
}
```

Media rules:

- `image_album` items include up to 4 sample images for display and an `externalUrl` for the full album.
- `video` items use `videoUrl`; videos are linked, not uploaded.
- Public responses only include published records.

## Previous Conference Reports

Report endpoints are public and unauthenticated. They only return published links belonging to conferences whose configured end date has passed.

### List Conferences With Reports

```http
GET /api/v1/rec/reports/conferences
```

Returns completed conferences that have at least one published report. Conferences are ordered from newest to oldest.

Response:

```json
{
  "documents": [
    {
      "$id": "conference_id",
      "year": 2025,
      "title": "Renewable Energy Conference & Expo 2025",
      "shortName": "REC 2025",
      "startDate": "2025-10-20T00:00:00.000Z",
      "endDate": "2025-10-22T00:00:00.000Z",
      "reportCount": 2
    }
  ],
  "total": 1
}
```

### List Published Reports

```http
GET /api/v1/rec/reports
```

Query parameters:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `conferenceId` | string | No | Completed conference to load. If omitted, the newest conference with published reports is selected. |
| `type` | string | No | `conference_report`, `proceedings`, `outcomes`, `communique`, or `other`. |
| `page` | number | No | Page number. Defaults to `1`. |
| `limit` | number | No | Page size. Defaults to `12`, maximum `100`. |

Response:

```json
{
  "documents": [
    {
      "$id": "report_id",
      "conferenceId": "conference_id",
      "reportType": "conference_report",
      "title": "REC 2025 Conference Report",
      "summary": "Official outcomes and recommendations from REC 2025.",
      "reportUrl": "https://nrep.ug/reports/rec-2025.pdf",
      "coverImageUrl": "https://nrep.ug/images/rec-2025-report.jpg",
      "publicationDate": "2026-01-15T00:00:00.000Z",
      "displayOrder": 1,
      "isFeatured": true,
      "isPublished": true,
      "conference": {
        "$id": "conference_id",
        "year": 2025,
        "title": "Renewable Energy Conference & Expo 2025"
      }
    }
  ],
  "conference": {
    "$id": "conference_id",
    "year": 2025,
    "reportCount": 1
  },
  "total": 1,
  "page": 1,
  "limit": 12,
  "totalPages": 1
}
```

Report links and optional cover images are validated as HTTPS URLs before storage.

### Get The Previous Conference Report

```http
GET /api/v1/rec/reports/featured?conferenceId={currentConferenceId}
```

Returns the preferred published report from the newest completed conference before the supplied conference. This endpoint is intended for program-page call-to-action sections.

If no qualifying report exists, the endpoint still returns `200`:

```json
{
  "report": null,
  "conference": null
}
```

All report endpoints use:

```http
Cache-Control: public, max-age=60, s-maxage=300
```

## Digital Badges

Digital badges let a registered attendee display conference details, attendee details, and a QR code for scanning.

### Get Badge Details

```http
GET /api/v1/rec/badges/{token}
```

`token` can be the secure badge token from a badge link or QR payload. The resolver also supports badge number lookup for manual fallback flows.

No authentication is required.

Caching:

```http
Cache-Control: no-store
```

Example:

```js
const response = await fetch(`${HR_BASE_URL}/api/v1/rec/badges/${encodeURIComponent(token)}`);
const badge = await response.json();
```

Response:

```json
{
  "badge": {
    "$id": "badge_document_id",
    "conferenceId": "6863b66...",
    "registrationId": "registration_document_id",
    "badgeNumber": "REC2026123456",
    "badgeNumberLabel": "REC-2026-123456",
    "tokenVersion": 1,
    "issuedAt": "2026-10-01T08:00:00.000Z",
    "issuedBy": "user_id",
    "revokedAt": "",
    "revokedBy": "",
    "revokedReason": "",
    "lastUsedAt": "",
    "lastEmailSentAt": "2026-10-01T08:05:00.000Z",
    "lastEmailSentTo": "attendee@example.com",
    "lastEmailStatus": "sent",
    "lastBadgeUrl": "https://rec.nrep.ug/badge/secure-token",
    "isActive": true
  },
  "qrPayload": "rec:v1:secure-token",
  "qrDataUrl": "data:image/png;base64,...",
  "badgeUrl": "https://rec.nrep.ug/badge/secure-token",
  "conference": {
    "$id": "6863b66...",
    "year": 2026,
    "title": "Renewable Energy Conference & Expo 2026",
    "shortName": "REC 2026",
    "startDate": "2026-10-19",
    "endDate": "2026-10-22",
    "location": "Kampala, Uganda",
    "venue": "Conference venue",
    "days": [],
    "isActive": true
  },
  "registration": {
    "$id": "registration_document_id",
    "name": "Attendee Name",
    "email": "attendee@example.com",
    "organization": "Organization",
    "sponsorOrganization": "Coupon Sponsor Organization",
    "sponsorSector": "Private",
    "registrationType": "Delegate",
    "country": "Uganda",
    "daysAttending": ["Day 1", "Day 2"],
    "conferenceYears": [2026]
  }
}
```

Common errors:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `invalid_badge` | Badge token or number is missing or invalid. |
| `404` | `badge_registration_missing` | Badge exists but the linked registration cannot be found. |
| `500` | none | Badge lookup failed unexpectedly. |

## Scanner Authentication

External scanner users authenticate with their email address and a one-time password. Scanner users are managed from the HR portal admin side.

Scanner sessions currently expire after 18 hours. OTP codes currently expire after 10 minutes and have a limited number of verification attempts.

### Find Eligible Conferences For Scanner Email

```http
GET /api/v1/rec/scanner/auth/request-otp?email={email}
```

Use this before requesting an OTP when the scanner application needs to show which conferences the email is allowed to access.

No bearer token is required.

Response:

```json
{
  "conferences": [
    {
      "$id": "6863b66...",
      "year": 2026,
      "title": "Renewable Energy Conference & Expo 2026",
      "shortName": "REC 2026",
      "days": []
    }
  ]
}
```

### Request Scanner OTP

```http
POST /api/v1/rec/scanner/auth/request-otp
```

Body:

```json
{
  "email": "scanner@example.com",
  "conferenceId": "6863b66..."
}
```

Response:

```json
{
  "success": true,
  "otpId": "otp_document_id",
  "conference": {
    "$id": "6863b66...",
    "year": 2026,
    "title": "Renewable Energy Conference & Expo 2026",
    "shortName": "REC 2026",
    "days": []
  },
  "email": "scanner@example.com"
}
```

The OTP is sent by email. The API captures request IP address and user agent for audit/security context.

Common errors:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `validation_error` | Email or conference id is missing. |
| `403` | `scanner_not_allowed` | Email is not allowed to scan for the selected conference. |

### Verify Scanner OTP

```http
POST /api/v1/rec/scanner/auth/verify-otp
```

Body:

```json
{
  "email": "scanner@example.com",
  "conferenceId": "6863b66...",
  "otpId": "otp_document_id",
  "code": "123456",
  "deviceId": "optional-device-id",
  "deviceLabel": "iPhone Safari"
}
```

Response:

```json
{
  "success": true,
  "token": "scanner-session-token",
  "expiresAt": "2026-10-20T08:00:00.000Z",
  "sessionId": "session_document_id",
  "operator": {
    "$id": "operator_document_id",
    "email": "scanner@example.com",
    "name": "Scanner Name",
    "conferenceId": "6863b66..."
  },
  "conference": {
    "$id": "6863b66...",
    "year": 2026,
    "title": "Renewable Energy Conference & Expo 2026",
    "shortName": "REC 2026",
    "days": []
  }
}
```

Use the returned `token` as the bearer token for scanner endpoints.

Common errors:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `validation_error` | Required fields are missing. |
| `400` | `otp_expired` | OTP has expired. |
| `400` | `otp_invalid` | Code is wrong. |
| `429` | `otp_attempts_exceeded` | Too many failed verification attempts. |
| `403` | `scanner_not_allowed` | Scanner is inactive or no longer allowed. |

### Get Current Scanner Session

```http
GET /api/v1/rec/scanner/auth/me
Authorization: Bearer <scanner-token>
```

Response:

```json
{
  "operator": {
    "$id": "operator_document_id",
    "email": "scanner@example.com",
    "name": "Scanner Name",
    "conferenceId": "6863b66..."
  },
  "conference": {
    "$id": "6863b66...",
    "year": 2026,
    "title": "Renewable Energy Conference & Expo 2026",
    "shortName": "REC 2026",
    "days": []
  },
  "expiresAt": "2026-10-20T08:00:00.000Z"
}
```

Common errors:

| Status | Code | Meaning |
| --- | --- | --- |
| `401` | `missing_token` | Authorization header is missing. |
| `401` | `session_expired` | Token is expired or revoked. |

### Logout Scanner Session

```http
POST /api/v1/rec/scanner/auth/logout
Authorization: Bearer <scanner-token>
```

Response:

```json
{
  "success": true
}
```

The endpoint is intentionally tolerant. If the token is already missing or expired, clients can still clear local state.

## Scanner Events

Scanner events define where and when a badge may be scanned, for example main entrance, lunch, session entrance, or manually configured conference events.

### List Scanner Events

```http
GET /api/v1/rec/scanner/events
Authorization: Bearer <scanner-token>
```

Returns events the authenticated scanner is allowed to scan for their assigned conference. The server filters by scanner scope, including allowed event ids, event types, venues, and conference days.

Response:

```json
{
  "documents": [
    {
      "$id": "event_document_id",
      "conferenceId": "6863b66...",
      "programId": "program_document_id",
      "sessionId": "",
      "timeBlockId": "",
      "name": "Main Entrance",
      "type": "entrance",
      "day": "Day 1",
      "date": "2026-10-19",
      "startTime": "08:00",
      "endTime": "17:00",
      "venue": "Main Gate",
      "scanRule": "once_per_day",
      "allowedRegistrationTypes": [],
      "allowedDaysAttending": [],
      "isActive": true,
      "isCurrentlyOpen": true,
      "availabilityCode": "event_open",
      "availabilityMessage": "Scanning is open.",
      "sortOrder": 1,
      "createdAt": "2026-10-01T08:00:00.000Z",
      "updatedAt": "2026-10-01T08:00:00.000Z"
    }
  ],
  "total": 1
}
```

Important fields:

| Field | Description |
| --- | --- |
| `isCurrentlyOpen` | Whether the event can be scanned at the current time. |
| `availabilityCode` | Machine-readable availability state. |
| `availabilityMessage` | Human-readable state for display. |
| `scanRule` | Duplicate handling rule for the event. |

Scanner clients should still call `POST /scanner/scans` to enforce the rule. The `events` endpoint is for display and selection; enforcement happens server-side during scan creation.

## Badge Scans

### Submit Badge Scan

```http
POST /api/v1/rec/scanner/scans
Authorization: Bearer <scanner-token>
```

Body:

```json
{
  "eventId": "event_document_id",
  "qrPayload": "rec:v1:secure-token",
  "clientNonce": "optional-client-generated-id",
  "deviceId": "optional-device-id",
  "deviceLabel": "iPhone Safari",
  "manualOverrideReason": ""
}
```

`qrPayload` may be:

- The QR payload, for example `rec:v1:<token>`.
- The public badge link.
- The raw secure token.
- A badge number for manual fallback entry.

Accepted response:

```http
HTTP/1.1 201 Created
```

```json
{
  "status": "accepted",
  "reason": "ok",
  "event": {
    "$id": "event_document_id",
    "name": "Main Entrance",
    "type": "entrance",
    "day": "Day 1",
    "date": "2026-10-19",
    "startTime": "08:00",
    "endTime": "17:00",
    "venue": "Main Gate",
    "scanRule": "once_per_day",
    "isCurrentlyOpen": true
  },
  "registration": {
    "$id": "registration_document_id",
    "name": "Attendee Name",
    "email": "attendee@example.com",
    "organization": "Organization",
    "sponsorOrganization": "Coupon Sponsor Organization",
    "sponsorSector": "Private",
    "registrationType": "Delegate",
    "country": "Uganda",
    "daysAttending": ["Day 1"]
  },
  "attendance": {
    "registeredDays": ["Day 1"],
    "requiredDays": ["Day 1"],
    "matchedDays": ["Day 1"],
    "reason": "registration_day_allowed",
    "message": ""
  },
  "scan": {
    "$id": "scan_document_id",
    "scannedAt": "2026-10-19T08:30:00.000Z",
    "status": "accepted",
    "resultReason": "ok",
    "registrationDaysAttending": ["Day 1"],
    "eventAllowedDaysAttending": ["Day 1"],
    "matchedAttendanceDays": ["Day 1"]
  }
}
```

Duplicate response:

```http
HTTP/1.1 200 OK
```

```json
{
  "status": "duplicate",
  "reason": "duplicate_event",
  "event": {
    "$id": "event_document_id",
    "name": "Main Entrance"
  },
  "registration": {
    "$id": "registration_document_id",
    "name": "Attendee Name",
    "email": "attendee@example.com"
  },
  "attendance": {
    "registeredDays": ["Day 1"],
    "requiredDays": ["Day 1"],
    "matchedDays": ["Day 1"],
    "reason": "registration_day_allowed",
    "message": ""
  },
  "previousScan": {
    "$id": "previous_scan_document_id",
    "scannedAt": "2026-10-19T08:15:00.000Z",
    "status": "accepted"
  }
}
```

Rejected response:

```json
{
  "error": "This attendee is registered for Day 2, but this scan point requires Day 1.",
  "code": "registration_day_not_allowed",
  "details": {
    "attendance": {
      "registeredDays": ["Day 2"],
      "requiredDays": ["Day 1"],
      "matchedDays": [],
      "reason": "registration_day_not_allowed",
      "message": "This attendee is registered for Day 2, but this scan point requires Day 1."
    }
  }
}
```

Scan enforcement:

- The server verifies the scanner session and scanner scope.
- The scan event must be active and within its allowed time window.
- The badge must be active and linked to the same conference.
- The registration must satisfy event restrictions such as allowed registration types and days attending.
- Day-specific events use `allowedDaysAttending` when configured. If it is not configured, the server infers the required attendance day from the event `day` and the conference day configuration.
- Accepted and rejected scan records store attendance snapshots: `registrationDaysAttending`, `eventAllowedDaysAttending`, and `matchedAttendanceDays`.
- Duplicate behavior depends on the event's `scanRule`.
- Duplicate scans for non-repeatable rules are returned as duplicates and are not stored as additional accepted scan rows.
- Invalid or ineligible scans may be recorded as rejected audit rows.

Common errors:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `validation_error` | Required request data is missing. |
| `400` | `invalid_badge` | QR payload, token, or badge number is invalid. |
| `401` | `missing_token` | Scanner bearer token is missing. |
| `401` | `session_expired` | Scanner session is expired or revoked. |
| `403` | `scanner_not_allowed` | Scanner is not allowed to use this event. |
| `403` | `registration_not_allowed` | Registration does not satisfy event rules. |
| `404` | `event_not_found` | Event does not exist or is not available to the scanner. |
| `409` | `event_closed` | Event is not currently open for scanning. |

## Recommended Scanner Client Flow

1. Ask the scanner for their email address.
2. Call `GET /scanner/auth/request-otp?email=...` and let the scanner choose an eligible conference when needed.
3. Call `POST /scanner/auth/request-otp`.
4. Ask for the OTP code sent by email.
5. Call `POST /scanner/auth/verify-otp`.
6. Store the returned scanner token securely.
7. Call `GET /scanner/events` and display only available events.
8. Scan QR code or accept manual badge number fallback.
9. Call `POST /scanner/scans`.
10. Show the scan result immediately in a modal or full-screen confirmation.
11. Close the camera after a successful scan, then reopen only when the scanner chooses to scan another badge.
12. Call `POST /scanner/auth/logout` when the scanner signs out.

Example:

```js
async function verifyScannerOtp({ email, conferenceId, otpId, code }) {
  const response = await fetch(`${HR_BASE_URL}/api/v1/rec/scanner/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, conferenceId, otpId, code })
  });

  if (!response.ok) {
    throw new Error((await response.json()).error || "OTP verification failed");
  }

  return response.json();
}

async function submitScan({ token, eventId, qrPayload }) {
  const response = await fetch(`${HR_BASE_URL}/api/v1/rec/scanner/scans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      eventId,
      qrPayload,
      clientNonce: crypto.randomUUID()
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Scan failed");
  }

  return data;
}
```

## Public REC Website Proxy Routes

The public REC website may expose same-origin proxy routes that forward to the HR portal API. These are useful for browser clients hosted on `rec.nrep.ug`.

Known proxy routes include:

```text
/api/media/conferences
/api/media/public
/api/reports/conferences
/api/reports/public
/api/reports/featured
/api/badges/{token}
/api/scanner/auth/request-otp
/api/scanner/auth/verify-otp
/api/scanner/auth/me
/api/scanner/auth/logout
/api/scanner/events
/api/scanner/scans
```

External applications can call the HR portal `/api/v1` endpoints directly, or call the public website proxies when that application is intentionally integrated through the REC public site.

## Security Notes For Integrators

- Badge QR payloads should not contain attendee PII.
- Treat badge URLs and badge numbers as attendee credentials for conference display only, not as authentication credentials.
- Scanner bearer tokens authorize scanning actions. Do not log them or expose them in URLs.
- Always refresh scanner events after login and when switching conferences.
- Do not rely on client-side event time checks. The scan endpoint enforces time windows and eligibility.
- Manual badge number entry should be rate limited in client UX where possible and should only be used as a fallback when QR scanning fails.
- Public media endpoints return published content only, but external clients should still avoid exposing unpublished HR admin URLs or file ids from other contexts.
- Public report endpoints return published links for completed conferences only. External applications should still open those links with `noopener` and should not assume the external document host is controlled by the REC application.
