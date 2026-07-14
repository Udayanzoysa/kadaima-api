-- Expand question types for Paper I / Paper II style assessments
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'NUMERIC';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'SEQUENCE';
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'ESSAY';

ALTER TABLE "questions"
ADD COLUMN IF NOT EXISTS "image_url" TEXT,
ADD COLUMN IF NOT EXISTS "config" JSONB;

ALTER TABLE "student_responses"
ADD COLUMN IF NOT EXISTS "needs_manual_review" BOOLEAN NOT NULL DEFAULT false;
