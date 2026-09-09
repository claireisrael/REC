# Shared dependencies for standalone REC

REC-SYSTEM now includes a **test-harness** copy of the pieces that used to live only in NREP-HR-project:

- `lib/appwrite/config.js` (REC keys only)
- `lib/appwrite/provider.js`
- `lib/appwrite/appwrite-rest-server.js`
- `lib/auth/auth-provider.js` (always Senior Manager)
- `lib/auth/server-auth.js` (always Senior Manager)
- `lib/auth/module-permissions-shared.js`
- `lib/auth/module-permissions-api-client.js` (stub; no HR users)
- `components/ui/portal-kit.js`
- `components/ui/RichTextEditor.js`
- `lib/utils.js` / `lib/utils/validation.js`

That is enough to run `npm test` and `npm run dev` here without booting the HR app.

It is **not** production HR auth. Do not deploy this shell as a replacement for the portal.
