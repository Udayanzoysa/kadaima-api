-- AlterTable
ALTER TABLE "chat_leads" ADD COLUMN "quiz_id" UUID;
ALTER TABLE "chat_leads" ADD COLUMN "quiz_title" VARCHAR(500);

-- AddForeignKey
ALTER TABLE "chat_leads" ADD CONSTRAINT "chat_leads_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "chat_leads_quiz_id_idx" ON "chat_leads"("quiz_id");
