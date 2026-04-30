# Token Alerts & Auto-Refill — Phase 1 Design (Schema + Migration)

**Status:** Drafted, awaiting review. **Not applied yet.**
**Phase:** 1 of 9 (Data model only).
**Predecessors:** Phase 0 discovery (`docs/features/token-alerts-discovery.md`, commit `77a6afa`).
**Decisions ratified by user:** Job queue Option C (DB-polled with `SKIP LOCKED`), separate tables (don't extend `Budget`), keep existing role names, Resend, env-var feature flag + per-org column, defer Parameter Store, Stripe webhook scope = balance/refill events only, per-org `tokenToCentsRate`, mid-chat refill = fail with clear error.

This document specifies **only** the schema and migration. No services, controllers, workers, UI. Those land in subsequent phases.

---

## 1. Scope of Phase 1

**In scope:**
- 4 new Prisma models (`TokenAlertSetting`, `TokenRefillRule`, `TokenEvent`, `PendingJob`).
- 1 new Prisma enum (`TokenEventType`).
- 2 columns added to `Organization` (`tokenAlertsEnabled`, `tokenToCentsRate`).
- 2 columns added to `TokenWallet` (`lastAlertTier`, `lastAlertSentAt`).
- New relations on `Organization` and `User`.
- Migration SQL with hand-authored `up` (Prisma-generated) and `down` (manual, since Prisma doesn't generate down migrations).
- PG trigger to block `UPDATE`/`DELETE` on `TokenEvent` (append-only enforcement).
- Indexes for the worker poll query and event audit reads.

**Not in scope (deferred to Phase 2+):**
- Worker process implementation.
- Threshold-check or refill logic.
- Stripe off-session charge integration.
- Email templates and dispatch.
- Admin API endpoints.
- Frontend UI.
- Cron job for monthly counter resets (Phase 2).

---

## 2. Prisma schema changes

### 2.1 New: `TokenAlertSetting` (one row per org)

```prisma
model TokenAlertSetting {
  id               String       @id @default(uuid())
  organizationId   String       @unique
  organization     Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  enabled          Boolean      @default(true)
  warningPct       Int          @default(20)
  criticalPct      Int          @default(5)
  notifyDepleted   Boolean      @default(true)

  // Postgres text[] of role values. Defaults align with brief→code mapping.
  recipientRoles   String[]     @default(["org_owner", "manager"])
  extraEmails      String[]     @default([])

  cooldownMinutes  Int          @default(60)

  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
}
```

**Constraints (added in migration SQL, not expressible in Prisma DSL):**
- `CHECK (warning_pct BETWEEN 1 AND 99)`
- `CHECK (critical_pct BETWEEN 1 AND 99)`
- `CHECK (critical_pct < warning_pct)`
- `CHECK (cooldown_minutes >= 0)`

### 2.2 New: `TokenRefillRule` (one row per org+user)

```prisma
model TokenRefillRule {
  id                       String       @id @default(uuid())
  organizationId           String
  userId                   String
  createdById              String

  enabled                  Boolean      @default(false)
  triggerPct               Int          @default(10)
  refillTokenAmount        BigInt       // wallet tokens added per refill
  maxRefillsPerMonth       Int?
  maxSpendPerMonthCents    Int?
  stripePaymentMethodId    String       // pm_xxx on the org's Stripe customer

  // Counters for monthly cap enforcement, reset by cron on the 1st.
  monthlyRefillCount       Int          @default(0)
  monthlyRefillSpendCents  Int          @default(0)
  monthlyResetAt           DateTime     // first of next month, recomputed on reset

  createdAt                DateTime     @default(now())
  updatedAt                DateTime     @updatedAt

  organization             Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user                     User         @relation("RefillRuleSubject", fields: [userId], references: [id], onDelete: Cascade)
  createdBy                User         @relation("RefillRuleCreator", fields: [createdById], references: [id], onDelete: Restrict)

  @@unique([organizationId, userId])
  @@index([enabled])
}
```

**Constraints:**
- `CHECK (trigger_pct BETWEEN 1 AND 99)`
- `CHECK (refill_token_amount > 0)`
- `CHECK (max_refills_per_month IS NULL OR max_refills_per_month > 0)`
- `CHECK (max_spend_per_month_cents IS NULL OR max_spend_per_month_cents > 0)`

### 2.3 New: `TokenEventType` enum + `TokenEvent` table

```prisma
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
  payment_method_missing
}

model TokenEvent {
  id              String         @id @default(uuid())
  organizationId  String
  userId          String?
  eventType       TokenEventType
  metadata        Json
  idempotencyKey  String?        @unique
  createdAt       DateTime       @default(now())

  organization    Organization   @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  user            User?          @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@index([userId, createdAt])
  @@index([eventType, createdAt])
}
```

**Append-only enforcement (PG trigger, applied in migration):**
```sql
CREATE OR REPLACE FUNCTION reject_token_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TokenEvent rows are append-only (op=%, id=%)', TG_OP, OLD.id;
END;
$$;

CREATE TRIGGER token_event_no_update
BEFORE UPDATE ON "TokenEvent"
FOR EACH ROW EXECUTE FUNCTION reject_token_event_mutation();

CREATE TRIGGER token_event_no_delete
BEFORE DELETE ON "TokenEvent"
FOR EACH ROW EXECUTE FUNCTION reject_token_event_mutation();
```

`onDelete: Restrict` on the org FK means audit rows survive an org deletion attempt — explicit handling required.

### 2.4 New: `PendingJob` (DB-polled worker queue)

```prisma
model PendingJob {
  id              String     @id @default(uuid())
  jobType         String     // 'token-threshold-check', 'token-refill', etc.
  payload         Json
  idempotencyKey  String?    @unique  // optional dedupe at insert time
  status          String     @default("pending")  // pending | processing | done | failed
  priority        Int        @default(0)
  attemptCount    Int        @default(0)
  maxAttempts     Int        @default(3)
  lastError       String?    @db.Text
  scheduledFor    DateTime   @default(now())
  startedAt       DateTime?
  completedAt     DateTime?
  lockedBy        String?    // worker process ID for ops visibility
  lockedAt        DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  @@index([status, scheduledFor])     // worker poll query
  @@index([jobType, status])           // ops dashboards
  @@index([completedAt])               // for retention pruning later
}
```

**Worker poll query (Phase 2 will use this; documented here for context):**
```sql
-- Inside a transaction; SKIP LOCKED prevents two workers grabbing the same row.
UPDATE "PendingJob"
SET status = 'processing',
    "startedAt" = NOW(),
    "lockedBy" = $worker_id,
    "lockedAt" = NOW(),
    "attemptCount" = "attemptCount" + 1
WHERE id IN (
  SELECT id FROM "PendingJob"
  WHERE status = 'pending' AND "scheduledFor" <= NOW()
  ORDER BY priority DESC, "scheduledFor" ASC
  LIMIT 10
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

The `idempotencyKey` unique constraint with `ON CONFLICT DO NOTHING` on insert prevents duplicate enqueues (e.g., two concurrent deductions both trying to enqueue a threshold-check for the same user — only the first wins).

### 2.5 Modify: `Organization`

```prisma
model Organization {
  // ... existing fields unchanged ...

  // ── New (Phase 1 of token-alerts feature) ──────────────────────────
  // Per-org rollout switch. Env FEATURE_TOKEN_ALERTS is the global kill
  // switch; this column gates per-org enrollment.
  tokenAlertsEnabled Boolean  @default(false)

  // USD cents per wallet token. Snapshotted into TokenEvent.metadata at
  // refill time so admin rate changes don't retroactively reprice past
  // refills. Default mirrors current TOKEN_BASE_RATE (1 wallet token =
  // $0.0000025 = 0.00025 cents). Decimal(10,6) supports up to
  // 9999.999999 cents/token — well beyond any realistic value.
  tokenToCentsRate   Decimal  @default(0.00025) @db.Decimal(10, 6)

  // ── New relations ──────────────────────────────────────────────────
  tokenAlertSetting  TokenAlertSetting?
  tokenRefillRules   TokenRefillRule[]
  tokenEvents        TokenEvent[]
}
```

### 2.6 Modify: `User`

Adds inverse relations only — no new columns on User. The brief's `monthly_refill_count` / `monthly_refill_spend_cents` live on `TokenRefillRule` (per-rule), not on User.

```prisma
model User {
  // ... existing fields unchanged ...

  // New inverse relations
  refillRulesAsSubject TokenRefillRule[] @relation("RefillRuleSubject")
  refillRulesCreated   TokenRefillRule[] @relation("RefillRuleCreator")
  tokenEvents          TokenEvent[]
}
```

### 2.7 Modify: `TokenWallet`

```prisma
model TokenWallet {
  // ... existing fields unchanged ...

  // ── New (Phase 1 of token-alerts feature) ──────────────────────────
  // Tier ('warning' | 'critical' | 'depleted' | null) of the most recent
  // alert sent for this wallet. Cleared when balance recovers above
  // warning threshold so future drops re-trigger.
  lastAlertTier     String?
  lastAlertSentAt   DateTime?
}
```

---

## 3. Migration SQL — UP

Filename: `backend/prisma/migrations/<TIMESTAMP>_token_alerts_autorefill/migration.sql`. Generated by `prisma migrate dev --create-only` then **manually amended** to include the CHECK constraints and PG trigger which Prisma can't express.

```sql
-- ============================================================
-- Token Alerts & Auto-Refill — Phase 1 schema
-- ============================================================

-- 1. Enum
CREATE TYPE "TokenEventType" AS ENUM (
  'alert_warning',
  'alert_critical',
  'alert_depleted',
  'refill_attempted',
  'refill_succeeded',
  'refill_failed',
  'refill_cap_reached',
  'refill_payment_failed',
  'refill_manual',
  'payment_method_missing'
);

-- 2. Organization additions
ALTER TABLE "Organization"
  ADD COLUMN "tokenAlertsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tokenToCentsRate"   DECIMAL(10, 6) NOT NULL DEFAULT 0.00025;

-- 3. TokenWallet additions
ALTER TABLE "TokenWallet"
  ADD COLUMN "lastAlertTier"   TEXT,
  ADD COLUMN "lastAlertSentAt" TIMESTAMP(3);

-- 4. TokenAlertSetting
CREATE TABLE "TokenAlertSetting" (
  "id"               TEXT      PRIMARY KEY,
  "organizationId"   TEXT      NOT NULL UNIQUE REFERENCES "Organization"("id") ON DELETE CASCADE,
  "enabled"          BOOLEAN   NOT NULL DEFAULT true,
  "warningPct"       INTEGER   NOT NULL DEFAULT 20,
  "criticalPct"      INTEGER   NOT NULL DEFAULT 5,
  "notifyDepleted"   BOOLEAN   NOT NULL DEFAULT true,
  "recipientRoles"   TEXT[]    NOT NULL DEFAULT ARRAY['org_owner', 'manager'],
  "extraEmails"      TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cooldownMinutes"  INTEGER   NOT NULL DEFAULT 60,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CHECK ("warningPct" BETWEEN 1 AND 99),
  CHECK ("criticalPct" BETWEEN 1 AND 99),
  CHECK ("criticalPct" < "warningPct"),
  CHECK ("cooldownMinutes" >= 0)
);

-- 5. TokenRefillRule
CREATE TABLE "TokenRefillRule" (
  "id"                       TEXT      PRIMARY KEY,
  "organizationId"           TEXT      NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "userId"                   TEXT      NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdById"              TEXT      NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "enabled"                  BOOLEAN   NOT NULL DEFAULT false,
  "triggerPct"               INTEGER   NOT NULL DEFAULT 10,
  "refillTokenAmount"        BIGINT    NOT NULL,
  "maxRefillsPerMonth"       INTEGER,
  "maxSpendPerMonthCents"    INTEGER,
  "stripePaymentMethodId"    TEXT      NOT NULL,
  "monthlyRefillCount"       INTEGER   NOT NULL DEFAULT 0,
  "monthlyRefillSpendCents"  INTEGER   NOT NULL DEFAULT 0,
  "monthlyResetAt"           TIMESTAMP(3) NOT NULL,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CHECK ("triggerPct" BETWEEN 1 AND 99),
  CHECK ("refillTokenAmount" > 0),
  CHECK ("maxRefillsPerMonth" IS NULL OR "maxRefillsPerMonth" > 0),
  CHECK ("maxSpendPerMonthCents" IS NULL OR "maxSpendPerMonthCents" > 0),
  CONSTRAINT "TokenRefillRule_org_user_unique" UNIQUE ("organizationId", "userId")
);
CREATE INDEX "TokenRefillRule_enabled_idx" ON "TokenRefillRule"("enabled");

-- 6. TokenEvent (append-only)
CREATE TABLE "TokenEvent" (
  "id"              TEXT             PRIMARY KEY,
  "organizationId"  TEXT             NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT,
  "userId"          TEXT             REFERENCES "User"("id") ON DELETE SET NULL,
  "eventType"       "TokenEventType" NOT NULL,
  "metadata"        JSONB            NOT NULL,
  "idempotencyKey"  TEXT             UNIQUE,
  "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TokenEvent_org_created_idx"  ON "TokenEvent"("organizationId", "createdAt");
CREATE INDEX "TokenEvent_user_created_idx" ON "TokenEvent"("userId", "createdAt");
CREATE INDEX "TokenEvent_type_created_idx" ON "TokenEvent"("eventType", "createdAt");

-- 7. Append-only enforcement
CREATE OR REPLACE FUNCTION reject_token_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TokenEvent rows are append-only (op=%, id=%)', TG_OP, OLD.id;
END;
$$;

CREATE TRIGGER "TokenEvent_no_update"
  BEFORE UPDATE ON "TokenEvent"
  FOR EACH ROW EXECUTE FUNCTION reject_token_event_mutation();

CREATE TRIGGER "TokenEvent_no_delete"
  BEFORE DELETE ON "TokenEvent"
  FOR EACH ROW EXECUTE FUNCTION reject_token_event_mutation();

-- 8. PendingJob
CREATE TABLE "PendingJob" (
  "id"              TEXT      PRIMARY KEY,
  "jobType"         TEXT      NOT NULL,
  "payload"         JSONB     NOT NULL,
  "idempotencyKey"  TEXT      UNIQUE,
  "status"          TEXT      NOT NULL DEFAULT 'pending',
  "priority"        INTEGER   NOT NULL DEFAULT 0,
  "attemptCount"    INTEGER   NOT NULL DEFAULT 0,
  "maxAttempts"     INTEGER   NOT NULL DEFAULT 3,
  "lastError"       TEXT,
  "scheduledFor"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt"       TIMESTAMP(3),
  "completedAt"     TIMESTAMP(3),
  "lockedBy"        TEXT,
  "lockedAt"        TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CHECK ("status" IN ('pending', 'processing', 'done', 'failed')),
  CHECK ("attemptCount" >= 0),
  CHECK ("maxAttempts" > 0)
);
CREATE INDEX "PendingJob_status_scheduled_idx" ON "PendingJob"("status", "scheduledFor");
CREATE INDEX "PendingJob_type_status_idx"      ON "PendingJob"("jobType", "status");
CREATE INDEX "PendingJob_completed_idx"        ON "PendingJob"("completedAt");
```

---

## 4. Migration SQL — DOWN (manual rollback script)

Saved alongside the migration as `backend/prisma/migrations/<TIMESTAMP>_token_alerts_autorefill/down.sql`. Not auto-run by Prisma; documented for human-driven rollback.

```sql
-- Reverse Phase 1 in opposite order. Drops are CASCADE only where safe.
DROP TRIGGER IF EXISTS "TokenEvent_no_delete" ON "TokenEvent";
DROP TRIGGER IF EXISTS "TokenEvent_no_update" ON "TokenEvent";
DROP FUNCTION IF EXISTS reject_token_event_mutation();

DROP TABLE IF EXISTS "PendingJob";
DROP TABLE IF EXISTS "TokenEvent";
DROP TABLE IF EXISTS "TokenRefillRule";
DROP TABLE IF EXISTS "TokenAlertSetting";

DROP TYPE IF EXISTS "TokenEventType";

ALTER TABLE "TokenWallet"
  DROP COLUMN IF EXISTS "lastAlertSentAt",
  DROP COLUMN IF EXISTS "lastAlertTier";

ALTER TABLE "Organization"
  DROP COLUMN IF EXISTS "tokenToCentsRate",
  DROP COLUMN IF EXISTS "tokenAlertsEnabled";
```

**Rollback safety:** All additions are non-destructive — dropping them returns the schema to its pre-Phase-1 state. **Important:** running `down.sql` after Phase 2+ ships will break code that depends on these tables. Only safe to roll back Phase 1 if no later phases are deployed.

---

## 5. Decisions & rationale

### 5.1 `tokenToCentsRate` on `Organization`, snapshotted at refill

`Decimal(10, 6)` — supports `0.000001` to `9999.999999` cents per token. Default `0.00025` = current global `TOKEN_BASE_RATE`. Snapshot into `TokenEvent.metadata` at refill time so admin rate changes don't retroactively reprice past refills. Phase 2 service code reads `org.tokenToCentsRate` once per refill and writes it into the event metadata as `rateAtRefill`.

### 5.2 `recipientRoles` defaulted to `['org_owner', 'manager']`

Per user's role-mapping decision. Brief's "admin" → code's `org_owner`, "manager" → `manager`.

### 5.3 `Organization.tokenAlertsEnabled` defaults to `false`

Gradual rollout per the user's feature-flag plan. Existing orgs land disabled until explicitly enabled. Combined with the `FEATURE_TOKEN_ALERTS` env kill switch, gives two-axis control:
- Env off → feature dormant globally (kill switch)
- Env on + per-org false → feature dormant for that org (rollout gate)
- Env on + per-org true → feature live for that org

### 5.4 `TokenEvent` append-only via PG trigger

Enforced at the database level — no application code can violate it, even with a mistake or a malicious admin. SOC 2-friendly. Trigger uses `BEFORE UPDATE/DELETE` so the constraint fires before any change is recorded; PG raises an exception that bubbles up as a query error.

### 5.5 `PendingJob` instead of in-process scheduler

Survives crashes and restarts. With `SELECT … FOR UPDATE SKIP LOCKED`, multiple worker instances can run safely without coordinating. `idempotencyKey UNIQUE` + `INSERT ... ON CONFLICT DO NOTHING` prevents duplicate enqueues from concurrent deductions.

### 5.6 Why a separate `PendingJob` table and not reusing `TokenEvent`?

`TokenEvent` is append-only audit; jobs need mutation (status transitions). Mixing them would force two opposing access patterns onto one table.

### 5.7 No `Wallet` (legacy) changes

Schema also has a `Wallet` model (legacy, see `User.wallet`). All token-balance work for this feature targets `TokenWallet` only. Phase 1 leaves `Wallet` untouched — separate concern, possibly slated for retirement.

### 5.8 No User-level monthly counters

Brief specified `monthly_refill_count` and `monthly_refill_spend_cents` on User. We put them on `TokenRefillRule` instead — each rule has its own monthly counters. Reason: counters are scoped to the rule's caps, not to the user globally. A user could in principle have multiple rules across orgs (though the unique constraint says one per org).

### 5.9 `monthlyResetAt` not `nextMonthlyResetAt`

Single point of truth: the timestamp at which counters were last reset. Cron job in Phase 2 advances it month-by-month and zeros the counters in one transaction. Simpler than tracking "next" + "last".

### 5.10 Why not auto-generate the `down.sql`?

Prisma doesn't generate down migrations. Hand-authored is the standard approach. The brief mandates reversibility, so we author it ourselves.

---

## 6. Backwards compatibility

- All additions are additive. Existing rows in `Organization` and `TokenWallet` get default values for the new columns automatically (no backfill required).
- All new tables are empty until features write to them.
- Existing `tokenWalletService.deductTokens` continues to work unchanged. Phase 2 will add a post-commit `enqueue` call wrapped behind the `FEATURE_TOKEN_ALERTS` env check.

---

## 7. Application sequence (Phase 1 only — pending approval)

1. Run `npx prisma migrate dev --create-only --name token_alerts_autorefill`. This generates the SQL file from the schema diff but does not apply it.
2. **Manually amend** the generated SQL to include CHECK constraints, the trigger function, and triggers (Prisma doesn't generate these from the schema DSL).
3. Save the matching `down.sql` next to the migration.
4. Review locally — confirm SQL is correct.
5. Apply to staging DB: `npx prisma migrate deploy` (staging only).
6. Verify with `\d "TokenAlertSetting"`, `\d "TokenRefillRule"`, `\d "TokenEvent"`, `\d "PendingJob"`, plus check trigger via `INSERT then UPDATE` round-trip → expect exception.
7. Apply to production DB.
8. Commit: `feat(db): Phase 1 schema for Token Alerts & Auto-Refill`.

**Verification checklist before declaring Phase 1 done:**
- [ ] `\dt` shows the 4 new tables.
- [ ] `\dT "TokenEventType"` shows the enum with all 10 values.
- [ ] Trigger raises exception when `UPDATE "TokenEvent" SET ...` is attempted.
- [ ] `\d "Organization"` shows new columns with correct defaults.
- [ ] Existing usage continues — run a test chat, confirm deduction works.
- [ ] Prisma client regenerates cleanly: `npx prisma generate`.

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Migration takes a long ALTER lock on `Organization` (large rows table) | Both columns have defaults set in a single ALTER — Postgres 11+ avoids full-table rewrite for ALTER ADD COLUMN with constant default. Verify before production apply. |
| Trigger function name collision | Prefixed name `reject_token_event_mutation` is feature-specific; no collision risk. |
| `TokenEventType` enum values can't be removed without a multi-step migration | Document that adding values is forward-compatible; removing requires Phase-N migration. Acceptable. |
| Seed orgs lack `TokenAlertSetting` row | Phase 2 service auto-creates a default row on first read for any org with `tokenAlertsEnabled = true`. No backfill needed. |
| `Decimal(10, 6)` precision insufficient | Worst case: 1 wallet token = 9999.999999 cents = $99.99/token. Far beyond any plausible value. Safe. |

---

## 9. Awaiting approval

Reply with **"approved, apply Phase 1"** to proceed with the application sequence in §7. Specific items to flag if you want changed:

- Any of the column types/sizes (e.g., `Decimal(10,6)` precision, `BigInt` for `refillTokenAmount`).
- Defaults that should differ (e.g., default `cooldownMinutes`, default `recipientRoles`).
- Any indexes you want added that I haven't included.
- Whether to run on staging first or go straight to production (staging is safer; recommended).

Total schema changes: **+4 tables, +1 enum, +4 columns, +3 indexes (beyond constraints), +2 triggers**. No destructive changes.
