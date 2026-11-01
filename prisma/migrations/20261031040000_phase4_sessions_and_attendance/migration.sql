-- Phase 4: Class Sessions, Attendance Records & Correction Audit Trail

CREATE TYPE "ClassSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'UNMARKED');

CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "schedule_id" UUID,
    "starts_at_utc" TIMESTAMP(3) NOT NULL,
    "ends_at_utc" TIMESTAMP(3) NOT NULL,
    "local_date" VARCHAR(10) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo',
    "status" "ClassSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" JSONB,
    "cancellation_reason" VARCHAR(500),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'UNMARKED',
    "note" VARCHAR(500),
    "marked_by" UUID,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendance_record_id" UUID NOT NULL,
    "class_session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "actor_id" UUID,
    "previous_status" "AttendanceStatus",
    "new_status" "AttendanceStatus" NOT NULL,
    "reason" VARCHAR(500),
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_sessions_class_id_starts_at_utc_key" ON "class_sessions"("class_id", "starts_at_utc");
CREATE INDEX "class_sessions_class_id_local_date_idx" ON "class_sessions"("class_id", "local_date");
CREATE INDEX "class_sessions_class_id_status_idx" ON "class_sessions"("class_id", "status");

CREATE UNIQUE INDEX "attendance_records_class_session_id_student_id_key" ON "attendance_records"("class_session_id", "student_id");
CREATE INDEX "attendance_records_student_id_status_idx" ON "attendance_records"("student_id", "status");
CREATE INDEX "attendance_records_class_session_id_status_idx" ON "attendance_records"("class_session_id", "status");

CREATE INDEX "attendance_changes_class_session_id_changed_at_idx" ON "attendance_changes"("class_session_id", "changed_at");
CREATE INDEX "attendance_changes_student_id_changed_at_idx" ON "attendance_changes"("student_id", "changed_at");

ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "class_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_fkey" FOREIGN KEY ("marked_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_changes" ADD CONSTRAINT "attendance_changes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
