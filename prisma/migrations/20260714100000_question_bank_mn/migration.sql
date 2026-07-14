-- Question bank M:N + shuffle (TEXT ids to match prisma db push schema)

DO $$ BEGIN
  CREATE TYPE "QuestionStatus" AS ENUM ('Draft', 'Published', 'Archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "quizzes"
  ADD COLUMN IF NOT EXISTS "shuffle_questions" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "quiz_attempts"
  ADD COLUMN IF NOT EXISTS "question_order" JSONB;

DROP TABLE IF EXISTS "quiz_questions";

CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "quiz_questions" ("id", "quiz_id", "question_id", "sort_order")
SELECT
  md5(random()::text || clock_timestamp()::text || q."id"),
  q."quiz_id",
  q."id",
  COALESCE(q."sort_order", 0)
FROM "questions" q
WHERE q."quiz_id" IS NOT NULL;

ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "status" "QuestionStatus" NOT NULL DEFAULT 'Published';

ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "created_by" TEXT;

ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "questions"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "questions" DROP CONSTRAINT IF EXISTS "questions_quiz_id_fkey";
DROP INDEX IF EXISTS "questions_quiz_id_idx";

ALTER TABLE "questions" DROP COLUMN IF EXISTS "quiz_id";
ALTER TABLE "questions" DROP COLUMN IF EXISTS "sort_order";

CREATE UNIQUE INDEX "quiz_questions_quiz_id_question_id_key"
  ON "quiz_questions"("quiz_id", "question_id");
CREATE INDEX "quiz_questions_quiz_id_idx" ON "quiz_questions"("quiz_id");
CREATE INDEX "quiz_questions_question_id_idx" ON "quiz_questions"("question_id");
CREATE INDEX IF NOT EXISTS "questions_created_by_idx" ON "questions"("created_by");
CREATE INDEX IF NOT EXISTS "questions_status_idx" ON "questions"("status");

ALTER TABLE "quiz_questions"
  ADD CONSTRAINT "quiz_questions_quiz_id_fkey"
  FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quiz_questions"
  ADD CONSTRAINT "quiz_questions_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
