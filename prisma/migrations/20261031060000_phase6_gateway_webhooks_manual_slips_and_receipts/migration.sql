-- Phase 6: Payment Gateway Events, Manual Cash/Bank Submissions & Immutable Receipts

ALTER TABLE "tuition_payments"
  ADD COLUMN "provider_order_id" VARCHAR(64),
  ADD COLUMN "provider_payment_id" VARCHAR(128),
  ADD COLUMN "refunded_minor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "is_test_mode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_reason" VARCHAR(500),
  ADD COLUMN "refunded_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "tuition_payments_provider_order_id_key" ON "tuition_payments"("provider_order_id");

CREATE TABLE "tuition_payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" VARCHAR(32) NOT NULL,
    "external_event_id" VARCHAR(128) NOT NULL,
    "payment_id" UUID,
    "payload_hash" VARCHAR(64) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PROCESSED',
    "error_message" VARCHAR(500),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "tuition_payment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tuition_manual_payment_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "payment_id" UUID,
    "channel" "TuitionPaymentChannel" NOT NULL DEFAULT 'BANK_TRANSFER',
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'LKR',
    "reference_number" VARCHAR(128) NOT NULL,
    "paid_date" VARCHAR(10) NOT NULL,
    "proof_storage_key" VARCHAR(500),
    "proof_file_name" VARCHAR(255),
    "proof_mime_type" VARCHAR(128),
    "proof_checksum_sha256" VARCHAR(64),
    "note" VARCHAR(500),
    "status" "SlipSubmissionStatus" NOT NULL DEFAULT 'Pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuition_manual_payment_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tuition_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_number" VARCHAR(64) NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'LKR',
    "paid_amount_minor" INTEGER NOT NULL,
    "balance_after_minor" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ISSUED',
    "snapshot_json" JSONB NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuition_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tuition_payment_events_provider_external_event_id_key" ON "tuition_payment_events"("provider", "external_event_id");
CREATE INDEX "tuition_payment_events_payment_id_idx" ON "tuition_payment_events"("payment_id");

CREATE UNIQUE INDEX "tuition_manual_payment_submissions_payment_id_key" ON "tuition_manual_payment_submissions"("payment_id");
CREATE UNIQUE INDEX "tuition_manual_payment_submissions_channel_reference_number_key" ON "tuition_manual_payment_submissions"("channel", "reference_number");
CREATE INDEX "tuition_manual_payment_submissions_class_id_status_created__idx" ON "tuition_manual_payment_submissions"("class_id", "status", "created_at");
CREATE INDEX "tuition_manual_payment_submissions_invoice_id_status_idx" ON "tuition_manual_payment_submissions"("invoice_id", "status");
CREATE INDEX "tuition_manual_payment_submissions_student_id_created_at_idx" ON "tuition_manual_payment_submissions"("student_id", "created_at");
CREATE INDEX "tuition_manual_payment_submissions_proof_checksum_sha256_idx" ON "tuition_manual_payment_submissions"("proof_checksum_sha256");

CREATE UNIQUE INDEX "tuition_receipts_receipt_number_key" ON "tuition_receipts"("receipt_number");
CREATE UNIQUE INDEX "tuition_receipts_payment_id_key" ON "tuition_receipts"("payment_id");
CREATE INDEX "tuition_receipts_class_id_issued_at_idx" ON "tuition_receipts"("class_id", "issued_at");
CREATE INDEX "tuition_receipts_student_id_issued_at_idx" ON "tuition_receipts"("student_id", "issued_at");
CREATE INDEX "tuition_receipts_invoice_id_idx" ON "tuition_receipts"("invoice_id");

ALTER TABLE "tuition_payment_events" ADD CONSTRAINT "tuition_payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "tuition_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tuition_manual_payment_submissions" ADD CONSTRAINT "tuition_manual_payment_submissions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "tuition_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_manual_payment_submissions" ADD CONSTRAINT "tuition_manual_payment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_manual_payment_submissions" ADD CONSTRAINT "tuition_manual_payment_submissions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "tuition_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tuition_manual_payment_submissions" ADD CONSTRAINT "tuition_manual_payment_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "tuition_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "tuition_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

