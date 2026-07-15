-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('Draft', 'Published', 'Archived');

-- AlterTable: convert course title string → localized JSON, add status/description
ALTER TABLE "courses" ADD COLUMN "title_new" JSONB;
UPDATE "courses"
SET "title_new" = json_build_object('en', "title", 'si', "title", 'ta', "title");
ALTER TABLE "courses" DROP COLUMN "title";
ALTER TABLE "courses" RENAME COLUMN "title_new" TO "title";
ALTER TABLE "courses" ALTER COLUMN "title" SET NOT NULL;

ALTER TABLE "courses" ADD COLUMN "description" JSONB,
ADD COLUMN "status" "CourseStatus" NOT NULL DEFAULT 'Draft',
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable (TEXT ids to match existing courses/quizzes tables)
CREATE TABLE "modules" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "status" "CourseStatus" NOT NULL DEFAULT 'Draft',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modules_course_id_idx" ON "modules"("course_id");

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
