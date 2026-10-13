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

## Fix: PE entity resolution after first profile save (v1.0.1)
The session JWT is minted at sign-in. A PE who created their entity profile *after* logging in
still carried `entityId: null`, so the dashboard, KYC upload and header/template/URL screens
appeared empty or refused the action.

Two complementary fixes:
1. `PUT /api/pe/profile` now **re-issues the session cookie** with the new `entityId` the moment
   the entity row is created (`setSessionCookie({ ...s, entityId: created.id })`).
2. `resolveEntityId(session)` in `src/lib/auth.ts` is used by every PE route as a **fallback**: if the
   token has no entityId, it reads `app_users.entity_id`, then `entities.created_by`. Existing
   sessions and DB-seeded users therefore work without re-login.

Immediate manual workaround for a session already in this state: sign out and sign in again.

## Fix: PE "Submit KYC for review" action (v1.0.2)
`PUT /api/pe/profile` saves details as `DRAFT`, and KYC document uploads also reset the entity to
`DRAFT` — but there was no action to move `DRAFT -> SUBMITTED`, so an approver saw
"Cannot move KYC from DRAFT to APPROVED." (the transition table correctly only allows DRAFT -> SUBMITTED).

Added:
- `POST /api/pe/kyc/submit` — PE submits/resubmits the pack. Gated by `canSubmitKycPack()`
  (all 12 mandatory entity fields filled AND all four TDRA documents uploaded).
  Moves `DRAFT -> SUBMITTED` or `CLARIFICATION_REQUIRED|REJECTED -> RESUBMITTED`.
- `/pe/kyc` now shows a submission-status panel with a readiness checklist and a
  **Submit KYC for review** button, disabled until the pack is complete.
- `tests/kycSubmit.test.ts` covers the gate (complete pack, missing docs, missing fields, approved guard, resubmission).

## v1.1 — bug sweep, reference IDs, performance & security hardening

**Reference IDs (new).** `entity_code` / `header_code` / `template_code` / `url_code` are assigned by a
Postgres trigger (`assign_ref_code`) using dedicated sequences, formatted `PE-000001`, `HDR-000001`,
`TPL-000001`, `URL-000001`. The PE sees their own **PE ID** on the dashboard, KYC page and profile; the
operator sees it in the queue and the split-screen review. Codes are backfilled by the migration.

**Bugs fixed**
1. *Registration dead-end* — with no mail provider configured, `PENDING_ACTIVATION` users could never sign in.
   Now governed by the `require_activation` setting (default **false** → account usable immediately), and the
   activation-link flow still works when switched on.
2. *KYC could not be submitted* — see v1.0.2 (added `POST /api/pe/kyc/submit`).
3. *Entity not resolved after first save* — see v1.0.1.
4. *PE pages called `/api/admin/settings`* — a PE-visible page depended on an admin route. Added
   `GET /api/settings` (any authenticated user, branding + limits only).
5. *Approved KYC could be silently invalidated* — replacing a document on an `APPROVED` entity is now
   rejected with 409; replacing a document otherwise returns the entity to the submission flow.
6. *"Submit" label after a correction request* — list actions now read **Submit** / **Resubmit** correctly.
7. *Templates / URLs showed no parent reference* — lists now show the header / template code.

**Performance**
- `getSettings()` is TTL-cached (default 10s) and invalidated on admin writes — removes a DB round trip
  from nearly every render.
- `resolveEntityId()` is now called **once** per request in each PE route (was repeatedly awaited).
- All list endpoints are bounded (`.limit(50/100/200)`); the dashboard history selects only needed columns.
- New indexes on `(status, created_at desc)`, `audit_log(entity_id, created_at desc)`,
  `notifications_log(created_at desc)` and `kyc_documents(entity_id, status)`.

**Security**
- Provider credentials are **never sent to the browser**: `auth_config` secrets return masked (`__SET__`)
  and a masked value on save means "keep the stored secret" (`mergeAuthConfig`).
- The Postman-style test console and `notifications_log` now **redact** `Authorization` / API-key headers
  and any `link` / `otp` / `token` template variables before they are returned or persisted.
- Added sliding-window **rate limiting** on `login` (15 / 5 min), `register` (10 / hour) and
  `forgot` (5 / 15 min) per client IP (§11). In-memory, so pair it with a WAF/edge limit in production.

## v1.2 — Random reference codes (one length per module)

Codes are not sequential. `allocate_ref_code(prefix, table, column, digits)` draws a random value inside the
exact N-digit range (`10^(N-1) .. 10^N-1`, so never a shorter number and never a leading zero) and retries
until the code is unused:

| Module | Format | Range | Space |
|---|---|---|---|
| PE | `PE-48291376` | 10,000,000–99,999,999 | 90,000,000 |
| Header | `HDR-731044` | 100,000–999,999 | 900,000 |
| Template | `TPL-2098841` | 1,000,000–9,999,999 | 9,000,000 |
| URL | `URL-55612` | 10,000–99,999 | 90,000 |

**Collision safety.** Allocation takes a transaction-scoped advisory lock
(`pg_advisory_xact_lock(hashtext('refcode:' || table))`), so two concurrent inserts can never receive the
same code; a partial unique index on each code column is the second line of defence. After 50 failed draws
the allocator raises rather than looping forever.

**Capacity note.** The tightest space is URL (90,000) and Header (900,000). Collisions are handled by
retry, so cost stays negligible until a type is a few percent full — at 1,000 URLs (~1.1% full) a draw
collides ~1.1% of the time; at 9,000 URLs it retries about 1.1 times on average. The allocator raises
rather than looping once it cannot find a free code within 100 tries, which is the signal to widen the
format. For this portal's expected volume none of these bounds is remotely near.

The v1.1 sequences are dropped by the v1.2 migration. Code assignment still happens in a `BEFORE INSERT`
trigger, so application code is unchanged — it merely displays whatever code the database assigned.
