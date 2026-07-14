/*
  Warnings:

  - The values [UPDATE] on the enum `Action` will be removed. If these variants are still used in the database, this will fail.
  - The values [CAMPAIGN,CONTACT,WORKSPACE_SETTINGS,USER,SETTING,REPORT,PROJECT,TICKET,ANALYTICS,DASHBOARD] on the enum `Subject` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `content` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sendToTarget` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Campaign` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Campaign` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('QUICK_SEND', 'SCHEDULED_SEND');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SendToTarget" AS ENUM ('INDIVIDUAL_CONTACTS', 'CONTACT_GROUPS', 'ALL_CONTACTS');

-- AlterEnum
BEGIN;
CREATE TYPE "Action_new" AS ENUM ('MANAGE', 'CREATE', 'READ', 'EDIT', 'DELETE', 'EXPORT', 'IMPORT', 'ASSIGN', 'CHANGE_STATUS');
ALTER TABLE "Permission" ALTER COLUMN "action" TYPE "Action_new" USING ("action"::text::"Action_new");
ALTER TYPE "Action" RENAME TO "Action_old";
ALTER TYPE "Action_new" RENAME TO "Action";
DROP TYPE "Action_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Subject_new" AS ENUM ('SETTINGS', 'BILLING', 'CAMPAIGNS', 'CONTACTS', 'SENDER_IDS', 'USERS', 'ROLES', 'DASHBOARD_ACCESS', 'LOG', 'REPORTS', 'SMS_TEMPLATE', 'GROUPS');
ALTER TABLE "Permission" ALTER COLUMN "subject" TYPE "Subject_new" USING ("subject"::text::"Subject_new");
ALTER TYPE "Subject" RENAME TO "Subject_old";
ALTER TYPE "Subject_new" RENAME TO "Subject";
DROP TYPE "Subject_old";
COMMIT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "customNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "sendToTarget" "SendToTarget" NOT NULL,
ADD COLUMN     "senderId" TEXT NOT NULL DEFAULT 'TechWingDemo',
ADD COLUMN     "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "targetContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "targetGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "type" "CampaignType" NOT NULL DEFAULT 'QUICK_SEND',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "title" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canManagePermissions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canViewOthers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invitedById" TEXT;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactGroup" (
    "contactId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactGroup_pkey" PRIMARY KEY ("contactId","groupId")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_phoneNumber_key" ON "Contact"("userId", "phoneNumber");

-- CreateIndex
CREATE INDEX "Group_userId_idx" ON "Group"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_userId_title_key" ON "Group"("userId", "title");

-- CreateIndex
CREATE INDEX "Template_userId_idx" ON "Template"("userId");

-- CreateIndex
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");

-- CreateIndex
CREATE INDEX "Campaign_workspaceId_idx" ON "Campaign"("workspaceId");

-- CreateIndex
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
