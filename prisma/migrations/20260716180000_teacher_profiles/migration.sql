-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255),
    "description" TEXT,
    "side_banner_url" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teacher_profiles_user_id_key" ON "teacher_profiles"("user_id");
CREATE UNIQUE INDEX "teacher_profiles_slug_key" ON "teacher_profiles"("slug");
CREATE INDEX "teacher_profiles_slug_idx" ON "teacher_profiles"("slug");

ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "teacher_banners" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "link_url" TEXT,
    "title" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_banners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "teacher_banners_profile_id_idx" ON "teacher_banners"("profile_id");

ALTER TABLE "teacher_banners" ADD CONSTRAINT "teacher_banners_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "teacher_classes" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_classes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "teacher_classes_profile_id_idx" ON "teacher_classes"("profile_id");

ALTER TABLE "teacher_classes" ADD CONSTRAINT "teacher_classes_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
