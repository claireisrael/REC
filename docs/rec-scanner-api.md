# REC Scanner API

The REC scanner API is designed for the HR portal scanner UI and for external scanner applications. Scanner users do not need normal HR portal accounts. Administrators add their email under REC scanning setup, then scanners sign in with an emailed one-time code.

For the full public REC API reference, including public media and digital badge endpoints, see [rec-public-api.md](rec-public-api.md).

All scanner integration endpoints are versioned under:

```text
/api/v1/rec/scanner
```

Admin setup endpoints live under:

```text
/api/rec/scanning
```

Admin endpoints require an authenticated HR server session with REC manage access or Senior Manager access. Scanner endpoints use a bearer token returned by OTP verification.

## Authentication Flow

### 1. Lookup Eligible Conferences

```http
GET /api/v1/rec/scanner/auth/request-otp?email=scanner@example.com
```

Response:

```json
{
  "conferences": [
    {
      "$id": "conference_id",
      "year": 2026,
      "title": "Renewable Energy Conference & Expo 2026",
      "days": []
    }
  ]
}
```

### 2. Request OTP

```http
POST /api/v1/rec/scanner/auth/request-otp
Content-Type: application/json
```

Body:

```json
{
  "email": "scanner@example.com",
  "conferenceId": "conference_id"
}
```

Response:

```json
{
  "success": true,
  "otpId": "uuid",
  "email": "scanner@example.com",
  "conference": {
    "$id": "conference_id",
    "title": "Renewable Energy Conference & Expo 2026"
  }
}
```

The OTP expires after 10 minutes and is limited to five failed verification attempts.

### 3. Verify OTP

```http
POST /api/v1/rec/scanner/auth/verify-otp
Content-Type: application/json
```

Body:

```json
{
  "email": "scanner@example.com",
  "conferenceId": "conference_id",
  "otpId": "uuid",
  "code": "123456",
  "deviceId": "device-uuid",
  "deviceLabel": "iPhone Safari"
}
```

Response:

```json
{
  "success": true,
  "token": "scanner-bearer-token",
  "expiresAt": "2026-10-19T23:00:00.000Z",
  "operator": {
    "$id": "operator_id",
    "email": "scanner@example.com",
    "name": "Scanner User"
  },
  "conference": {
    "$id": "conference_id",
    "title": "Renewable Energy Conference & Expo 2026"
  }
}
```

Store the token securely on the scanner device and send it as:

```http
Authorization: Bearer scanner-bearer-token
```

## Scanner Operations

### Current Scanner Profile

```http
GET /api/v1/rec/scanner/auth/me
Authorization: Bearer scanner-bearer-token
```

### List Assigned Scan Events

```http
GET /api/v1/rec/scanner/events
Authorization: Bearer scanner-bearer-token
```

Response:

```json
{
  "documents": [
    {
      "$id": "event_id",
      "name": "Lunch - Day 1",
      "type": "lunch",
      "scanRule": "once_per_event",
      "day": 1,
      "venue": "Main Dining Area",
      "startTime": "2026-10-19T13:00:00+03:00",
      "endTime": "2026-10-19T14:00:00+03:00",
      "isCurrentlyOpen": true,
      "availabilityCode": "event_open"
    }
  ],
  "total": 1
}
```

### Submit Scan

```http
POST /api/v1/rec/scanner/scans
Authorization: Bearer scanner-bearer-token
Content-Type: application/json
```

Body:

```json
{
  "eventId": "event_id",
  "qrPayload": "REC-2026-123456",
  "clientNonce": "unique-device-request-id",
  "deviceId": "device-uuid",
  "deviceLabel": "Samsung Chrome"
}
```

`qrPayload` accepts the QR payload, the public badge link, the secure raw token, or the displayed manual badge number.

Accepted response:

```json
{
  "status": "accepted",
  "reason": "ok",
  "registration": {
    "$id": "registration_id",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "organization": "Example Energy"
  },
  "event": {
    "$id": "event_id",
    "name": "Lunch - Day 1"
  }
}
```

Duplicate response:

```json
{
  "status": "duplicate",
  "reason": "duplicate_event",
  "registration": {
    "$id": "registration_id",
    "name": "Jane Doe"
  },
  "previousScan": {
    "$id": "scan_id",
    "scannedAt": "2026-10-19T10:30:00.000Z"
  }
}
```

For `once_per_event` and `once_per_day`, duplicate scans are returned to the caller but are not written as additional scan records. For `multiple`, every valid scan is accepted and recorded.

Rejected scans return a non-2xx response with an error code such as:

```json
{
  "error": "The badge QR is invalid or inactive.",
  "code": "invalid_token"
}
```

Common error codes:

- `scanner_session_expired`
- `scanner_inactive`
- `scanner_event_denied`
- `event_inactive`
- `event_not_started`
- `event_ended`
- `invalid_token`
- `wrong_conference`
- `registration_wrong_conference`
- `registration_type_not_allowed`
- `registration_day_not_allowed`

### Logout

```http
POST /api/v1/rec/scanner/auth/logout
Authorization: Bearer scanner-bearer-token
```

## Admin APIs

Admin APIs require HR portal authentication and REC manage access.

```text
GET  /api/rec/scanning/conferences
GET  /api/rec/scanning/events?conferenceId=...&page=1&limit=25
POST /api/rec/scanning/events
PATCH /api/rec/scanning/events/{eventId}
DELETE /api/rec/scanning/events/{eventId}
POST /api/rec/scanning/events/default
GET  /api/rec/scanning/operators?conferenceId=...
POST /api/rec/scanning/operators
POST /api/rec/scanning/tokens/issue
GET  /api/rec/scanning/badges?conferenceId=...&status=without_badge&page=1&limit=25
POST /api/rec/scanning/badges/issue
POST /api/rec/scanning/badges/revoke
GET  /api/rec/scanning/analytics?conferenceId=...
```

### Badge Registry

`GET /api/rec/scanning/badges` returns a paginated registry of registrations joined with their badge-token status.

Supported `status` values:

- `without_badge`
- `with_badge`
- `revoked`
- `all`

Bulk issue and email:

```http
POST /api/rec/scanning/badges/issue
Content-Type: application/json
```

```json
{
  "conferenceId": "conference_id",
  "registrationIds": ["registration_id_1", "registration_id_2"],
  "sendEmail": true
}
```

Revoke:

```http
POST /api/rec/scanning/badges/revoke
Content-Type: application/json
```

```json
{
  "conferenceId": "conference_id",
  "registrationId": "registration_id",
  "tokenId": "badge_token_id",
  "reason": "Badge replaced"
}
```

## QR Badge Payload

Badge QR codes contain an opaque token:

```text
rec:v1:<secure-token>
```

The database stores only a hash of that token. If a badge is lost, issue a new QR for the registration; the prior token is rotated and becomes unusable.

Each active badge also has a manual badge number such as:

```text
REC-2026-123456
```

Scanner apps can submit that badge number in `qrPayload` when camera scanning is not available.

## Digital Badge Display

Admins can email a secure public badge link to registrants:

```text
https://rec.nrep.ug/badge/<secure-token>
```

The public REC application resolves that token through the HR portal endpoint:

```http
GET /api/v1/rec/badges/{token}
```

The response contains sanitized registration details, conference details, and a QR image data URL. The token hash is never returned.

The public REC app also exposes same-origin proxy endpoints for scanner applications hosted on `rec.nrep.ug`:

```text
/api/scanner/auth/request-otp
/api/scanner/auth/verify-otp
/api/scanner/auth/me
/api/scanner/auth/logout
/api/scanner/events
/api/scanner/scans
/api/badges/{token}
```

## Security Notes

- Scanner users are scoped to a conference.
- Scanner operators can be restricted by event type, venue, day, or specific event IDs.
- OTPs and scanner sessions are stored hashed.
- Scan writes are server-side only.
- The QR payload does not expose the registrant email or registration document ID.
- Offline scanning is intentionally not enabled in this first version because duplicate enforcement across multiple devices requires live server validation.
