-- AlterEnum
ALTER TYPE "Subject" ADD VALUE 'LEADS';

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "purpose" VARCHAR(32) NOT NULL DEFAULT 'QUIZ',
ALTER COLUMN "quiz_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "student_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "amount_lkr" DECIMAL(12,2) NOT NULL,
    "payment_order_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_leads" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mobile_number" TEXT NOT NULL,
    "age" INTEGER,
    "school" TEXT,
    "tag" TEXT NOT NULL DEFAULT 'Chatbot',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_subscriptions_payment_order_id_key" ON "student_subscriptions"("payment_order_id");

-- CreateIndex
CREATE INDEX "student_subscriptions_user_id_idx" ON "student_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "student_subscriptions_expires_at_idx" ON "student_subscriptions"("expires_at");

-- CreateIndex
CREATE INDEX "payment_orders_purpose_idx" ON "payment_orders"("purpose");

-- AddForeignKey
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subscriptions" ADD CONSTRAINT "student_subscriptions_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
