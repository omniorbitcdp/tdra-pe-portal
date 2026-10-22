# TDRA PE Registration Portal

A production-shaped implementation of the **TDRA Pack – Principal Entity Portal Functional Requirements**, built as a
**Next.js 14 (App Router) + TypeScript** application on **Supabase (PostgreSQL + Storage)**, deployed to **Vercel**.

The portal is **fully bilingual (English / العربية)** with a live RTL switch, covers the complete registration workflow
**Login → Entity & Signatory → KYC → KYC Approval → Header → Template → URL**, and adds a **subscriber grievance
redressal module** with SLA tracking, escalation to the telecom operator and reporter re-open.

---

## Table of contents

1. [Release history](#1-release-history)
2. [What the portal does](#2-what-the-portal-does)
3. [Roles and access](#3-roles-and-access)
4. [Status machines](#4-status-machines)
5. [Bilingual support (English / العربية)](#5-bilingual-support-english--العربية)
6. [Technical architecture](#6-technical-architecture)
7. [Database architecture](#7-database-architecture)
8. [API surface](#8-api-surface)
9. [Security model](#9-security-model)
10. [Performance design](#10-performance-design)
11. [Sequence enforcement](#11-sequence-enforcement)
12. [Notifications](#12-notifications)
13. [Local setup](#13-local-setup)
14. [Database migrations](#14-database-migrations)
15. [Tests](#15-tests)
16. [Deployment](#16-deployment)
17. [Project layout](#17-project-layout)

---

## 1. Release history

| Version | Changes |
|---|---|
| **v1.0** | Core portal: auth, entity profile, KYC pack, headers, templates, URLs, operator queues, audit, notifications, Postman-style provider console |
| **v1.1 – v1.2** | Reference codes (`PE-`, `HDR-`, `TPL-`, `URL-`) + supporting indexes; random 6–9 digit allocation |
| **v1.3** | Email activation removed — registration is immediately `ACTIVE` |
| **v1.4** | `audit_log.actor_name` |
| **v1.6** | SMS-only templates; `<var1>,<var2>` variables derived from the body; `variable_samples` required and frozen on submit |
| **v1.7** | Enterprise / Telco login doors, server-enforced; "Principal Entity" → **Enterprise** terminology sweep |
| **v1.8** | Shared `AuthPanel` for login + registration, new headline, copyright footer |
| **v1.9** | KYC reviewer document preview fix (`SHARED` middleware allow-list) |
| **v2.0** | Administrator capability audit |
| **v2.1** | Enterprise revision path — `PUT` for headers / templates / URLs with reviewer remarks |
| **v2.2** | "Under review" no longer shown on approved rows (`lockNote()`) |
| **v2.3** | **Grievance module** — public raise/track, PE queue, admin oversight, header-only matching, SLA, attachments |
| **v2.4** | Stale-read fix (`noStoreFetch`), status-derived timeline, focus/60 s refresh |
| **v2.5** | **Escalation, return-to-enterprise, reporter re-open**; 8-state grievance lifecycle |
| **v2.6** | **Bilingual EN/AR + RTL**; URL may be independent of a template; method retired; performance pass |
| **v2.7** | Arabic coverage completion (status chips, lock notes, header types, dates), URL module UI, cache-seeded remounts |

---

## 2. What the portal does

### Enterprise (PE) side

| Requirement | Implementation |
|---|---|
| Business registration (immediate access, no activation) | `/register`, `/api/auth/register` → `app_users` with `status='ACTIVE'` |
| Entity & signatory details (§4.1, §4.2) | `/pe/profile`, `entityDetailsSchema` |
| Four mandatory KYC documents, verified individually (§5) | `/pe/kyc`, `kyc_documents`, split-screen reviewer at `/operator/kyc/[entityId]` |
| Sender ID (header) registration (§6) | `/pe/headers` — alphanumeric / numeric / shortcode |
| SMS template registration (§6) | `/pe/templates` — `<var1>` variables + per-variable sample content |
| URL registration (§6) | `/pe/urls` — **linked to an approved template _or_ independent** |
| Revision of returned records (§6) | Inline editors, `PUT` on all three modules, `EDITABLE_STATUSES` gate |
| Status dashboard, progress stepper, history (§8) | `/pe`, `/api/pe/dashboard` |
| Subscriber grievances matched to its headers | `/pe/grievances` |

### Telecom-operator side

| Requirement | Implementation |
|---|---|
| Role-separated approval queues (§7, §12) | `/operator/{kyc,headers,templates,urls}`, `MODULES_FOR_ROLE` |
| Split-screen KYC review with document preview (§7.2) | `/operator/kyc/[entityId]`, shared `/api/pe/kyc/file` route |
| Decisions: approve / reject / request correction | `/api/operator/decision`, `/api/operator/document`, `/api/operator/kyc-info` |
| Own-queue isolation | Middleware `OPERATOR_PATHS` + handler-level `guard()` |
| Grievance ruling: return to enterprise / resolve / reject / close | `/admin/grievances` |

### Platform administrator

| Capability | Implementation |
|---|---|
| Overview counts | `/admin`, `/api/admin/overview` |
| Branding: operator name, short name, logo, brand colour, limits | `/admin/settings`, `platform_settings` |
| **Postman-style** Email / SMS / WhatsApp provider configuration + live test | `/admin/api-config`, `/api/admin/providers/test` |
| Users & roles, temp passwords | `/admin/users` |
| Immutable audit trail | `/admin/audit`, `audit_log` |
| Notification log and delivery result | `/admin/notifications` |
| Grievance oversight across every enterprise | `/admin/grievances` |

### Subscriber (public, no login)

| Capability | Implementation |
|---|---|
| Raise a grievance against a sender ID | `/grievance` — multipart with screenshot (JPG/PNG/WEBP/PDF, ≤ 5 MB) |
| Track it with grievance ID + mobile/e-mail | `/grievance/track` |
| Re-open or escalate a concluded grievance | `/api/grievances/reopen` |

---

## 3. Roles and access

| Role key | Label (EN) | Label (AR) | Home |
|---|---|---|---|
| `PE` | Enterprise | المؤسسة | `/pe` |
| `OPERATOR_KYC` | Telecom Operator – KYC Approver | مشغّل الاتصالات – معتمد اعرف عميلك | `/operator` |
| `OPERATOR_HEADER` | Telecom Operator – Header Approver | مشغّل الاتصالات – معتمد معرّفات المرسل | `/operator` |
| `OPERATOR_TEMPLATE_URL` | Telecom Operator – Template/URL Approver | مشغّل الاتصالات – معتمد القوالب والروابط | `/operator` |
| `ADMIN` | Platform Administrator | مدير المنصة | `/admin` |

Access is enforced in **three** layers:

1. **Middleware** (`src/middleware.ts`) — route-level, with JSON 401/403 for API paths.
2. **Route handlers** — `guard(session, [...roles])` on every handler.
3. **Database** — deny-all RLS; the server-only service-role client is the only writer.

---

## 4. Status machines

### Registration records — headers, templates, URLs, KYC

```
DRAFT ──submit──▶ SUBMITTED ──▶ UNDER_REVIEW ──┬──▶ APPROVED            (locked)
  ▲                   │                        ├──▶ REJECTED            (editable)
  │                   │                        └──▶ CLARIFICATION_REQUIRED (editable)
  └───────────────────┴──── RESUBMITTED ◀──────────────┘
```

`EDITABLE_STATUSES = ['DRAFT', 'CLARIFICATION_REQUIRED', 'REJECTED']`

### KYC documents (per document)

```
PENDING_VERIFICATION ──▶ VERIFIED
                     ├──▶ REJECTED
                     └──▶ RESUBMISSION_REQUIRED
```

### Grievances — 8 states

```
SUBMITTED ──▶ ACKNOWLEDGED ──┬──▶ RESOLVED ──┬──▶ CLOSED ──▶ REOPENED
                             ├──▶ REJECTED ──┘        ▲           │
                             └──▶ ESCALATED ──┬──▶ RETURNED_TO_PE ─┘
                                              ├──▶ RESOLVED
                                              └──▶ CLOSED
```

| Group | States | Meaning |
|---|---|---|
| `GRIEVANCE_OPEN` | `SUBMITTED`, `ACKNOWLEDGED`, `REOPENED`, `RETURNED_TO_PE` | Awaiting the enterprise |
| `GRIEVANCE_WITH_ADMIN` | `ESCALATED` | Awaiting the platform administrator |
| `GRIEVANCE_CONCLUDED` | `RESOLVED`, `REJECTED`, `CLOSED` | Reporter may re-open or escalate |

**Allowed actions per actor**

| Actor | Actions |
|---|---|
| `PE` | `ACKNOWLEDGE`, `RESOLVE`, `REJECT`, `ESCALATE`, `CLOSE` — from open states |
| `ADMIN` | `RETURN_TO_PE`, `RESOLVE`, `REJECT`, `CLOSE` |
| `SUBSCRIBER` | `REOPEN`, `ESCALATE` — from concluded states |

A written note (≥ 5 characters) is mandatory for **every** action except `ACKNOWLEDGE`.
`REOPEN` and `RETURN_TO_PE` **restart the SLA clock**; `RESOLVE` / `REJECT` cascade `acknowledged_at`.

---

## 5. Bilingual support (English / العربية)

### Design

The **English source string is the dictionary key**, so a missing translation degrades to readable English instead of
a raw token. 763 Arabic entries cover the entire UI.

```
src/lib/i18n/
├── index.ts        AR dictionary merge, translate(), dirFor(), isLang()
├── server.ts       getLang() — reads the cookie per request (first paint is correct)
├── live.ts         hook-free t() bound to the current language
├── ar-common.ts    navigation, roles, statuses, buttons
├── ar-auth.ts      login, register, forgot, reset, brand panel
├── ar-pe.ts        dashboard, profile, KYC, headers, templates, URLs
├── ar-operator.ts  workbench + four queues
├── ar-admin.ts     overview, settings, providers, users, audit, notifications
├── ar-grievance.ts public portal, enterprise queue, oversight, tracker
└── ar-extra.ts     fragments, DB vocabularies, messages
```

### How the choice travels

| Layer | Mechanism |
|---|---|
| Cookie `tdra_lang` | Read server-side in the root layout → `<html lang="ar" dir="rtl">` correct on first paint |
| `localStorage` | Keeps the choice in a new tab before the cookie round-trip |
| `LangProvider` | Sets `lang`/`dir`, re-keys the tree, and calls `router.refresh()` inside `startTransition` |
| `useT()` | Reactive translator for client components |
| `t()` from `live.ts` | Hook-free translator for presentational code and page bodies |

### Coverage rules

- **`StatusPill` translates its own label** through `src/lib/labels.ts`, so every table is covered at once.
- **Database vocabularies are translated**: 5 entity types, 7 emirates, 11 industries, 4 document types, 3 channels,
  9 audit modules, 4 template categories, 18 notification events, 12 audit actions.
- **Dates are formatted as `YYYY-MM-DD HH:mm`** (`src/lib/datetime.ts`) — `toLocaleString()` scrambles under `dir="rtl"`.
- **Free-text cells use `dir="auto"`** so an English remark keeps its own punctuation order inside Arabic layout.
- **Identifiers stay Latin** — `PE-95816265`, `GRV-59792210`, `HDR-453269`, sender IDs, e-mails.

### RTL layer (`src/app/globals.css`)

Tailwind's physical utilities do not flip by themselves, so a small override layer handles
`ml-auto` / `mr-auto`, `text-left` / `text-right`, table alignment, input alignment, and removes
`letter-spacing` on Arabic (it breaks glyph joins). **Cairo** is loaded as the Arabic face.

### The toggle

Segmented `EN | عربي` pill in `src/components/LangToggle.tsx`, placed **immediately before the signed-in user** in the
app header, and in the top-right of the public and auth screens.

---

## 6. Technical architecture

### System context

```
                    ┌──────────────────────────────┐
   Subscriber ─────▶│  Public grievance portal     │  /grievance, /grievance/track
   (no login)       │  rate-limited, no session    │
                    └──────────────┬───────────────┘
                                   │
┌───────────────┐   ┌──────────────▼───────────────┐   ┌──────────────────────┐
│  Enterprise   │──▶│                              │──▶│  Supabase Postgres   │
│  (PE role)    │   │   Next.js 14 App Router      │   │  + private buckets   │
└───────────────┘   │   ── middleware (RBAC)       │   │  (service-role only) │
┌───────────────┐   │   ── route handlers (guard)  │   └──────────────────────┘
│ Operator      │──▶│   ── server components       │
│ (3 queue roles)│  │   ── client pages            │──▶┌──────────────────────┐
└───────────────┘   │                              │   │ Email / SMS /        │
┌───────────────┐   │   i18n: cookie → RSC         │   │ WhatsApp providers   │
│ Administrator │──▶│   cache: no-store fetch      │   │ (admin-configured)   │
└───────────────┘   └──────────────────────────────┘   └──────────────────────┘
```

### Request lifecycle

```
Browser
  │  GET /pe/headers
  ▼
middleware.ts ──── no/expired cookie ──▶ 401 (API) | /login (page)
  │  role ∉ PROTECTED[/pe] ──▶ /login?denied=1
  ▼
app/pe/layout.tsx ──▶ AppShell (RSC)
  │   getSession()          verify JWT from tdra_session
  │   navForRole(role)      build nav, translate labels via cookie
  │   pendingCounts()       4 × COUNT, cached 5 s
  │   getSettings()         platform_settings, cached 10 s
  ▼
app/pe/headers/page.tsx  ('use client')
  │   useState(() => hasApiCache('/api/pe/headers'))   ← instant paint after remount
  │   api('/api/pe/headers')                            ← cache 15 s, in-flight de-dupe
  ▼
api/pe/headers/route.ts
  │   getSession() → guard(['PE']) → resolveEntityId()
  │   db()  service-role client, global fetch = noStoreFetch
  ▼
Supabase Postgres  ── deny-all RLS ── trigger enforce_sequence ── audit_log
```

### Layer responsibilities

| Layer | Files | Responsibility |
|---|---|---|
| Edge | `src/middleware.ts` | RBAC by prefix, `SHARED` allow-list, `OPERATOR_PATHS`, JSON errors for `/api/*` |
| Session | `src/lib/session.ts`, `auth.ts` | HMAC-signed JWT in an httpOnly cookie, 8 h TTL |
| Domain | `src/lib/workflow.ts`, `grievance.ts`, `grievanceTransitions.ts`, `constants.ts`, `labels.ts`, `templateVars.ts` | Pure rules — no I/O, fully unit-tested |
| I/O | `src/lib/db.ts`, `storage.ts`, `notify.ts`, `audit.ts`, `settings.ts` | Supabase, signed URLs, provider dispatch, audit writes |
| Presentation | `src/app/**`, `src/components/**` | Server pages + client islands |
| i18n | `src/lib/i18n/**`, `LangProvider`, `LangToggle` | Cookie-bound language, RTL, dictionaries |

### Workflow gating (triple-enforced)

```
UI      disabled button + explanatory amber banner
API     canCreateHeader/Template/Url() → 409 with a reason
DB      enforce_sequence() trigger on INSERT and UPDATE
```

---

## 7. Database architecture

### Entity-relationship diagram

```
                    ┌─────────────────────┐
                    │  platform_settings  │  key / value JSONB
                    └─────────────────────┘

┌──────────────┐          ┌──────────────────────┐
│  app_users   │──────┐   │      entities        │
│──────────────│      │   │──────────────────────│
│ id      uuid │      │   │ id              uuid │
│ email  unique│      │   │ entity_code  PE-…    │
│ password_hash│      │   │ legal_entity_name    │
│ role         │      │   │ entity_type          │
│ status       │      └──▶│ kyc_status           │
│ entity_id ───┼─────────▶│ kyc_info_approved    │
│ full_name    │  (PE)    │ signatory_*          │
│ phone        │          │ emirate / industry   │
└──────┬───────┘          └───────┬──────────────┘
       │                          │
       │                          ├──────────────▶ ┌──────────────────────┐
       │                          │                │   kyc_documents      │
       │                          │                │──────────────────────│
       │                          │                │ entity_id     FK     │
       │                          │                │ doc_type  (4 types)  │
       │                          │                │ status               │
       │                          │                │ file_path (private)  │
       │                          │                └──────────────────────┘
       │                          │
       │                          ├──────────────▶ ┌──────────────────────┐
       │                          │                │ header_registrations │
       │                          │                │──────────────────────│
       │                          │                │ header_code  HDR-…   │
       │                          │                │ sender_id  (unique)  │
       │                          │                │ header_type          │
       │                          │                │ status               │
       │                          │                └──────────┬───────────┘
       │                          │                           │
       │                          ├──────────────▶ ┌──────────▼───────────┐
       │                          │                │template_registrations│
       │                          │                │──────────────────────│
       │                          │                │ template_code TPL-…  │
       │                          │                │ header_id     FK     │
       │                          │                │ body  (SMS only)     │
       │                          │                │ variables[]          │
       │                          │                │ variable_samples     │
       │                          │                │ status               │
       │                          │                └──────────┬───────────┘
       │                          │                           │
       │                          └──────────────▶ ┌──────────▼───────────┐
       │                                          │  url_registrations   │
       │                                          │──────────────────────│
       │                                          │ url_code      URL-…  │
       │                                          │ template_id   FK NULL│◀── independent URL
       │                                          │ url                  │
       │                                          │ method (default POST)│
       │                                          │ status               │
       │                                          └──────────────────────┘
       │
       ├──────────────▶ ┌──────────────────────┐
       │                │     grievances       │
       │                │──────────────────────│
       │                │ grievance_code GRV-… │
       │                │ entity_id  FK (nullable, header-matched)
       │                │ reported_header      │
       │                │ category             │
       │                │ status  (8 states)   │
       │                │ sla_due_at           │
       │                │ escalated_* / returned_* / reopened_* / closed_*
       │                │ attachment_path      │
       │                │ reopen_count         │
       │                └──────────────────────┘
       │
       ├──────────────▶ ┌──────────────────────┐
       │                │      audit_log       │  append-only
       │                │──────────────────────│
       │                │ module, record_id    │
       │                │ action, from/to      │
       │                │ actor_id/email/name  │
       │                │ remarks, metadata    │
       │                └──────────────────────┘
       │
       ├──────────────▶ ┌──────────────────────┐
       │                │  notifications_log   │
       │                │──────────────────────│
       │                │ event, channel       │
       │                │ recipient, status    │
       │                │ provider_message_id  │
       │                └──────────────────────┘
       │
       └──────────────▶ ┌──────────────────────┐
                        │     auth_tokens      │  reset / OTP
                        │  token_hash, expires │
                        └──────────────────────┘

                        ┌──────────────────────┐
                        │    api_providers     │  channel, base_url,
                        │  auth, headers JSONB │  body template
                        └──────────────────────┘
```

### Table summary

| Table | Purpose | Key columns | Notes |
|---|---|---|---|
| `platform_settings` | Branding + limits | `key`, `value` JSONB | Cached 10 s in-process |
| `app_users` | Accounts | `email` unique, `role`, `status`, `entity_id` | bcrypt cost 10 |
| `entities` | Enterprise profile | `entity_code` `PE-`+8, `kyc_status` | One per PE account |
| `kyc_documents` | 4 mandatory docs | `doc_type`, `status`, `file_path` | Private bucket |
| `header_registrations` | Sender IDs | `header_code` `HDR-`+6, `sender_id` unique | Requires KYC `APPROVED` |
| `template_registrations` | SMS templates | `body`, `variables[]`, `variable_samples` JSONB | Requires approved header |
| `url_registrations` | Callback URLs | `url_code` `URL-`+5, `template_id` **nullable** | Requires KYC approved; template optional |
| `grievances` | Subscriber complaints | `grievance_code` `GRV-`+8, `status`, `sla_due_at` | Matched by header only |
| `audit_log` | Immutable trail | `module`, `action`, `from_status`, `to_status` | Append-only |
| `notifications_log` | Delivery record | `event`, `channel`, `status` | |
| `api_providers` | Provider config | `channel`, `base_url`, `auth_type` | Credentials server-side only |
| `auth_tokens` | Reset / OTP | `token_hash`, `expires_at`, `used_at` | |

### Referential rules

```
entities        1 ──< kyc_documents           (cascade delete)
entities        1 ──< header_registrations    (cascade delete)
header_registrations 1 ──< template_registrations
template_registrations 1 ──< url_registrations (RESTRICT; template_id nullable from v2.6)
entities        1 ──< url_registrations
entities        0..1 ──< grievances           (nullable — unmatched grievances still exist)
```

### Reference-code allocation

```
PE-  12345678      entities.entity_code
HDR- 453269        header_registrations.header_code
TPL- 1234567       template_registrations.template_code
URL- 12345         url_registrations.url_code
GRV- 59792210      grievances.grievance_code
```

Allocated by `allocate_ref_code()` (random, collision-checked) with an application-level fallback so the flow works
before the trigger exists.

---

## 8. API surface

### Authentication

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Sign in; enforces Enterprise / Telco door |
| `POST` | `/api/auth/register` | Create an `ACTIVE` account |
| `POST` | `/api/auth/logout` | Clear session |
| `POST` | `/api/auth/forgot` | Send reset link |
| `POST` | `/api/auth/reset` | Set new password |

### Enterprise (`PE`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/pe/dashboard` | Entity + KYC + module statuses + history |
| `GET/PUT` | `/api/pe/profile` | Entity & signatory details |
| `GET/POST` | `/api/pe/kyc` | List documents / upload one |
| `GET` | `/api/pe/kyc/file` | Signed document URL (also reviewers — `SHARED`) |
| `POST` | `/api/pe/kyc/submit` | Submit the KYC pack |
| `GET/POST/PUT` | `/api/pe/headers` | List / create / amend |
| `GET/POST/PUT` | `/api/pe/templates` | List / create / amend |
| `GET/POST/PUT` | `/api/pe/urls` | List / create / amend (template optional) |
| `POST` | `/api/pe/submit` | Submit any module for approval |
| `GET/POST` | `/api/pe/grievances` | Entity queue + any enterprise action |

### Operator

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/operator/queue` | Role-scoped queue |
| `GET` | `/api/operator/summary` | Counts |
| `GET` | `/api/operator/kyc` | KYC queue with documents |
| `POST` | `/api/operator/decision` | Approve / reject / request correction |
| `POST` | `/api/operator/document` | Verify / reject a single document |
| `POST` | `/api/operator/kyc-info` | Approve / revoke PE information |

### Administrator

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/overview` | Platform counts |
| `GET/POST` | `/api/admin/settings` | Branding |
| `GET/POST` | `/api/admin/providers` | List / create providers |
| `PUT/DELETE` | `/api/admin/providers/[id]` | Amend / delete |
| `POST` | `/api/admin/providers/test` | Live test (Postman-style) |
| `GET/POST` | `/api/admin/users` | List / create |
| `PATCH` | `/api/admin/users/[id]` | Update role / status |
| `GET` | `/api/admin/audit` | Filtered audit trail |
| `GET` | `/api/admin/notifications` | Delivery log |
| `GET/POST` | `/api/admin/grievances` | Oversight + ruling |

### Public

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/grievances` | Raise (multipart, optional screenshot) |
| `GET` | `/api/grievances/track` | Track by ID + contact |
| `GET` | `/api/grievances/headers` | Sender-ID autocomplete |
| `GET` | `/api/grievances/attachment` | Signed URL, access-checked |
| `POST` | `/api/grievances/reopen` | Reporter re-open or escalate |

---

## 9. Security model

| Control | Implementation |
|---|---|
| Password storage | bcrypt, cost 10, per-user salt |
| Session | HMAC-SHA256 JWT, httpOnly + SameSite cookie, 8 h TTL |
| RLS | **Deny-all** on every table; only the service-role key (server) writes |
| Tenant isolation | `resolveEntityId()` on every PE handler; `entity_id` checked before any mutation |
| Middleware RBAC | UI **and** `/api` prefixes protected; `SHARED` is an explicit allow-list |
| Login enumeration | Same response and timing for unknown address; door mismatch returns 403 without revealing existence |
| Public endpoints | IP rate limit (track 30 / 15 min, re-open 15 / hour) |
| Grievance privacy | Reporter contact masked (`vi•••@domain`, `•••••4567`); grievance ID **and** matching contact required |
| Attachments | Private buckets, short-lived signed URLs (300 s), access re-checked per request |
| File uploads | MIME allow-list, size ceiling, server-side type sniff |
| Audit | Append-only `audit_log` with actor, role, transition and remarks |
| Provider secrets | Stored server-side only; never returned to the browser |

---

## 10. Performance design

| Technique | Where | Effect |
|---|---|---|
| `noStoreFetch` forced globally on the Supabase client | `src/lib/db.ts` | Correctness first — no stale reads across users |
| GET cache, 15 s TTL, in-flight de-dupe, cleared on any write | `src/lib/client.ts` | Language switch and back-navigation paint from memory |
| Cache-seeded initial state (`hasApiCache`) | client pages | Remount shows data immediately, no spinner flash |
| `router.refresh()` inside `startTransition` | `LangProvider` | Toggling never blocks the click |
| Badge counts cached 5 s | `AppShell` | Removes 4 COUNT queries from every server render |
| Settings cached 10 s, invalidated on write | `src/lib/settings.ts` | Removes a per-request round trip |
| Concurrent queries batched with `Promise.all` | dashboards, queues | One round of I/O instead of serial waits |
| `poweredByHeader: false`, `compress: true` | `next.config.mjs` | Smaller envelope |
| Focus + 60 s refresh | queues, tracker | Fresh data without polling hard |

---

## 11. Sequence enforcement

```
Header      requires  entities.kyc_status = 'APPROVED'
Template    requires  header_registrations.status = 'APPROVED'
URL         requires  entities.kyc_status = 'APPROVED'
                      (+ template_registrations.status = 'APPROVED' when a template is linked)

KYC submit  requires  all 4 documents present + all profile fields complete
```

Enforced in the UI (disabled + explanation), the API (`409` with reason) and the database
(`enforce_sequence()` trigger on `INSERT` and `UPDATE`).

---

## 12. Notifications

Provider-agnostic dispatch through `sendNotification()`:

```
event + channel ──▶ api_providers (channel, active, default) ──▶ HTTP request
                                                                    │
                                            notifications_log ◀─────┘
                                            (SENT / FAILED / SKIPPED)
```

Events: account activation, password reset, OTP, KYC submitted/approved/rejected/resubmission, header
submitted/approved/rejected, template submitted/approved/rejected, URL submitted/approved/rejected,
grievance escalated/updated/returned/re-opened.

Administrators can configure and **live-test** any provider from `/admin/api-config` — base URL, method, headers,
query params, body template, auth type, timeout — with the request and response shown side by side.

---

## 13. Local setup

```bash
# 1. install
npm install

# 2. environment (.env.local)
SESSION_SECRET="a-random-string-of-at-least-32-characters"
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# 3. database
#    Supabase → SQL editor → run, in order:
#      supabase/schema.sql
#      supabase/seed.sql                    (demo data + logins)
#      every file in supabase/migrations/   (chronological)

# 4. run
npm run dev          # http://localhost:3000
npm run build        # production build
npm test             # vitest
npx tsc --noEmit     # type check
```

### Demo logins (from `seed.sql`)

| Role | E-mail | Password |
|---|---|---|
| Platform Administrator | `admin@tdra.demo` | `Admin@12345` |
| KYC Approver | `kyc.approver@operator.demo` | `Approver@123` |
| Header Approver | `header.approver@operator.demo` | `Approver@123` |
| Template/URL Approver | `tpl.approver@operator.demo` | `Approver@123` |
| Enterprise | `pe.demo@acme.ae` | `PE@12345` |
| Enterprise | `pe.demo@falcon.ae` | `PE@12345` |

---

## 14. Database migrations

Run once each, in order, in the Supabase SQL editor. All are **idempotent**.

| File | Purpose |
|---|---|
| `2026-10-13_v1.1_ref_codes_indexes.sql` | Reference codes + indexes |
| `2026-10-13_v1.2_random_ref_codes.sql` | Random code allocation |
| `2026-10-13_v1.3_remove_activation.sql` | Drop activation state |
| `2026-10-13_v1.4_audit_actor_name.sql` | `audit_log.actor_name` |
| `2026-10-14_v1.6_sms_templates_variable_samples.sql` | SMS-only templates, `<varN>` conversion, `variable_samples` |
| `2026-10-21_v2.3_grievances.sql` | `grievances` table, GRV codes, SLA, attachments |
| `2026-10-21_v2.4_grievance_stale_reads.sql` | `acknowledged_at` backfill |
| `2026-10-21_v2.5_grievance_escalation.sql` | Escalation / return / re-open columns, 8-state check |
| `2026-10-22_v2.6_url_independent.sql` | `template_id` nullable, `method` default |

---

## 15. Tests

```
23 suites · 330 tests
```

| Suite | Covers |
|---|---|
| `authz.test.ts` | Full role × route × method matrix |
| `middleware.test.ts` | Edge RBAC, API JSON errors, `SHARED` allow-list |
| `loginPortal.test.ts` | Enterprise / Telco doors, no enumeration |
| `workflow.test.ts` | Sequence gating |
| `kycSubmit.test.ts` | KYC pack completeness |
| `revision.test.ts` | `PUT` amend path + editability gate |
| `statusLabels.test.ts` | `lockNote()` correctness |
| `grievance.test.ts` | Raise, match, track, enterprise queue, oversight |
| `grievanceEscalation.test.ts` | Escalate → return → re-open, SLA reset, refusals |
| `staleRead.test.ts` | Cache-control headers + timeline |
| `adminAccess.test.ts` | Administrator capabilities |
| `templateVars.test.ts` | `<varN>` derivation |
| `i18n.test.ts` | Dictionary integrity, DB vocabularies, statuses, placeholders |
| `session`, `password`, `crypto`, `redact`, `rateLimit`, `validation`, `nav`, `apiRequest`, `templateCreate`, `sharedEndpoints` | Supporting units |

---

## 16. Deployment

```
GitHub ──▶ Vercel (build: npm run build)
             │
             ├── env vars: SESSION_SECRET, NEXT_PUBLIC_SUPABASE_URL,
             │              NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
             └── Supabase: schema + seed + migrations applied once
```

Route handlers are `force-dynamic`; the tracker sets `revalidate = 0` and `fetchCache = 'force-no-store'`.

Base URL: `https://tdra-pe-portal.vercel.app`

---

## 17. Project layout

```
src/
├── app/
│   ├── layout.tsx                 root: lang/dir from cookie, LangProvider, Cairo font
│   ├── login, register, forgot, reset
│   ├── pe/                        dashboard · profile · kyc · headers · templates · urls · grievances
│   ├── operator/                  workbench · kyc (queue + [entityId]) · headers · templates · urls
│   ├── admin/                     overview · settings · api-config · users · audit · notifications · grievances
│   ├── grievance/                 public raise + track
│   └── api/                       all route handlers (see §8)
├── components/
│   ├── AppShell.tsx               header, nav, badge counts, language toggle
│   ├── LangProvider.tsx           language context + dir
│   ├── LangToggle.tsx             EN | عربي
│   ├── AuthPanel.tsx              shared sign-in / registration brand panel
│   ├── DecisionQueue.tsx          operator queue shell
│   ├── GrievancePortal.tsx        public raise + track
│   └── ui.tsx                     Card, PageHeader, StatusPill, Stepper, StatCard…
├── lib/
│   ├── i18n/                      dictionaries + server/live translators
│   ├── constants.ts               roles, statuses, editable set, labels
│   ├── labels.ts                  one status-label table for every pill
│   ├── datetime.ts                bidi-safe date formatting
│   ├── workflow.ts                sequence gates
│   ├── grievance.ts               grievance state machine
│   ├── grievanceTransitions.ts    single patch builder for all actors
│   ├── templateVars.ts            <varN> derivation
│   ├── client.ts                  browser fetch + GET cache
│   ├── db.ts                      service-role Supabase + noStoreFetch
│   ├── auth.ts, session.ts, password.ts, crypto.ts
│   ├── notify.ts, audit.ts, settings.ts, storage.ts, rateLimit.ts
│   └── validation.ts              all Zod schemas
├── middleware.ts                  edge RBAC
└── tests/                         vitest suites + harness
supabase/
├── schema.sql
├── seed.sql
└── migrations/
```

---

## Terminology

| Old | Current |
|---|---|
| Principal Entity / PE portal | **Enterprise** (routes, role key `PE` and ID prefix unchanged) |
| Business registration activation | Removed — accounts are `ACTIVE` on registration |
| Channel selection on templates | **SMS only** |
| URL method | Not collected — callbacks are `POST` |

---

© Onextel Copyright 2026
