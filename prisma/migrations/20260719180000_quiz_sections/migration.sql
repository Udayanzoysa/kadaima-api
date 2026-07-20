-- CreateTable
CREATE TABLE "quiz_sections" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "instruction" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_sections_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "quiz_questions" ADD COLUMN "section_id" UUID;

-- CreateIndex
CREATE INDEX "quiz_sections_quiz_id_idx" ON "quiz_sections"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_questions_section_id_idx" ON "quiz_questions"("section_id");

-- AddForeignKey
ALTER TABLE "quiz_sections" ADD CONSTRAINT "quiz_sections_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "quiz_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
