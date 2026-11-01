-- AlterEnum
ALTER TYPE "Subject" ADD VALUE IF NOT EXISTS 'CLASSES';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ClassBatchStatus" AS ENUM ('Draft', 'Published', 'Archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ClassTeacherScope" AS ENUM ('OWNER', 'INSTRUCTOR', 'ASSISTANT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ClassLocationType" AS ENUM ('ONLINE', 'PHYSICAL', 'HYBRID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ClassEnrollmentStatus" AS ENUM ('INVITED', 'PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "class_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "workspace_id" UUID,
    "primary_teacher_id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "grade" VARCHAR(64),
    "subject" VARCHAR(120),
    "academic_year" INTEGER NOT NULL,
    "languages" "ContentLanguage"[] DEFAULT ARRAY['en']::"ContentLanguage"[],
    "capacity" INTEGER,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" "ClassBatchStatus" NOT NULL DEFAULT 'Draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "class_teachers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "permission_scope" "ClassTeacherScope" NOT NULL DEFAULT 'INSTRUCTOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "class_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "local_start_time" VARCHAR(5) NOT NULL,
    "local_end_time" VARCHAR(5) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo',
    "location_type" "ClassLocationType" NOT NULL DEFAULT 'ONLINE',
    "location_value" VARCHAR(500),
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "class_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "ClassEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "class_batches_course_id_idx" ON "class_batches"("course_id");
CREATE INDEX IF NOT EXISTS "class_batches_workspace_id_idx" ON "class_batches"("workspace_id");
CREATE INDEX IF NOT EXISTS "class_batches_primary_teacher_id_idx" ON "class_batches"("primary_teacher_id");
CREATE INDEX IF NOT EXISTS "class_batches_status_idx" ON "class_batches"("status");
CREATE INDEX IF NOT EXISTS "class_batches_academic_year_idx" ON "class_batches"("academic_year");
CREATE INDEX IF NOT EXISTS "class_batches_grade_idx" ON "class_batches"("grade");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "class_teachers_class_id_teacher_id_key" ON "class_teachers"("class_id", "teacher_id");
CREATE INDEX IF NOT EXISTS "class_teachers_teacher_id_idx" ON "class_teachers"("teacher_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "class_schedules_class_id_weekday_idx" ON "class_schedules"("class_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "class_enrollments_class_id_student_id_key" ON "class_enrollments"("class_id", "student_id");
CREATE INDEX IF NOT EXISTS "class_enrollments_student_id_status_idx" ON "class_enrollments"("student_id", "status");
CREATE INDEX IF NOT EXISTS "class_enrollments_class_id_status_idx" ON "class_enrollments"("class_id", "status");

-- AddForeignKey
ALTER TABLE "class_batches" ADD CONSTRAINT "class_batches_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "class_batches" ADD CONSTRAINT "class_batches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "class_batches" ADD CONSTRAINT "class_batches_primary_teacher_id_fkey" FOREIGN KEY ("primary_teacher_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

