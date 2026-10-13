# TDRA Pack — Principal Entity (PE) Registration Portal

A production-shaped implementation of the **TDRA Pack – Principal Entity Portal Functional Requirements v1.0**.
Built as a **Next.js 14 (App Router) + TypeScript** application, backed by **Supabase (PostgreSQL + Storage)**,
designed to deploy to **Vercel** and live in **GitHub**.

Covers the full workflow: **Create Login → PE Details & KYC → KYC Approval → Header → Template → URL**,
with role-separated telecom-operator approval queues, a split-screen KYC review, an audit trail, and a
**Postman-style console where you configure and test your own Email / SMS / WhatsApp provider APIs**.

---

## 1. What's included

| Requirement (doc §) | Where it lives |
|---|---|
| Login records in the app DB (not an email service) — §3 | `app_users` table, `src/lib/auth.ts`, `src/app/api/auth/[action]` |
| Strong salted password hashes — §3, §11 | `src/lib/password.ts` (bcrypt, cost 10) |
| Password reset via time-limited links + OTP — §3, §10 (no email activation) | `auth_tokens`, `/reset`, `sendNotification()` |
| PE registration form fields (§4.1 + §4.2) | `src/app/pe/profile`, `entityDetailsSchema` |
| Four mandatory KYC documents, each verified independently — §5 | `kyc_documents`, `/pe/kyc`, split-screen `/operator/kyc/[entityId]` |
| Sequence enforcement **in UI and backend** — §6, §12 | `src/lib/workflow.ts` + Postgres triggers (`enforce_sequence`) |
| Operator queues + role separation — §7, §12 | `/api/operator/queue`, `MODULE_ROLES` map, middleware |
| Split-screen KYC review — §7.2 | `/operator/kyc/[entityId]` |
| Status dashboard + history — §8 | `/api/pe/dashboard`, `/pe` |
| Status values — §9 | `src/lib/constants.ts` |
| Notifications via configurable Email/SMS/WhatsApp — §10 | `src/lib/notify.ts`, `notifications_log` |
| Security, audit, retention — §11 | `audit_log`, RLS, `platform_settings.retention_days` |
| **Configurable + testable provider APIs (Postman-like)** | `/admin/api-config`, `/api/admin/providers/test` |
| **Editable platform name + logo (image or base64)** | `/admin/settings`, `platform_settings` |
| **Seed data for all tables** | `supabase/seed.sql` |

---

## 2. Architecture

```
Next.js 14 App Router (Vercel)
├── src/app/(auth pages)      login · register · activate · reset · forgot
├── src/app/pe/*              PE portal (dashboard, profile, KYC docs, headers, templates, urls)
├── src/app/operator/*        operator back office (queues, split-screen KYC review)
├── src/app/admin/*           admin (branding, API config console, users, audit, notifications)
├── src/app/api/*             all REST endpoints (see §7)
├── src/lib/*                 password · session · workflow · validation · apiRequest · notify · storage
└── src/middleware.ts         server-side route protection by role

Supabase
├── Postgres (system of record)
└── Storage bucket "kyc-documents" (private, 10 MB, PDF/JPG/PNG)
```

**Auth model (as requested):** the app uses its own **simple login table** (`app_users`: email + password hash + role).
Supabase's email auth is **not** used. Sessions are signed **HS256 JWTs in an httpOnly cookie** (`jose`).
Password hashing is **bcrypt** (salted, never plain text, never reversible).

---

## 3. Repository layout

```
tdra-pe-portal/
├── supabase/
│   ├── schema.sql          ← tables, indexes, triggers, RLS, storage bucket
│   └── seed.sql            ← starter data (users, entity, KYC docs, headers, templates, urls, providers)
├── src/
│   ├── app/                ← pages + API route handlers
│   ├── components/         ← UI kit, Shell, nav, forms, DecisionQueue
│   ├── lib/                ← constants, password, crypto, session, auth, db, workflow, validation, apiRequest, notify, storage, audit, settings, types, http
│   └── middleware.ts
├── tests/                  ← Vitest suite (unit + integration-style)
├── docs/                   ← extra notes
├── .env.example
├── .github/workflows/ci.yml
└── package.json
```

---

## 4. Setup

### 4.1 Supabase
1. Create a project at <https://supabase.com> → copy **Project URL**, **anon key**, **service_role key**.
2. In **SQL Editor**, run **`supabase/schema.sql`**, then **`supabase/seed.sql`**.
   * `schema.sql` also creates the private `kyc-documents` storage bucket.
   * `seed.sql` uses `pgcrypto`'s `crypt()`/`gen_salt('bf')` so demo passwords are real bcrypt hashes.

### 4.2 Environment
Copy `.env.example` → `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # server-only — never exposed to the browser
SESSION_SECRET=...                      # 32+ random chars
SESSION_TTL_HOURS=12
APP_BASE_URL=http://localhost:3000
KYC_BUCKET=kyc-documents
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15
```

### 4.3 Run locally
```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm test             # Vitest
npm run build        # production build
```

### 4.4 GitHub
```bash
git init
git add .
git commit -m "TDRA PE portal: initial implementation"
git branch -M main
git remote add origin https://github.com/<you>/tdra-pe-portal.git
git push -u origin main
```
`.github/workflows/ci.yml` runs typecheck + tests + build on every push.

### 4.5 Vercel
1. **Import** the GitHub repo into Vercel (framework auto-detected: Next.js).
2. Add the same environment variables (Project → Settings → Environment Variables).
   Use the **service_role** key only in server env vars.
3. Deploy. Set `APP_BASE_URL` to your Vercel domain so activation/reset links resolve.

---

## 4.6 Upgrading an existing database (v1.1)

If you already ran `schema.sql`, apply the incremental migration instead of re-running the whole schema:

```
supabase/migrations/2026-10-13_v1.2_random_ref_codes.sql   (random reference IDs + indexes)
supabase/migrations/2026-10-13_v1.3_remove_activation.sql   (removes the email-activation flow)
```

This single migration covers everything: reference codes (including converting any sequential codes from
v1.1), the performance indexes, and the two settings. Run it once.

It is self-contained and adds **random reference codes**, one length per module, assigned by a trigger on
every insert (existing rows are re-drawn at the new length):

| Module | Format | Example |
|---|---|---|
| Principal Entity | `PE-` + 8 digits | `PE-48291376` |
| Header | `HDR-` + 6 digits | `HDR-731044` |
| Template | `TPL-` + 7 digits | `TPL-2098841` |
| URL | `URL-` + 5 digits | `URL-55612` |

It also adds the performance indexes and the `require_activation` / `email_notifications_enabled` settings;
performance indexes; and the `require_activation` / `email_notifications_enabled` settings.
A fresh install gets all of this directly from `schema.sql`.

## 5. Demo logins (from `seed.sql`)

| Email | Password | Role |
|---|---|---|
| `admin@tdra.demo` | `Admin@12345` | Platform Administrator |
| `kyc.approver@operator.demo` | `Approver@123` | KYC Approver |
| `header.approver@operator.demo` | `Approver@123` | Header Approver |
| `tpl.approver@operator.demo` | `Approver@123` | Template/URL Approver |
| `pe.demo@acme.ae` | `PE@12345` | PE (Acme Telecom FZ-LLC — KYC approved, full chain seeded) |
| `pe.demo@falcon.ae` | `PE@12345` | PE (Falcon Retail LLC — KYC under review, one doc needs resubmission) |

> Change or delete these before any production use.

---

## 6. The workflow (and how the sequence is enforced)

```
Create Login → PE Details + KYC upload → KYC Approval
   → Header Registration → Header Approval
      → Template Registration (against an APPROVED header) → Template Approval
         → URL Registration (against an APPROVED template) → URL Approval
```

Enforcement is **defence-in-depth**:
1. **UI** only offers the next step when its dependency is satisfied.
2. **API** (`src/lib/workflow.ts`) rejects out-of-sequence create/submit with HTTP `409`.
3. **Database triggers** (`enforce_sequence` in `schema.sql`) raise on any direct insert/update that violates the sequence.

KYC approval is additionally blocked until **all four documents are `VERIFIED`** *and* the PE information is approved.

---

## 7. API surface

| Method & path | Purpose |
|---|---|
| `POST /api/auth/register` · `login` · `logout` · `reset` · `forgot` | Account + session lifecycle (registration is active immediately) |
| `GET  /api/auth/me` | Current session |
| `GET/PUT /api/pe/profile` | Entity & signatory details |
| `GET/POST /api/pe/kyc` · `GET /api/pe/kyc/file?docId=` | KYC upload (validated) + signed preview |
| `GET/POST /api/pe/headers` · `/templates` · `/urls` | Create drafts (sequence-gated) |
| `POST /api/pe/submit` | Submit a draft for review (sequence-gated) |
| `GET  /api/pe/dashboard` | Status + history |
| `GET  /api/operator/queue?module=` | Role-scoped queue |
| `GET  /api/operator/kyc?entityId=` | Split-screen review payload |
| `POST /api/operator/document` · `/kyc-info` · `/decision` | Verify docs, approve info, decide |
| `GET/PUT /api/admin/settings` | Branding + policy |
| `GET/POST /api/admin/users` · `PATCH /api/admin/users/[id]` | User + role management |
| `GET/POST /api/admin/providers` · `GET/PATCH/DELETE /api/admin/providers/[id]` | Provider CRUD |
| `POST /api/admin/providers/test` | **Run a real outbound test request** (Postman-style) |
| `GET  /api/admin/audit` · `/notifications` · `/overview` | Audit, delivery log, counts |

---

## 8. Configuring & testing your own Email / SMS / WhatsApp APIs

Open **`/admin/api-config`** (sign in as `admin@tdra.demo`).

1. **New provider** → pick channel (EMAIL/SMS/WHATSAPP).
2. Set **endpoint URL**, **method**, **headers** (JSON), **query params** (JSON) and a **body template**.
   `{{recipient}}`, `{{body}}`, `{{subject}}`, `{{sender_id}}`, `{{link}}`, `{{name}}`, `{{otp}}` are substituted at send time.
3. Choose **auth**: None · Bearer · Basic · API key (header or query).
4. Mark it **Default for channel** — the notification service uses the default active provider for each channel.
5. **Send test** runs a genuine HTTP request server-side and shows the exact **request preview**,
   **HTTP status**, **latency** and the **response body** — exactly like Postman.
   You can test an unsaved draft ("Send test (unsaved config)") before saving.

Every send (from the app or the test console) is recorded in **`notifications_log`**, visible at `/admin/notifications`.

Shipped example providers (in `seed.sql`) are generic placeholders for a REST email API, an SMS gateway and the
WhatsApp Business Cloud API — replace the URLs/credentials with your own.

---

## 9. Branding

`/admin/settings` lets you change **any time**:
- Telecom operator **name** and short name,
- **logo** — upload an image (stored as a base64 data URL) *or* paste an image URL,
- brand colour, max KYC file size, retention periods.

Applied through `platform_settings` and injected as a CSS variable in the root layout.

---

## 10. Security

- bcrypt (cost 10) password hashes; password policy enforced server-side (min 10, upper/lower/digit/symbol).
- Account lockout after `MAX_LOGIN_ATTEMPTS` failures for `LOCKOUT_MINUTES`.
- httpOnly, SameSite=Lax, `secure` (prod) session cookie; HS256 JWT with `SESSION_SECRET`.
- **Server-side RBAC** on every protected page (middleware) **and** every API (`guard()` + `MODULE_ROLES`).
- RLS **enabled (deny-all)** on all tables; the app reaches the DB only from server code with the service-role key.
- KYC documents live in a **private** storage bucket; access only through short-lived signed URLs (5 min), scoped by role/entity.
- Full **audit trail** of logins, uploads, document verification, approvals/rejections and status changes.
- No plain-text passwords are ever emailed. **There is no email-activation step** — registration is
  immediately usable with email + password; password *reset* uses time-limited tokens (hashes only).
- Retention periods are **configurable** (`retention_days`) rather than hard-coded.

---

## 11. File rules (KYC uploads)

- Allowed: **PDF, JPG, JPEG, PNG**.
- Server validates **extension + MIME + size** (client type is never trusted).
- Default **5 MB** per document (your instruction). The requirements appendix proposes 10 MB — change it in
  `/admin/settings` or `platform_settings.max_kyc_file_mb` (hard ceiling 10 MB in the bucket config).

---

## 12. Testing

```bash
npm test
```
Vitest suite (`tests/`):
- `password.test.ts` — hashing/verification/salt/policy.
- `crypto.test.ts` — tokens, OTP, sha256, constant-time compare.
- `session.test.ts` — JWT round-trip, tamper + wrong-secret rejection.
- `workflow.test.ts` — sequence gates (KYC→Header→Template→URL), KYC approval gating, status transitions.
- `validation.test.ts` — entity/header/template schemas, file extension/MIME/size rules.
- `apiRequest.test.ts` — provider request builder (bearer/basic/API-key/query/GET) and the executor
  against a **mocked fetch** (success, non-2xx, network error, timeout, invalid config).

---

## 13. Assumptions & open items (need your sign-off)

These follow the document's "proposed decisions" with a sensible default; confirm before go-live:

1. **Registration HTML** — not supplied; the baseline field set from §4.1/§4.2 is implemented and is
   configuration-friendly (add fields without rework).
2. **File size** — defaulted to **5 MB** (your explicit instruction) though the appendix proposes 10 MB.
3. **VAT waiver** — VAT Certificate is mandatory; no silent waiver. If a PE lacks one, route for an
   approved exception (not implemented as an auto-waive).
4. **URL approval rule** — default: **approved template required before URL registration**.
5. **Providers** — real endpoints/credentials/templates to be supplied; the console is provider-agnostic.
6. **Retention periods** — configurable placeholders (7 years profile/KYC/audit, 1 year notifications);
   confirm with the client's compliance team.
7. **Hosting region** — set the Supabase project + Vercel region to the location approved by the client.

---

## 14. Minimum acceptance criteria — status

| # | Criterion (§12) | Status |
|---|---|---|
| 1 | PE account stored in the app DB | ✅ |
| 2 | Access comms sent via configured channels; no plain-text passwords | ✅ (activation step removed by design) |
| 3 | Form captures entity + signatory details | ✅ |
| 4 | KYC pack requires all four documents | ✅ |
| 5 | KYC Approver split-screen, per-document verification | ✅ |
| 6 | KYC blocked until 4 docs verified + info approved | ✅ (API + trigger) |
| 7 | Separate Header / Template-URL approver roles | ✅ |
| 8 | Sequence KYC → Header → Template → URL enforced | ✅ (UI + API + DB) |
| 9 | PE sees statuses, remarks, history; can resubmit | ✅ |
| 10 | Approval/rejection auditable (reviewer, timestamp, remarks) | ✅ |
| 11 | Backend enforces status + access, not just the frontend | ✅ |
