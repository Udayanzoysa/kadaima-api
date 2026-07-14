-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('Draft', 'Published', 'Archived');
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'SHORT_TEXT');
CREATE TYPE "AttemptStatus" AS ENUM ('In_Progress', 'Submitted', 'Timed_Out');

-- AlterEnum
ALTER TYPE "Subject" ADD VALUE IF NOT EXISTS 'QUIZZES';

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quizzes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "duration_minutes" INTEGER NOT NULL,
    "passing_score_percentage" INTEGER NOT NULL DEFAULT 70,
    "status" "QuizStatus" NOT NULL DEFAULT 'Draft',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_id" UUID NOT NULL,
    "question_text" JSONB NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
    "points" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "answer_choices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "choice_text" JSONB NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "answer_choices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "status" "AttemptStatus" NOT NULL DEFAULT 'In_Progress',
    "final_score" INTEGER NOT NULL DEFAULT 0,
    "is_passed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_choice_id" UUID,
    "text_response" TEXT,
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "student_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quizzes_course_id_idx" ON "quizzes"("course_id");
CREATE INDEX "quizzes_created_by_idx" ON "quizzes"("created_by");
CREATE INDEX "questions_quiz_id_idx" ON "questions"("quiz_id");
CREATE INDEX "answer_choices_question_id_idx" ON "answer_choices"("question_id");
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts"("quiz_id");
CREATE INDEX "quiz_attempts_student_id_idx" ON "quiz_attempts"("student_id");
CREATE INDEX "student_responses_attempt_id_idx" ON "student_responses"("attempt_id");
CREATE INDEX "student_responses_question_id_idx" ON "student_responses"("question_id");

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "answer_choices" ADD CONSTRAINT "answer_choices_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_selected_choice_id_fkey" FOREIGN KEY ("selected_choice_id") REFERENCES "answer_choices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Analytics View
CREATE OR REPLACE VIEW view_quiz_analytics AS
SELECT
    q.id AS quiz_id,
    q.title->>'en' AS quiz_title_en,
    COUNT(qa.id) AS total_attempts,
    ROUND(AVG(qa.final_score), 2) AS average_class_score,
    MAX(qa.final_score) AS highest_score,
    MIN(qa.final_score) AS lowest_score,
    COUNT(CASE WHEN qa.is_passed = true THEN 1 END) * 100.0 / NULLIF(COUNT(qa.id), 0) AS passing_rate_percentage
FROM quizzes q
LEFT JOIN quiz_attempts qa ON q.id = qa.quiz_id AND qa.status != 'In_Progress'
GROUP BY q.id;
