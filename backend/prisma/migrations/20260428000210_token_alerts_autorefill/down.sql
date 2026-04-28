-- ============================================================
-- Token Alerts & Auto-Refill — Phase 1 ROLLBACK
-- Run manually if Phase 1 needs to be reversed BEFORE Phase 2 ships.
-- After Phase 2 deploys code that depends on these tables, this
-- rollback becomes UNSAFE — it would break the running app.
-- ============================================================

-- Triggers + function on TokenEvent
DROP TRIGGER IF EXISTS "TokenEvent_no_delete" ON "TokenEvent";
DROP TRIGGER IF EXISTS "TokenEvent_no_update" ON "TokenEvent";
DROP FUNCTION IF EXISTS reject_token_event_mutation();

-- Drop new tables (FKs cascade implicitly via ON DELETE rules; explicit
-- order avoids any RESTRICT-blocked drops)
DROP TABLE IF EXISTS "PendingJob";
DROP TABLE IF EXISTS "TokenEvent";
DROP TABLE IF EXISTS "TokenRefillRule";
DROP TABLE IF EXISTS "TokenAlertSetting";

-- Drop the enum type (must be after TokenEvent is dropped)
DROP TYPE IF EXISTS "TokenEventType";

-- Reverse Organization additions
ALTER TABLE "Organization"
  DROP COLUMN IF EXISTS "tokenToCentsRate",
  DROP COLUMN IF EXISTS "tokenAlertsEnabled";

-- Reverse TokenWallet additions
ALTER TABLE "TokenWallet"
  DROP COLUMN IF EXISTS "lastAlertSentAt",
  DROP COLUMN IF EXISTS "lastAlertTier";
