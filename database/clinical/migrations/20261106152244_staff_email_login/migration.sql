-- Staff log in to the website with a work email; patients keep logging in to
-- the app with their phone number. A staff phone number is optional.

-- AlterTable
ALTER TABLE "auth"."accounts" ADD COLUMN "email" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "auth"."accounts"("email");

-- Staff accounts made before this migration get a placeholder address, so the
-- check below holds. Replace it with the person's real work email (the
-- .invalid domain never receives mail). Demo databases: reseed instead.
UPDATE "auth"."accounts"
SET "email" = 'staff-' || "id" || '@wasla.invalid'
WHERE "type" = 'STAFF' AND "email" IS NULL;

-- Hand-written (Prisma can't express checks): each kind of account has its own
-- login. Patients: a phone, no email. Staff: an email, phone optional. Emails
-- are stored lowercase so the same address can't be registered twice.
ALTER TABLE "auth"."accounts"
  ADD CONSTRAINT "accounts_login_identifier" CHECK (
    ("type" = 'PATIENT' AND "phone" IS NOT NULL AND "email" IS NULL)
    OR ("type" = 'STAFF' AND "email" IS NOT NULL)
  ),
  ADD CONSTRAINT "accounts_email_lowercase" CHECK ("email" = lower("email"));
