-- ============================================================
-- Token Alerts & Auto-Refill — Phase 1 schema
-- Generated 2026-04-27 from docs/features/token-alerts-phase1-design.md
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

-- 4. TokenAlertSetting (one row per org)
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

-- 5. TokenRefillRule (per org+user)
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

-- 6. TokenEvent (append-only audit log)
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

-- 7. Append-only enforcement on TokenEvent
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

-- 8. PendingJob (DB-polled worker queue)
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
