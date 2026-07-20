-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN "languages" "ContentLanguage"[] DEFAULT ARRAY['en']::"ContentLanguage"[];

-- Backfill from existing single language
UPDATE "quizzes" SET "languages" = ARRAY["language"]::"ContentLanguage"[];
