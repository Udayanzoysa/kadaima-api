-- CreateEnum
CREATE TYPE "ContentLanguage" AS ENUM ('en', 'si', 'ta');

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN "language" "ContentLanguage" NOT NULL DEFAULT 'en';
