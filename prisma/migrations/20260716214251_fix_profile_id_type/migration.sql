-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'CUSTOMER_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "Action" AS ENUM ('MANAGE', 'CREATE', 'READ', 'EDIT', 'DELETE', 'EXPORT', 'IMPORT', 'ASSIGN', 'CHANGE_STATUS');

-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('SETTINGS', 'USERS', 'ROLES', 'DASHBOARD_ACCESS', 'LOG', 'REPORTS', 'QUIZZES');

-- CreateEnum
CREATE TYPE "QuizStatus" AS ENUM ('Draft', 'Published', 'Archived');

-- CreateEnum
CREATE TYPE "TeacherQuizVisibility" AS ENUM ('ALL', 'SELECTED');

-- CreateEnum
CREATE TYPE "TeacherPosterPlacement" AS ENUM ('TOP', 'MIDDLE', 'FOOTER', 'SIDE', 'RIGHT');

-- CreateEnum
CREATE TYPE "TeacherInquiryStatus" AS ENUM ('NEW', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('Draft', 'Published', 'Archived');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('Draft', 'Published', 'Archived');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'SHORT_TEXT', 'NUMERIC', 'SEQUENCE', 'ESSAY');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('In_Progress', 'Submitted', 'Timed_Out');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('Pending', 'Paid', 'Failed', 'Cancelled');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PayHere');

-- CreateEnum
CREATE TYPE "UnlockMethod" AS ENUM ('PayHere', 'Voucher', 'Slip');

-- CreateEnum
CREATE TYPE "SlipSubmissionStatus" AS ENUM ('Pending', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "PasswordResetChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "action" "Action" NOT NULL,
    "subject" "Subject" NOT NULL,
    "conditions" JSONB,
    "userId" UUID,
    "permissionSetId" UUID,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "workspaceId" UUID NOT NULL,
    "customRoleId" UUID,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "phoneNumber" TEXT,
    "address" TEXT,
    "team" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "invitedById" UUID,
    "canViewOthers" BOOLEAN NOT NULL DEFAULT false,
    "canManagePermissions" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255),
    "description" TEXT,
    "about_text" TEXT,
    "contact_text" TEXT,
    "contact_phone" VARCHAR(64),
    "contact_whatsapp_url" VARCHAR(512),
    "contact_address" TEXT,
    "side_banner_url" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "quiz_visibility" "TeacherQuizVisibility" NOT NULL DEFAULT 'ALL',
    "page_layout" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_contact_inquiries" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "guest_session_id" VARCHAR(64),
    "user_id" UUID,
    "student_name" VARCHAR(255) NOT NULL,
    "mobile_number" VARCHAR(32) NOT NULL,
    "email" VARCHAR(255),
    "message" TEXT NOT NULL,
    "status" "TeacherInquiryStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_contact_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profile_quizzes" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_profile_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_banners" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "title" VARCHAR(255),
    "subtitle" TEXT,
    "cta_label" VARCHAR(80),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_classes" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "schedule_time" VARCHAR(120),
    "location" VARCHAR(255),
    "class_date" VARCHAR(120),
    "fee_label" VARCHAR(80),
    "whatsapp_group_url" VARCHAR(500),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_posters" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "title" VARCHAR(255),
    "placement" "TeacherPosterPlacement" NOT NULL DEFAULT 'MIDDLE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_posters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "PasswordResetChannel" NOT NULL,
    "destination" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "smtp" JSONB,
    "sms" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomRole" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" UUID NOT NULL,
    "lastReview" TIMESTAMP(3),
    "owner" TEXT NOT NULL DEFAULT 'System',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionSet" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReview" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "status" "CourseStatus" NOT NULL DEFAULT 'Draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modules" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "status" "CourseStatus" NOT NULL DEFAULT 'Draft',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "module_id" UUID,
    "title" JSONB NOT NULL,
    "description" JSONB,
    "cover_image_url" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "passing_score_percentage" INTEGER NOT NULL DEFAULT 70,
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "requires_unlock" BOOLEAN NOT NULL DEFAULT false,
    "price_lkr" DECIMAL(12,2),
    "status" "QuizStatus" NOT NULL DEFAULT 'Draft',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" UUID NOT NULL,
    "order_id" VARCHAR(64) NOT NULL,
    "quiz_id" UUID NOT NULL,
    "guest_session_id" VARCHAR(64),
    "user_id" UUID,
    "amount_lkr" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'LKR',
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'Pending',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PayHere',
    "provider_payment_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unlock_vouchers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "quiz_id" UUID,
    "max_redemptions" INTEGER NOT NULL DEFAULT 1,
    "redemption_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unlock_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_slip_submissions" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "guest_session_id" VARCHAR(64),
    "user_id" UUID,
    "slip_image_url" TEXT NOT NULL,
    "bank_reference" VARCHAR(100),
    "note" TEXT,
    "status" "SlipSubmissionStatus" NOT NULL DEFAULT 'Pending',
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_slip_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_unlocks" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "guest_session_id" VARCHAR(64),
    "user_id" UUID,
    "method" "UnlockMethod" NOT NULL,
    "payment_order_id" UUID,
    "voucher_code_id" UUID,
    "slip_submission_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "question_text" JSONB NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
    "points" INTEGER NOT NULL DEFAULT 1,
    "status" "QuestionStatus" NOT NULL DEFAULT 'Draft',
    "image_url" TEXT,
    "config" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_choices" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "choice_text" JSONB NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "answer_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_leads" (
    "id" UUID NOT NULL,
    "guest_session_id" TEXT NOT NULL,
    "student_name" VARCHAR(255) NOT NULL,
    "school" VARCHAR(255) NOT NULL,
    "mobile_number" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "quiz_attempts_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "student_id" UUID,
    "guest_lead_id" UUID,
    "result_token" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seconds_remaining" INTEGER NOT NULL,
    "violation_count" INTEGER NOT NULL DEFAULT 0,
    "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question_order" JSONB,
    "status" "AttemptStatus" NOT NULL DEFAULT 'In_Progress',
    "final_score" INTEGER NOT NULL DEFAULT 0,
    "is_passed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_responses" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_choice_id" UUID,
    "text_response" TEXT,
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "needs_manual_review" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "student_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CustomRoleToPermissionSet" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_user_id_key" ON "teacher_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_slug_key" ON "teacher_profiles"("slug");

-- CreateIndex
CREATE INDEX "teacher_profiles_slug_idx" ON "teacher_profiles"("slug");

-- CreateIndex
CREATE INDEX "teacher_contact_inquiries_profile_id_created_at_idx" ON "teacher_contact_inquiries"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "teacher_contact_inquiries_profile_id_status_idx" ON "teacher_contact_inquiries"("profile_id", "status");

-- CreateIndex
CREATE INDEX "teacher_profile_quizzes_profile_id_idx" ON "teacher_profile_quizzes"("profile_id");

-- CreateIndex
CREATE INDEX "teacher_profile_quizzes_quiz_id_idx" ON "teacher_profile_quizzes"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profile_quizzes_profile_id_quiz_id_key" ON "teacher_profile_quizzes"("profile_id", "quiz_id");

-- CreateIndex
CREATE INDEX "teacher_banners_profile_id_idx" ON "teacher_banners"("profile_id");

-- CreateIndex
CREATE INDEX "teacher_classes_profile_id_idx" ON "teacher_classes"("profile_id");

-- CreateIndex
CREATE INDEX "teacher_posters_profile_id_idx" ON "teacher_posters"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_workspaceId_name_key" ON "CustomRole"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionSet_workspaceId_name_key" ON "PermissionSet"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "modules_course_id_idx" ON "modules"("course_id");

-- CreateIndex
CREATE INDEX "quizzes_course_id_idx" ON "quizzes"("course_id");

-- CreateIndex
CREATE INDEX "quizzes_module_id_idx" ON "quizzes"("module_id");

-- CreateIndex
CREATE INDEX "quizzes_created_by_idx" ON "quizzes"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_order_id_key" ON "payment_orders"("order_id");

-- CreateIndex
CREATE INDEX "payment_orders_quiz_id_idx" ON "payment_orders"("quiz_id");

-- CreateIndex
CREATE INDEX "payment_orders_guest_session_id_idx" ON "payment_orders"("guest_session_id");

-- CreateIndex
CREATE INDEX "payment_orders_user_id_idx" ON "payment_orders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unlock_vouchers_code_key" ON "unlock_vouchers"("code");

-- CreateIndex
CREATE INDEX "unlock_vouchers_quiz_id_idx" ON "unlock_vouchers"("quiz_id");

-- CreateIndex
CREATE INDEX "payment_slip_submissions_quiz_id_idx" ON "payment_slip_submissions"("quiz_id");

-- CreateIndex
CREATE INDEX "payment_slip_submissions_guest_session_id_idx" ON "payment_slip_submissions"("guest_session_id");

-- CreateIndex
CREATE INDEX "payment_slip_submissions_user_id_idx" ON "payment_slip_submissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_unlocks_payment_order_id_key" ON "quiz_unlocks"("payment_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_unlocks_slip_submission_id_key" ON "quiz_unlocks"("slip_submission_id");

-- CreateIndex
CREATE INDEX "quiz_unlocks_guest_session_id_idx" ON "quiz_unlocks"("guest_session_id");

-- CreateIndex
CREATE INDEX "quiz_unlocks_user_id_idx" ON "quiz_unlocks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_unlocks_quiz_id_guest_session_id_key" ON "quiz_unlocks"("quiz_id", "guest_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_unlocks_quiz_id_user_id_key" ON "quiz_unlocks"("quiz_id", "user_id");

-- CreateIndex
CREATE INDEX "questions_created_by_idx" ON "questions"("created_by");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE INDEX "quiz_questions_quiz_id_idx" ON "quiz_questions"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_questions_question_id_idx" ON "quiz_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_quiz_id_question_id_key" ON "quiz_questions"("quiz_id", "question_id");

-- CreateIndex
CREATE INDEX "answer_choices_question_id_idx" ON "answer_choices"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_leads_guest_session_id_key" ON "guest_leads"("guest_session_id");

-- CreateIndex
CREATE INDEX "guest_leads_mobile_number_idx" ON "guest_leads"("mobile_number");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_result_token_key" ON "quiz_attempts"("result_token");

-- CreateIndex
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_student_id_idx" ON "quiz_attempts"("student_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_guest_lead_id_idx" ON "quiz_attempts"("guest_lead_id");

-- CreateIndex
CREATE INDEX "student_responses_attempt_id_idx" ON "student_responses"("attempt_id");

-- CreateIndex
CREATE INDEX "student_responses_question_id_idx" ON "student_responses"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_responses_attempt_id_question_id_key" ON "student_responses"("attempt_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "_CustomRoleToPermissionSet_AB_unique" ON "_CustomRoleToPermissionSet"("A", "B");

-- CreateIndex
CREATE INDEX "_CustomRoleToPermissionSet_B_index" ON "_CustomRoleToPermissionSet"("B");

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "CustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_contact_inquiries" ADD CONSTRAINT "teacher_contact_inquiries_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profile_quizzes" ADD CONSTRAINT "teacher_profile_quizzes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profile_quizzes" ADD CONSTRAINT "teacher_profile_quizzes_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_banners" ADD CONSTRAINT "teacher_banners_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_classes" ADD CONSTRAINT "teacher_classes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_posters" ADD CONSTRAINT "teacher_posters_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionSet" ADD CONSTRAINT "PermissionSet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unlock_vouchers" ADD CONSTRAINT "unlock_vouchers_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slip_submissions" ADD CONSTRAINT "payment_slip_submissions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_slip_submissions" ADD CONSTRAINT "payment_slip_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_unlocks" ADD CONSTRAINT "quiz_unlocks_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_unlocks" ADD CONSTRAINT "quiz_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_unlocks" ADD CONSTRAINT "quiz_unlocks_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_unlocks" ADD CONSTRAINT "quiz_unlocks_voucher_code_id_fkey" FOREIGN KEY ("voucher_code_id") REFERENCES "unlock_vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_unlocks" ADD CONSTRAINT "quiz_unlocks_slip_submission_id_fkey" FOREIGN KEY ("slip_submission_id") REFERENCES "payment_slip_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_choices" ADD CONSTRAINT "answer_choices_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_guest_lead_id_fkey" FOREIGN KEY ("guest_lead_id") REFERENCES "guest_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "quiz_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_responses" ADD CONSTRAINT "student_responses_selected_choice_id_fkey" FOREIGN KEY ("selected_choice_id") REFERENCES "answer_choices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomRoleToPermissionSet" ADD CONSTRAINT "_CustomRoleToPermissionSet_A_fkey" FOREIGN KEY ("A") REFERENCES "CustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CustomRoleToPermissionSet" ADD CONSTRAINT "_CustomRoleToPermissionSet_B_fkey" FOREIGN KEY ("B") REFERENCES "PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
