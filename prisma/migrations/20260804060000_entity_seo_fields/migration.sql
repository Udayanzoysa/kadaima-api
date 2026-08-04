-- Per-entity SEO overrides for public quiz and course pages.
-- Both nullable: NULL/blank means "fall back to the derived title/description".
ALTER TABLE "quizzes"
  ADD COLUMN "seo_title" VARCHAR(255),
  ADD COLUMN "seo_description" TEXT;

ALTER TABLE "courses"
  ADD COLUMN "seo_title" VARCHAR(255),
  ADD COLUMN "seo_description" TEXT;
