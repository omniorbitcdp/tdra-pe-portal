# Architecture notes

## Why the app DB is the system of record
Requirements §3 and §12 are explicit: login records and account details live in the application database,
and Email/SMS/WhatsApp are *communication channels only*. So `app_users` is authoritative; tokens for
activation/reset are one-time and hashed; no channel is ever used as an identity store.

## Sequence enforcement is triple-layered
1. **Frontend** hides the next step until dependencies are met (good UX, but never trusted).
2. **API** re-checks with `src/lib/workflow.ts` (`canCreateHeader` / `canCreateTemplate` / `canCreateUrl`).
3. **Postgres triggers** (`enforce_sequence`) raise `SEQUENCE_VIOLATION` on any direct write that skips a step.

This satisfies "enforce in the UI and backend APIs, not only hide/show screens in the frontend" (§6).

## Provider-agnostic communications
`api_providers` rows describe an arbitrary HTTP integration (URL, method, headers, query, body template,
auth). `src/lib/apiRequest.ts` renders and executes them; `notify.ts` picks the default active provider per
channel. The same engine powers the admin test console, so what you test is exactly what the system sends.

## Sessions
`jose` signs an HS256 JWT carrying `{uid,email,role,entityId}` into an httpOnly cookie. Middleware verifies
it for page routes; API handlers verify it via `getSession()` + `guard()`. No server-side session table is
needed, and no secrets reach the browser.

## Storage
KYC files are uploaded server-side to the private `kyc-documents` bucket under `<entityId>/<docType>/…`.
Reviewers and owners receive 5-minute signed URLs; access is re-authorised on every request.
