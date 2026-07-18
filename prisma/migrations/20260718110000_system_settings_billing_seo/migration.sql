-- Columns that existed in schema (local db push) but had no migrate history.
-- Safe to run on prod if already present.
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "billing" JSONB;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "seo" JSONB;
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "ai" JSONB;
