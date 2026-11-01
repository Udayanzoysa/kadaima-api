-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "homepage" JSONB;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
