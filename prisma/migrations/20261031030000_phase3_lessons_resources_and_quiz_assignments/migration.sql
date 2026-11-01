-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('Draft', 'Published', 'Scheduled', 'Archived');

-- CreateEnum
CREATE TYPE "LessonResourceType" AS ENUM ('PDF', 'DOCUMENT', 'IMAGE', 'VIDEO_EMBED', 'EXTERNAL_LINK', 'TEACHER_NOTE');

-- CreateEnum
CREATE TYPE "LessonResourceAccessPolicy" AS ENUM ('VIEW_ONLY', 'DOWNLOADABLE');

-- CreateEnum
CREATE TYPE "LessonResourceScanStatus" AS ENUM ('CLEAN', 'PENDING', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "ClassQuizAssignmentStatus" AS ENUM ('Draft', 'Published', 'Archived');

-- CreateTable: lessons
CREATE TABLE "lessons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module_id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "summary" JSONB,
    "body" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "LessonStatus" NOT NULL DEFAULT 'Draft',
    "publish_at" TIMESTAMP(3),
    "estimated_minutes" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable: lesson_resources
CREATE TABLE "lesson_resources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "lesson_id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "type" "LessonResourceType" NOT NULL,
    "storage_key" VARCHAR(500),
    "file_name" VARCHAR(255),
    "external_url" VARCHAR(1000),
    "note_text" JSONB,
    "mime_type" VARCHAR(128),
    "size_bytes" INTEGER,
    "access_policy" "LessonResourceAccessPolicy" NOT NULL DEFAULT 'DOWNLOADABLE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "scan_status" "LessonResourceScanStatus" NOT NULL DEFAULT 'CLEAN',
    "checksum_sha256" VARCHAR(64),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable: lesson_progress
CREATE TABLE "lesson_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable: class_quiz_assignments
CREATE TABLE "class_quiz_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "lesson_id" UUID,
    "quiz_id" UUID NOT NULL,
    "display_title" JSONB,
    "available_from" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "status" "ClassQuizAssignmentStatus" NOT NULL DEFAULT 'Published',
    "assigned_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_quiz_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_module_id_sort_order_idx" ON "lessons"("module_id", "sort_order");

-- CreateIndex
CREATE INDEX "lessons_module_id_status_idx" ON "lessons"("module_id", "status");

-- CreateIndex
CREATE INDEX "lesson_resources_lesson_id_sort_order_idx" ON "lesson_resources"("lesson_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_class_id_student_id_lesson_id_key" ON "lesson_progress"("class_id", "student_id", "lesson_id");

-- CreateIndex
CREATE INDEX "lesson_progress_student_id_class_id_idx" ON "lesson_progress"("student_id", "class_id");

-- CreateIndex
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_quiz_assignments_class_id_quiz_id_key" ON "class_quiz_assignments"("class_id", "quiz_id");

-- CreateIndex
CREATE INDEX "class_quiz_assignments_class_id_status_idx" ON "class_quiz_assignments"("class_id", "status");

-- CreateIndex
CREATE INDEX "class_quiz_assignments_lesson_id_idx" ON "class_quiz_assignments"("lesson_id");

-- CreateIndex
CREATE INDEX "class_quiz_assignments_quiz_id_idx" ON "class_quiz_assignments"("quiz_id");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_quiz_assignments" ADD CONSTRAINT "class_quiz_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_quiz_assignments" ADD CONSTRAINT "class_quiz_assignments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_quiz_assignments" ADD CONSTRAINT "class_quiz_assignments_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_quiz_assignments" ADD CONSTRAINT "class_quiz_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

