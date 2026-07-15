-- Quiz unlock / PayHere scaffolding (TEXT ids match live DB)

-- Enums
DO $$ BEGIN
  CREATE TYPE "PaymentOrderStatus" AS ENUM ('Pending', 'Paid', 'Failed', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentProvider" AS ENUM ('PayHere');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "UnlockMethod" AS ENUM ('PayHere', 'Voucher', 'Slip');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SlipSubmissionStatus" AS ENUM ('Pending', 'Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Quiz columns
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "module_id" TEXT;
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "requires_unlock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quizzes" ADD COLUMN IF NOT EXISTS "price_lkr" DECIMAL(12,2);

CREATE INDEX IF NOT EXISTS "quizzes_module_id_idx" ON "quizzes"("module_id");

DO $$ BEGIN
  ALTER TABLE "quizzes"
    ADD CONSTRAINT "quizzes_module_id_fkey"
    FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payment orders
CREATE TABLE IF NOT EXISTS "payment_orders" (
  "id" TEXT NOT NULL,
  "order_id" VARCHAR(64) NOT NULL,
  "quiz_id" TEXT NOT NULL,
  "guest_session_id" VARCHAR(64),
  "user_id" TEXT,
  "amount_lkr" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'LKR',
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'Pending',
  "provider" "PaymentProvider" NOT NULL DEFAULT 'PayHere',
  "provider_payment_id" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_order_id_key" ON "payment_orders"("order_id");
CREATE INDEX IF NOT EXISTS "payment_orders_quiz_id_idx" ON "payment_orders"("quiz_id");
CREATE INDEX IF NOT EXISTS "payment_orders_guest_session_id_idx" ON "payment_orders"("guest_session_id");
CREATE INDEX IF NOT EXISTS "payment_orders_user_id_idx" ON "payment_orders"("user_id");

DO $$ BEGIN
  ALTER TABLE "payment_orders"
    ADD CONSTRAINT "payment_orders_quiz_id_fkey"
    FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_orders"
    ADD CONSTRAINT "payment_orders_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Unlock vouchers (scaffold)
CREATE TABLE IF NOT EXISTS "unlock_vouchers" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "quiz_id" TEXT,
  "max_redemptions" INTEGER NOT NULL DEFAULT 1,
  "redemption_count" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unlock_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "unlock_vouchers_code_key" ON "unlock_vouchers"("code");
CREATE INDEX IF NOT EXISTS "unlock_vouchers_quiz_id_idx" ON "unlock_vouchers"("quiz_id");

DO $$ BEGIN
  ALTER TABLE "unlock_vouchers"
    ADD CONSTRAINT "unlock_vouchers_quiz_id_fkey"
    FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Payment slip submissions (scaffold)
CREATE TABLE IF NOT EXISTS "payment_slip_submissions" (
  "id" TEXT NOT NULL,
  "quiz_id" TEXT NOT NULL,
  "guest_session_id" VARCHAR(64),
  "user_id" TEXT,
  "slip_image_url" TEXT NOT NULL,
  "note" TEXT,
  "status" "SlipSubmissionStatus" NOT NULL DEFAULT 'Pending',
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_slip_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_slip_submissions_quiz_id_idx" ON "payment_slip_submissions"("quiz_id");
CREATE INDEX IF NOT EXISTS "payment_slip_submissions_guest_session_id_idx" ON "payment_slip_submissions"("guest_session_id");
CREATE INDEX IF NOT EXISTS "payment_slip_submissions_user_id_idx" ON "payment_slip_submissions"("user_id");

DO $$ BEGIN
  ALTER TABLE "payment_slip_submissions"
    ADD CONSTRAINT "payment_slip_submissions_quiz_id_fkey"
    FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_slip_submissions"
    ADD CONSTRAINT "payment_slip_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Quiz unlocks
CREATE TABLE IF NOT EXISTS "quiz_unlocks" (
  "id" TEXT NOT NULL,
  "quiz_id" TEXT NOT NULL,
  "guest_session_id" VARCHAR(64),
  "user_id" TEXT,
  "method" "UnlockMethod" NOT NULL,
  "payment_order_id" TEXT,
  "voucher_code_id" TEXT,
  "slip_submission_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quiz_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quiz_unlocks_payment_order_id_key" ON "quiz_unlocks"("payment_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_unlocks_slip_submission_id_key" ON "quiz_unlocks"("slip_submission_id");
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_unlocks_quiz_id_guest_session_id_key" ON "quiz_unlocks"("quiz_id", "guest_session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_unlocks_quiz_id_user_id_key" ON "quiz_unlocks"("quiz_id", "user_id");
CREATE INDEX IF NOT EXISTS "quiz_unlocks_guest_session_id_idx" ON "quiz_unlocks"("guest_session_id");
CREATE INDEX IF NOT EXISTS "quiz_unlocks_user_id_idx" ON "quiz_unlocks"("user_id");

DO $$ BEGIN
  ALTER TABLE "quiz_unlocks"
    ADD CONSTRAINT "quiz_unlocks_quiz_id_fkey"
    FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "quiz_unlocks"
    ADD CONSTRAINT "quiz_unlocks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "quiz_unlocks"
    ADD CONSTRAINT "quiz_unlocks_payment_order_id_fkey"
    FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "quiz_unlocks"
    ADD CONSTRAINT "quiz_unlocks_voucher_code_id_fkey"
    FOREIGN KEY ("voucher_code_id") REFERENCES "unlock_vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "quiz_unlocks"
    ADD CONSTRAINT "quiz_unlocks_slip_submission_id_fkey"
    FOREIGN KEY ("slip_submission_id") REFERENCES "payment_slip_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
