BEGIN;

ALTER TABLE "AIModel" ADD COLUMN "markupMultiplier" DOUBLE PRECISION DEFAULT 1.275;
ALTER TABLE "AIModel" ADD COLUMN "providerBaseCostInput" DOUBLE PRECISION;
ALTER TABLE "AIModel" ADD COLUMN "providerBaseCostOutput" DOUBLE PRECISION;

UPDATE "AIModel" SET
  "providerBaseCostInput"  = "inputTokenPrice",
  "providerBaseCostOutput" = "outputTokenPrice"
WHERE "isActive" = true;

UPDATE "AIModel" SET
  "markupPercentage" = 27.5,
  "markupMultiplier" = 1.275
WHERE "isActive" = true;

INSERT INTO "AIModel" (
  id, name, provider, "modelId",
  "inputTokenPrice", "outputTokenPrice",
  "markupPercentage", "markupMultiplier",
  "providerBaseCostInput", "providerBaseCostOutput",
  capabilities, "contextWindow", "isActive",
  "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(), 'Google Veo 2', 'google', 'veo-2.0-generate-001',
  0, 0.00007,
  27.5, 1.275,
  0, 0.00007,
  ARRAY['video_generation'], 0, true,
  NOW(), NOW()
) ON CONFLICT ("modelId") DO NOTHING;

DO $$
DECLARE
  mismatched_markup  INT;
  missing_base       INT;
  veo_count          INT;
BEGIN
  SELECT COUNT(*) INTO mismatched_markup
    FROM "AIModel"
    WHERE "isActive" = true AND "markupPercentage" != 27.5;
  IF mismatched_markup > 0 THEN
    RAISE EXCEPTION 'ABORT: % active rows still != 27.5 markup', mismatched_markup;
  END IF;

  SELECT COUNT(*) INTO missing_base
    FROM "AIModel"
    WHERE "isActive" = true AND "providerBaseCostInput" IS NULL;
  IF missing_base > 0 THEN
    RAISE EXCEPTION 'ABORT: % active rows missing providerBaseCostInput', missing_base;
  END IF;

  SELECT COUNT(*) INTO veo_count
    FROM "AIModel"
    WHERE "modelId" = 'veo-2.0-generate-001';
  IF veo_count != 1 THEN
    RAISE EXCEPTION 'ABORT: Veo seed failed (% rows)', veo_count;
  END IF;

  RAISE NOTICE 'Migration verified: all active rows at 27.5%% markup, Veo seeded';
END $$;

COMMIT;
