-- CreateTable: class_invitations
CREATE TABLE "class_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "code_hint" VARCHAR(32) NOT NULL,
    "label" VARCHAR(120),
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_invitations_pkey" PRIMARY KEY ("id")
);

-- AlterTable: class_enrollments
ALTER TABLE "class_enrollments"
    ADD COLUMN "student_code" VARCHAR(64),
    ADD COLUMN "note" VARCHAR(500),
    ADD COLUMN "invitation_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "class_invitations_token_hash_key" ON "class_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "class_invitations_class_id_revoked_at_expires_at_idx" ON "class_invitations"("class_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "class_invitations_created_by_idx" ON "class_invitations"("created_by");

-- CreateIndex
CREATE INDEX "class_enrollments_invitation_id_idx" ON "class_enrollments"("invitation_id");

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_invitations" ADD CONSTRAINT "class_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "class_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

