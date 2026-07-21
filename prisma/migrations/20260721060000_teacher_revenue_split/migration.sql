-- CreateEnum
CREATE TYPE "RevenuePeriodStatus" AS ENUM ('Open', 'Calculating', 'Settled', 'Paid');

-- CreateEnum
CREATE TYPE "TeacherPayoutStatus" AS ENUM ('Pending', 'Approved', 'Paid', 'Held');

-- AlterTable
ALTER TABLE "quiz_attempts" ADD COLUMN "teacher_user_id" UUID;

-- Backfill teacher from quiz owner
UPDATE "quiz_attempts" AS a
SET "teacher_user_id" = q."created_by"
FROM "quizzes" AS q
WHERE a."quiz_id" = q."id"
  AND a."teacher_user_id" IS NULL;

-- CreateTable
CREATE TABLE "revenue_periods" (
    "id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "gross_revenue_lkr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platform_share_lkr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "teacher_pool_lkr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_billable_attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "RevenuePeriodStatus" NOT NULL DEFAULT 'Open',
    "calculated_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_revenue_shares" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "attempt_count" INTEGER NOT NULL,
    "share_ratio" DECIMAL(12,8) NOT NULL,
    "amount_lkr" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_revenue_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_payouts" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "amount_lkr" DECIMAL(12,2) NOT NULL,
    "status" "TeacherPayoutStatus" NOT NULL DEFAULT 'Pending',
    "paid_at" TIMESTAMP(3),
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_payout_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_name" VARCHAR(255),
    "bank_name" VARCHAR(255),
    "account_number" VARCHAR(64),
    "branch" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_payout_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quiz_attempts_teacher_user_id_idx" ON "quiz_attempts"("teacher_user_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_submitted_at_status_idx" ON "quiz_attempts"("submitted_at", "status");

-- CreateIndex
CREATE INDEX "quiz_attempts_teacher_user_id_submitted_at_idx" ON "quiz_attempts"("teacher_user_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_periods_period_start_key" ON "revenue_periods"("period_start");

-- CreateIndex
CREATE INDEX "revenue_periods_status_idx" ON "revenue_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_revenue_shares_period_id_teacher_user_id_key" ON "teacher_revenue_shares"("period_id", "teacher_user_id");

-- CreateIndex
CREATE INDEX "teacher_revenue_shares_teacher_user_id_idx" ON "teacher_revenue_shares"("teacher_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_payouts_period_id_teacher_user_id_key" ON "teacher_payouts"("period_id", "teacher_user_id");

-- CreateIndex
CREATE INDEX "teacher_payouts_teacher_user_id_idx" ON "teacher_payouts"("teacher_user_id");

-- CreateIndex
CREATE INDEX "teacher_payouts_status_idx" ON "teacher_payouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_payout_profiles_user_id_key" ON "teacher_payout_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_revenue_shares" ADD CONSTRAINT "teacher_revenue_shares_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "revenue_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_revenue_shares" ADD CONSTRAINT "teacher_revenue_shares_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_payouts" ADD CONSTRAINT "teacher_payouts_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "revenue_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_payouts" ADD CONSTRAINT "teacher_payouts_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_payout_profiles" ADD CONSTRAINT "teacher_payout_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
