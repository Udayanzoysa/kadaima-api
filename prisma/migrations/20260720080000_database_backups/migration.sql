-- CreateEnum
CREATE TYPE "DatabaseBackupStatus" AS ENUM ('PENDING', 'RUNNING', 'READY', 'FAILED', 'RESTORING');

-- CreateTable
CREATE TABLE "database_backups" (
    "id" UUID NOT NULL,
    "label" VARCHAR(160),
    "status" "DatabaseBackupStatus" NOT NULL DEFAULT 'PENDING',
    "file_path" TEXT,
    "file_name" VARCHAR(255),
    "size_bytes" BIGINT,
    "checksum_sha256" VARCHAR(64),
    "pg_version" VARCHAR(64),
    "error_message" TEXT,
    "created_by_id" UUID,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "database_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "database_backups_status_idx" ON "database_backups"("status");

-- CreateIndex
CREATE INDEX "database_backups_created_at_idx" ON "database_backups"("created_at");

-- AddForeignKey
ALTER TABLE "database_backups" ADD CONSTRAINT "database_backups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
