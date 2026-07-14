-- Resilient timer: pool of remaining seconds + heartbeat + tab-switch violations
ALTER TABLE "quiz_attempts"
ADD COLUMN "seconds_remaining" INTEGER,
ADD COLUMN "violation_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill in-progress / historical attempts from wall-clock expires_at
UPDATE "quiz_attempts"
SET "seconds_remaining" = GREATEST(
  0,
  FLOOR(EXTRACT(EPOCH FROM ("expires_at" - CURRENT_TIMESTAMP)))::INTEGER
)
WHERE "seconds_remaining" IS NULL;

ALTER TABLE "quiz_attempts"
ALTER COLUMN "seconds_remaining" SET NOT NULL;
