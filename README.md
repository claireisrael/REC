# REC-SYSTEM (extracted from NREP-HR-project)

Standalone **Renewable Energy Conference & Expo** app for local testing. The live HR portal in `NREP-HR-project` was not moved.

## Run locally

```powershell
cd C:\projects\NREP-MOBILE-APP\REC-SYSTEM
npm install
npm test
npm run dev
```

- `npm test` runs the REC rule tests (scanner, import, reports). These do **not** need Appwrite.
- `npm run dev` starts the Next.js app at [http://localhost:3000](http://localhost:3000). Auth is bypassed as a Senior Manager so you can click through REC without the HR login stack.

Fill `.env` with Appwrite project + REC collection IDs before using the UI or APIs. See `.env.example`.

## What’s inside

| Path | Contents |
|---|---|
| `app/dashboard/rec-conference/` | Admin UI pages |
| `app/rec-scanner/` | Scanner web page |
| `app/api/rec/` | Internal REC APIs |
| `app/api/v1/rec/` | Public/v1 REC APIs |
| `components/rec-registration/` | REC React components |
| `lib/rec-conference/` | Core REC business logic |
| `lib/appwrite/` | Appwrite helpers + REC-only config |
| `lib/auth/` | Test-harness auth (full HR login is not copied) |
| `tests/rec-*.mjs` | REC unit tests |

## Test-harness limits

This is a REC-only shell, not a clone of the HR portal:

- You are always treated as a Senior Manager (no login page).
- Module-permission user management has no HR users collection.
- Confirmation emails still need `NEXT_PUBLIC_API_BASE_URL` pointing at the email API.

## Sync note

If you change REC in `NREP-HR-project`, re-copy into this folder (or the other way around) to stay in sync.
