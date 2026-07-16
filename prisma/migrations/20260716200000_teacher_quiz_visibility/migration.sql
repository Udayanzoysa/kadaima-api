-- CreateEnum
CREATE TYPE "TeacherQuizVisibility" AS ENUM ('ALL', 'SELECTED');

-- AlterTable
ALTER TABLE "teacher_profiles"
  ADD COLUMN "quiz_visibility" "TeacherQuizVisibility" NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "teacher_profile_quizzes" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_profile_quizzes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teacher_profile_quizzes_profile_id_quiz_id_key"
  ON "teacher_profile_quizzes"("profile_id", "quiz_id");
CREATE INDEX "teacher_profile_quizzes_profile_id_idx" ON "teacher_profile_quizzes"("profile_id");
CREATE INDEX "teacher_profile_quizzes_quiz_id_idx" ON "teacher_profile_quizzes"("quiz_id");

ALTER TABLE "teacher_profile_quizzes" ADD CONSTRAINT "teacher_profile_quizzes_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "teacher_profile_quizzes" ADD CONSTRAINT "teacher_profile_quizzes_quiz_id_fkey"
  FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
