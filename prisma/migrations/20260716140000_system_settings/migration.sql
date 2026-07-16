-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "smtp" JSONB,
    "sms" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- Seed default Private Email SMTP profile
INSERT INTO "system_settings" ("id", "smtp", "sms", "updated_at")
VALUES (
  'default',
  '{"host":"mail.privateemail.com","port":465,"encryption":"SSL","user":"","pass":"","from":""}'::jsonb,
  '{"provider":"HUTCH","hutchApiUrl":"https://api.hutch.lk/v1/send","hutchUsername":"","hutchApiKey":"","notifyUserId":"","notifyApiKey":"","notifySenderId":"NotifyDEMO","notifyApiUrl":"https://app.notify.lk/api/v1/send"}'::jsonb,
  CURRENT_TIMESTAMP
);
