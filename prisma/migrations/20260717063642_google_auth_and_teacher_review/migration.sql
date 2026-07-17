-- AlterTable: Google auth (nullable password + googleId)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- User list / hard-delete query indexes
CREATE INDEX "User_workspaceId_status_idx" ON "User"("workspaceId", "status");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "User_team_idx" ON "User"("team");
CREATE INDEX "User_customRoleId_idx" ON "User"("customRoleId");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "User_invitedById_idx" ON "User"("invitedById");

-- Teacher profile admin review
CREATE TYPE "TeacherReviewStatus" AS ENUM ('Pending', 'Active', 'Rejected');

ALTER TABLE "teacher_profiles" ADD COLUMN "review_status" "TeacherReviewStatus" NOT NULL DEFAULT 'Active';

CREATE INDEX "teacher_profiles_review_status_idx" ON "teacher_profiles"("review_status");

-- AccessReview: allow deleting reviewer users (hard delete)
ALTER TABLE "AccessReview" DROP CONSTRAINT "AccessReview_reviewerId_fkey";

ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AccessReview_workspaceId_idx" ON "AccessReview"("workspaceId");
CREATE INDEX "AccessReview_reviewerId_idx" ON "AccessReview"("reviewerId");

-- Quiz status filter index (if missing from baseline)
CREATE INDEX IF NOT EXISTS "quizzes_status_idx" ON "quizzes"("status");
