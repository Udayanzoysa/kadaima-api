-- Phase 5: Tuition Billing, Class Fee Plans, Student Invoices, Adjustments & Ledger

CREATE TYPE "ClassFeeFrequency" AS ENUM ('MONTHLY', 'ONE_TIME');
CREATE TYPE "ClassProrationPolicy" AS ENUM ('FULL_MONTH', 'PRORATE_BY_DAYS');
CREATE TYPE "ClassOverdueAccessPolicy" AS ENUM ('ALLOW_WITH_WARNING', 'BLOCK_AFTER_GRACE');
CREATE TYPE "TuitionInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOIDED', 'WAIVED');
CREATE TYPE "TuitionAdjustmentType" AS ENUM ('DISCOUNT', 'WAIVER', 'SURCHARGE', 'VOID');
CREATE TYPE "TuitionPaymentChannel" AS ENUM ('ONLINE_GATEWAY', 'BANK_TRANSFER', 'CASH', 'SCHOLARSHIP');
CREATE TYPE "TuitionPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK');

CREATE TABLE "class_fee_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "name" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'LKR',
    "frequency" "ClassFeeFrequency" NOT NULL DEFAULT 'MONTHLY',
    "due_day" INTEGER NOT NULL DEFAULT 10,
    "grace_days" INTEGER NOT NULL DEFAULT 5,
    "proration_policy" "ClassProrationPolicy" NOT NULL DEFAULT 'FULL_MONTH',
    "overdue_access_policy" "ClassOverdueAccessPolicy" NOT NULL DEFAULT 'ALLOW_WITH_WARNING',
    "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_fee_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tuition_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_plan_id" UUID NOT NULL,
    "period_yyyy_mm" VARCHAR(7) NOT NULL,
    "invoice_number" VARCHAR(64) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'LKR',
    "subtotal_minor" INTEGER NOT NULL,
    "discount_minor" INTEGER NOT NULL DEFAULT 0,
    "surcharge_minor" INTEGER NOT NULL DEFAULT 0,
    "total_minor" INTEGER NOT NULL,
    "paid_minor" INTEGER NOT NULL DEFAULT 0,
    "balance_minor" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "grace_days" INTEGER NOT NULL DEFAULT 5,
    "status" "TuitionInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "plan_snapshot_json" JSONB NOT NULL,
    "notes" VARCHAR(500),
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuition_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tuition_invoice_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "type" "TuitionAdjustmentType" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuition_invoice_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tuition_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "payer_id" UUID NOT NULL,
    "channel" "TuitionPaymentChannel" NOT NULL DEFAULT 'CASH',
    "gateway" VARCHAR(64),
    "external_reference" VARCHAR(128),
    "currency" VARCHAR(8) NOT NULL DEFAULT 'LKR',
    "amount_minor" INTEGER NOT NULL,
    "status" "TuitionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" VARCHAR(500),
    "verified_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuition_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tuition_payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuition_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tuition_billing_audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "invoice_id" UUID,
    "actor_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "previous_values" JSONB,
    "new_values" JSONB,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuition_billing_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_fee_plans_class_id_is_active_version_idx" ON "class_fee_plans"("class_id", "is_active", "version");

CREATE UNIQUE INDEX "tuition_invoices_invoice_number_key" ON "tuition_invoices"("invoice_number");
CREATE UNIQUE INDEX "tuition_invoices_enrollment_id_period_yyyy_mm_key" ON "tuition_invoices"("enrollment_id", "period_yyyy_mm");
CREATE UNIQUE INDEX "tuition_invoices_class_id_student_id_period_yyyy_mm_key" ON "tuition_invoices"("class_id", "student_id", "period_yyyy_mm");
CREATE INDEX "tuition_invoices_class_id_period_yyyy_mm_status_idx" ON "tuition_invoices"("class_id", "period_yyyy_mm", "status");
CREATE INDEX "tuition_invoices_student_id_period_yyyy_mm_idx" ON "tuition_invoices"("student_id", "period_yyyy_mm");

CREATE INDEX "tuition_invoice_adjustments_invoice_id_created_at_idx" ON "tuition_invoice_adjustments"("invoice_id", "created_at");

CREATE UNIQUE INDEX "tuition_payments_external_reference_key" ON "tuition_payments"("external_reference");
CREATE INDEX "tuition_payments_class_id_status_idx" ON "tuition_payments"("class_id", "status");
CREATE INDEX "tuition_payments_payer_id_created_at_idx" ON "tuition_payments"("payer_id", "created_at");

CREATE UNIQUE INDEX "tuition_payment_allocations_payment_id_invoice_id_key" ON "tuition_payment_allocations"("payment_id", "invoice_id");
CREATE INDEX "tuition_payment_allocations_invoice_id_idx" ON "tuition_payment_allocations"("invoice_id");

CREATE INDEX "tuition_billing_audit_events_class_id_created_at_idx" ON "tuition_billing_audit_events"("class_id", "created_at");
CREATE INDEX "tuition_billing_audit_events_invoice_id_created_at_idx" ON "tuition_billing_audit_events"("invoice_id", "created_at");

ALTER TABLE "class_fee_plans" ADD CONSTRAINT "class_fee_plans_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_fee_plans" ADD CONSTRAINT "class_fee_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "class_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_invoices" ADD CONSTRAINT "tuition_invoices_fee_plan_id_fkey" FOREIGN KEY ("fee_plan_id") REFERENCES "class_fee_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tuition_invoice_adjustments" ADD CONSTRAINT "tuition_invoice_adjustments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "tuition_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_invoice_adjustments" ADD CONSTRAINT "tuition_invoice_adjustments_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_payments" ADD CONSTRAINT "tuition_payments_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tuition_payment_allocations" ADD CONSTRAINT "tuition_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "tuition_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_payment_allocations" ADD CONSTRAINT "tuition_payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "tuition_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tuition_billing_audit_events" ADD CONSTRAINT "tuition_billing_audit_events_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_billing_audit_events" ADD CONSTRAINT "tuition_billing_audit_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "tuition_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tuition_billing_audit_events" ADD CONSTRAINT "tuition_billing_audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

