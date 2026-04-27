# Token Alerts & Auto-Refill — Phase 0 Discovery

**Status:** Discovery complete, awaiting review before Phase 1.
**Date:** 2026-04-27
**Brief:** Tiered low-token email alerts to org admins/managers + per-user auto-refill via Stripe.

This document maps the existing ConvoiaAI codebase against the implementation brief, surfaces gaps where brief assumptions don't match reality, and proposes adjusted approaches before any code is written.

---

## 1. Backend Inventory

### 1.1 ORM & Migrations

- **ORM:** Prisma (`backend/prisma/schema.prisma`).
- **Migration tool:** `prisma migrate` only. SQL migrations land under `backend/prisma/migrations/<timestamp>_<name>/migration.sql`. No raw-SQL workflow alongside.
- **Existing migrations:** As of discovery, one durable migration: `20260311192626_add_wallet_budget_hierarchy`.
- **Implication:** All new tables and columns will be added via `prisma migrate dev` → committed migration SQL. Reversibility is achievable but Prisma's auto-generated `down` migrations are not first-class — we'll need to author the rollback SQL by hand if a true reversible migration is required.

### 1.2 Schema models — what already exists

| Model | Path:Lines | Relevance to feature |
|---|---|---|
| `Organization` | `backend/prisma/schema.prisma:10-47` | Has `orgTokenBalance`, `monthlyBudget`, `budgetAlertSent`, `tier`, `status`. **Status field already supports suspension states** — usable for the brief's "never refill on suspended org" guard. |
| `User` | `:49-109` | `role` is a **string** field. Has `organizationId` FK. No separate Role/Permission table. |
| `TokenWallet` | `:509-520` | Per-user wallet: `tokenBalance`, `totalTokensPurchased`, `totalTokensUsed`, `allocatedTokens`. **This is the per-user balance table** the brief refers to. |
| `TokenTransaction` | `:541-555` | Append-only-ish ledger with `type`, `tokens` (signed), `balanceAfter`, `description`. Audit-grade. |
| `TokenPurchase` | `:522-539` | Records every Stripe purchase: `tokensPurchased`, `amountPaid`, `stripePaymentId`, `expiresAt`. Refills will append rows here. |
| `Subscription` | `:266-289` | Stripe subscription model exists but **token-only billing is the active path** today. Subscriptions can stay dormant for the alerts/refill feature. |
| `BillingRecord` | `:291-317` | Invoice/payment history with `stripePaymentId`. |
| `Budget` | `:223-243` | **Pre-existing alert pattern**: `monthlyCap`, `alertThreshold` (default 80), `alertSent`, `autoDowngrade`, `resetDate`. **Critical finding** — see §3.1. |
| `UsageLog` | `:160-192` | Confirmed. Per-request consumption. |
| `AIModel` | `:135-158` | Per-model `markupPercentage` (default 25, currently 27.5 in production), `inputTokenPrice`, `outputTokenPrice`, `perQueryFee`. |

**No** separate `Role` or `Permission` table. **No** existing `token_alert_settings`, `token_refill_rules`, or `token_events` tables.

### 1.3 Token deduction call site

- **Single canonical path:** `backend/src/services/tokenWalletService.ts` — `TokenWalletService.deductTokens({ userId, tokens, reference, description, organizationId })`.
- **Atomic locking:** `SELECT ... FOR UPDATE` row lock is already in place (verified during Phase B billing work in this session).
- **Call sites in controllers:** `aiController.ts:199`, `:354`, `:649`, `:732`, plus call sites in `compareController.ts`, `imageGenController.ts`, `councilService.ts`, `whisperService.ts`, etc. **The deduction is centralized in one service but called from many controllers.** Threshold-check enqueue must therefore live **inside `tokenWalletService.deductTokens` itself** (post-commit) so every consumer benefits without per-controller wiring.

### 1.4 Job queue — **NOT INSTALLED**

- **No** BullMQ, Bull, Agenda, SQS, or worker references in code.
- **No** Redis dependency in `package.json`. The app does not use Redis at all today.
- **Implication:** The brief's Phase 2 hot path *(deduct → enqueue threshold-check)* cannot be implemented as written. Three options — see §3.2.

### 1.5 Email transport — **Resend, not SES**

- **Library:** Resend (transactional SaaS).
- **Service:** `backend/src/services/emailService.ts` — single `sendEmail(to, subject, html)` function.
- **API key:** `RESEND_API_KEY` env var (config `env.ts:62`).
- **Implication:** Brief recommends SES; **use Resend instead**. Resend supports React Email templates natively, which fits the codebase's existing patterns better than MJML. No new email infra needed.

### 1.6 Payment provider — Stripe (fully wired)

- **Package:** `stripe@^20.4.1` (`backend/package.json:45`).
- **Service:** `backend/src/services/stripeService.ts` — `StripeService.getOrCreateCustomer()` exists, plus checkout/payment intent helpers.
- **Controllers:** `stripeController.ts` (token purchase, checkout sessions), `stripeWebhookController.ts` (event handling).
- **Webhook handler:** Already verifies signatures via `stripe.webhooks.constructEvent()`. Already returns 500 on transient DB failures so Stripe retries (`stripeWebhookController.ts:67`) — good pattern for refill webhooks to follow.
- **Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` from env. **No AWS Parameter Store wiring** — secrets come from `.env` / process env directly. The brief's "secrets manager (AWS Parameter Store)" requirement is not currently met for any secret. Decision needed (§3.6).
- **Implication:** Auto-refill builds on existing infra. Need to add: stored payment methods, off-session charge calls, refund webhook handling (currently only `checkout.session.completed` is handled).

### 1.7 RBAC

- **Middleware:** `requireRole(...allowedRoles)` at `backend/src/middleware/authMiddleware.ts:96-108`.
- **Role values in production:** `user`, `manager`, `org_owner`, `platform_admin`. **NOT** `admin`/`manager`/`agent` as the brief uses.
- **Mapping required:**

| Brief term | Code role | Notes |
|---|---|---|
| admin | `org_owner` | Owner of an organization |
| manager | `manager` | Mid-tier within org |
| agent | `user` | Regular team member |
| super-admin | `platform_admin` | Convoia staff |

- **Sample call:** `adminRoutes.ts:32` — `router.get('/stats', requireRole('admin', 'platform_admin'), getAdminStats)` — note that `'admin'` here is yet another existing string. Need to audit which routes use which role names and standardize before adding more.
- **Implication:** Brief's spec needs to be translated to actual role names. **Recommendation:** keep code roles as-is; map brief language in the design doc only.

### 1.8 Webhooks

- Existing endpoint: Stripe webhook at `/api/stripe/webhook` (`stripeWebhookController.ts`).
- **Currently handles only:** `checkout.session.completed`.
- **Will need to add:** `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `payment_method.detached` — for auto-refill flow per Phase 2 of the brief.

### 1.9 Feature flags — **NOT INSTALLED**

- No LaunchDarkly, GrowthBook, Unleash, or custom flag system.
- **Implication:** Brief's "ship behind feature flag, default off" must be implemented via either:
  - Env var (`FEATURE_TOKEN_ALERTS=on`) — simplest, all-or-nothing.
  - DB column on `Organization` (e.g., `featureTokenAlertsEnabled boolean default false`) — per-org gradual rollout.
- **Recommendation:** Add a single env var for the entire feature **and** a per-org boolean, so we can ship the code dark, enable internal-org first, then flip orgs individually. ~5 min to wire.

### 1.10 Logger

- Winston (`backend/src/config/logger.ts`).
- JSON format with `timestamp`, `errors`, `json`. **Brief's structured-log requirement is already met.**

---

## 2. Frontend Inventory

| Item | Status | Notes |
|---|---|---|
| Component library | **Tailwind CSS v4** + custom components only | No MUI, no shadcn, no Chakra. Brief's UI work needs custom builds. |
| Routing | React Router v7 | `convoia_frontend/src/App.tsx:153-175` |
| State management | **Context API only** — no Redux/Zustand/Jotai | `AuthContext`, `ThemeContext`, `ToastContext`, `TokenContext`, `ChatContext` |
| Data fetching | Hand-rolled `fetch` + axios in places — no React Query | New admin pages should consider adopting React Query (separate decision) |
| Existing admin pages | `AdminUsersPage`, `AdminOrgsPage`, `AdminModelsPage`, `AdminRevenuePage`, `AdminUserDetailPage`, `AdminOrgDetailPage`, `AdminSendTokensPage`, `AdminCreateAccountPage`, `AdminFullAnalyticsPage` | Token Alerts settings tab and per-user refill drawer should land in `AdminOrgDetailPage` and `AdminUserDetailPage` respectively. |
| Toast | Custom `ToastContext` | Use this for save/error feedback in new admin views. |

---

## 3. Critical findings & decisions needed before Phase 1

### 3.1 Reuse the existing `Budget` alert pattern — don't build a parallel one

The `Budget` model already has `alertThreshold` (default 80), `alertSent`, `autoDowngrade`, `resetDate`. The brief's `token_alert_settings` table partially duplicates this.

**Decision needed:** Should we extend `Budget` (add `warningPct`, `criticalPct`, `notifyDepleted`, `recipientRoles`, `extraEmails`, `cooldownMinutes` columns) or create a parallel `TokenAlertSetting` table?

**Recommendation:** **Create a separate `TokenAlertSetting` table.** Reasons:
- `Budget` is per-user; alert *settings* are per-org.
- Mixing per-user budget caps with per-org alert config in one table will hurt readability and migrations.
- `Budget`'s existing `alertSent` boolean stays useful for per-user tier tracking; we add `lastAlertTier` and `lastAlertSentAt` to the existing `TokenWallet` model (per-user, where balance lives).

### 3.2 Job queue — three options

The brief's hot path requires async enqueue after deduction. We don't have Redis or a queue.

| Option | Cost | Latency | Durability | Recommendation |
|---|---|---|---|---|
| **A. Add BullMQ + Redis** | New top-level dependency. Redis instance needed (Upstash free tier or AWS ElastiCache). | Sub-second | Durable across restarts | Strongest fit for the brief, but adds infra. |
| **B. In-process `setImmediate`** | Zero new deps. Worker logic inline. | Sub-second | **Lost on process crash** mid-flight | Acceptable for alerts (idempotent retry on next deduction); **risky for refills** which must not double-charge. |
| **C. DB-polled worker (node-cron + `pending_jobs` table)** | Zero new deps. New table. | 30-60s polling interval | Durable | Simpler ops than BullMQ, slower reaction time. |

**Recommendation: Option C — DB-polled worker.** Reasons:
- No new infra (no Redis, no queue service to manage).
- Refill latency of 30-60s is acceptable — users won't hit zero in that window since refill triggers at 10% balance.
- Same durability guarantees as Option A for our scale.
- `pending_jobs` table doubles as visibility into the worker's state.
- Trivial migration path to BullMQ later if we hit scale issues.

If the user prefers Option A, we add `bullmq` + `ioredis` as deps and provision Redis (Upstash recommended; ~free at this scale).

### 3.3 Brief's role names are wrong

Spec uses `admin`/`manager`/`agent`; code uses `user`/`manager`/`org_owner`/`platform_admin`.

**Decision:** Translate brief language to code roles in design doc; **do not** rename roles in the codebase. UI labels will say "Admin" / "Manager" / "Member" but DB and middleware stay on existing values.

### 3.4 Email transport: Resend, not SES

Brief's MJML recommendation is fine in principle, but Resend supports React Email natively. **Recommendation:** Use React Email components for templates (better dev experience, type-safe, lives next to React frontend).

### 3.5 Refund webhook handling — new logic needed

Brief calls out: "Refunds: if a Stripe charge is later refunded, decrement the balance accordingly via webhook handler. If the user has already spent the credits, allow the balance to go negative…"

Currently only `checkout.session.completed` is handled. **Will need to add:** `charge.refunded`, `payment_intent.payment_failed`, `payment_method.detached`. Each becomes a small handler in `stripeWebhookController.ts`.

### 3.6 Secrets management

Brief mandates AWS Parameter Store. **Currently all secrets are in `.env` / process env.** This is an existing pre-condition violation that pre-dates this feature. Two paths:

| Path | Effort | Recommendation |
|---|---|---|
| Migrate all secrets to Parameter Store first | ~1-2 days | Right thing to do; out of scope for this feature. |
| Continue with env vars for this feature, file Parameter Store migration as a separate ticket | ~5 min | Recommended — don't gate this feature on infra refactor. |

**Recommendation:** Continue using env vars for now. File secrets migration as a separate concern.

### 3.7 Frontend scope

No component library means more custom UI work than the brief implies. Each new view (Org Settings → Alerts tab, per-user refill drawer, dashboard widget) is ~150-300 lines of React + Tailwind. Estimating ~3-4 days of frontend work.

### 3.8 Token unit clarification

Brief asks: "balance unit is tokens vs cents." **Confirmed:** Convoia uses **wallet tokens** as the balance unit (`TokenWallet.tokenBalance` is `Int`, denominated in wallet tokens at `TOKEN_BASE_RATE = $0.0000025`). Refill amounts in the UI should be presented as **USD** but stored as **wallet tokens** internally — same pattern as existing token packages.

---

## 4. Proposed Phase 1 schema (revised from brief)

Pending review approval, here's the refined schema:

### `TokenAlertSetting` (replaces brief's `token_alert_settings`)

```prisma
model TokenAlertSetting {
  id                String   @id @default(uuid())
  organizationId    String   @unique
  enabled           Boolean  @default(true)
  warningPct        Int      @default(20)
  criticalPct       Int      @default(5)
  notifyDepleted    Boolean  @default(true)
  recipientRoles    String[] @default(["org_owner", "manager"])  // matches actual code roles
  extraEmails       String[] @default([])
  cooldownMinutes   Int      @default(60)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  organization      Organization @relation(fields: [organizationId], references: [id])
}
```

### `TokenRefillRule` (per org+user)

```prisma
model TokenRefillRule {
  id                          String   @id @default(uuid())
  organizationId              String
  userId                      String
  enabled                     Boolean  @default(false)
  triggerPct                  Int      @default(10)
  refillTokenAmount           BigInt
  maxRefillsPerMonth          Int?
  maxSpendPerMonthCents       Int?
  stripePaymentMethodId       String   // Stripe pm_xxx on file
  createdById                 String
  monthlyRefillCount          Int      @default(0)
  monthlyRefillSpendCents     Int      @default(0)
  monthlyResetAt              DateTime  // first of next month, calculated
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  organization                Organization @relation(...)
  user                        User         @relation(fields: [userId], references: [id])
  createdBy                   User         @relation("RefillRuleCreator", fields: [createdById], references: [id])

  @@unique([organizationId, userId])
}
```

### `TokenEvent` (audit log, append-only)

```prisma
model TokenEvent {
  id              String   @id @default(uuid())
  organizationId  String
  userId          String?
  eventType       TokenEventType
  metadata        Json
  idempotencyKey  String?  @unique  // refill events only
  createdAt       DateTime @default(now())

  @@index([organizationId, createdAt])
  @@index([userId, createdAt])
}

enum TokenEventType {
  alert_warning
  alert_critical
  alert_depleted
  refill_attempted
  refill_succeeded
  refill_failed
  refill_cap_reached
  refill_payment_failed
  refill_manual
}
```

### Additions to `TokenWallet`

```prisma
model TokenWallet {
  // ...existing fields...
  lastAlertTier       String?    // 'warning' | 'critical' | 'depleted' | null
  lastAlertSentAt     DateTime?
}
```

### Append-only enforcement on `TokenEvent`

DB trigger to block `UPDATE`/`DELETE` on `TokenEvent` rows. Brief mandates this for SOC 2 readiness. Trigger SQL drafted, will go in the migration.

---

## 5. Estimated scope

This is a **multi-week** feature for one engineer:

| Phase | Estimate |
|---|---|
| Phase 1 (schema + migration + reversibility) | 1 day |
| Phase 2 (deduct→check→refill core logic + idempotency + Stripe off-session) | 4 days |
| Phase 3 (email templates + Resend wiring + notification log) | 1 day |
| Phase 4 (admin API endpoints + RBAC + Zod schemas) | 1 day |
| Phase 5 (admin UI: 3 views + dashboard widget) | 3-4 days |
| Phase 6 (tests: unit + integration + concurrent) | 2 days |
| Phase 7 (observability: logs, metrics, alerts) | 1 day |
| Phase 8 (security review + DB triggers + audit log) | 1 day |
| Phase 9 (rollout, dogfood, announcement) | spread over 2 weeks |
| **Total active dev time** | **~14-16 working days** |

---

## 6. What I'm NOT recommending we do tonight

- Start writing migrations or services. **The brief explicitly says "Begin with Phase 0. Do not start coding until the discovery doc is reviewed."**
- Add Redis + BullMQ as a dependency without explicit user sign-off (proposing Option C above instead).
- Rename existing role values in the codebase (would touch many files for no real win).

---

## 7. Decisions awaiting user review

Before proceeding to Phase 1, please confirm:

1. **Job queue strategy:** Option C (DB-polled worker)? Or Option A (add Redis + BullMQ)?
2. **Schema approach:** Separate `TokenAlertSetting` / `TokenRefillRule` / `TokenEvent` tables (recommended), or extend existing `Budget`?
3. **Role mapping:** Keep code roles unchanged, translate brief terminology in design doc only?
4. **Email:** Resend with React Email templates (recommended) — confirm OK?
5. **Secrets:** Continue with env vars; file Parameter Store migration as separate ticket?
6. **Feature flag strategy:** Env var + per-org DB column for gradual rollout — confirm OK?
7. **Frontend scope:** ~3-4 days of custom Tailwind UI work (no preset library) — acceptable?
8. **Schedule:** ~14-16 dev days end-to-end across 9 phases — proceed sequentially with review gates between phases?

Once decisions land, I'll start Phase 1: write the Prisma schema migration with `up`/`down` SQL hand-authored for reversibility, and pause again for review before applying.

---

## 8. Files referenced in this discovery

| File | Purpose |
|---|---|
| `backend/prisma/schema.prisma` | All models above |
| `backend/src/services/tokenWalletService.ts` | Where deduction + threshold-check enqueue will hook |
| `backend/src/services/emailService.ts` | Resend send wrapper |
| `backend/src/services/stripeService.ts` | Stripe customer/payment helpers |
| `backend/src/controllers/stripeWebhookController.ts` | Existing webhook handler — extend with `charge.refunded` + `payment_intent.*` |
| `backend/src/middleware/authMiddleware.ts:96-108` | `requireRole()` middleware |
| `backend/src/config/logger.ts` | Winston JSON logger |
| `convoia_frontend/src/pages/AdminOrgDetailPage.tsx` | Where Token Alerts settings tab lands |
| `convoia_frontend/src/pages/AdminUserDetailPage.tsx` | Where per-user refill drawer lands |
| `convoia_frontend/src/contexts/ToastContext.tsx` | Save/error feedback |
