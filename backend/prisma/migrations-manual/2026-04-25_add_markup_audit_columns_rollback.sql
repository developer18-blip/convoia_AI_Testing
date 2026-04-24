-- ROLLBACK for markup migration 2026-04-25
-- Run via: sudo -u postgres psql -d convoia_ai -f ~/convoia_markup_rollback.sql

BEGIN;

UPDATE "AIModel" SET "markupPercentage" = 25 WHERE "isActive" = true;
DELETE FROM "AIModel" WHERE "modelId" = 'veo-2.0-generate-001';
ALTER TABLE "AIModel" DROP COLUMN IF EXISTS "markupMultiplier";
ALTER TABLE "AIModel" DROP COLUMN IF EXISTS "providerBaseCostInput";
ALTER TABLE "AIModel" DROP COLUMN IF EXISTS "providerBaseCostOutput";

DO $$
DECLARE bad_rows INT;
BEGIN
  SELECT COUNT(*) INTO bad_rows FROM "AIModel" WHERE "isActive" = true AND "markupPercentage" != 25;
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'Rollback incomplete: % rows not at 25%% markup', bad_rows;
  END IF;
  RAISE NOTICE 'Rollback verified: all active rows back at 25%% markup';
END $$;

COMMIT;
