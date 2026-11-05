-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateEnum
CREATE TYPE "auth"."AccountType" AS ENUM ('PATIENT', 'STAFF');

-- CreateEnum
CREATE TYPE "auth"."StaffRole" AS ENUM ('RECEPTIONIST', 'DOCTOR', 'LAB', 'ADMIN');

-- CreateEnum
CREATE TYPE "auth"."OtpPurpose" AS ENUM ('PHONE_VERIFICATION');

-- CreateEnum
CREATE TYPE "core"."DepartmentKind" AS ENUM ('CLINICAL', 'LAB', 'RADIOLOGY');

-- CreateEnum
CREATE TYPE "core"."SlotStatus" AS ENUM ('OPEN', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "core"."AppointmentStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "core"."TestStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'AWAITING_REVIEW', 'RELEASED');

-- CreateEnum
CREATE TYPE "core"."JourneyStageCode" AS ENUM ('BOOKED', 'CHECKED_IN', 'WITH_DOCTOR', 'TEST_ORDERED', 'RESULT_READY', 'DONE');

-- CreateEnum
CREATE TYPE "core"."JourneyLocation" AS ENUM ('APPOINTMENT_CLINIC', 'TEST_CLINIC', 'NONE');

-- CreateEnum
CREATE TYPE "core"."AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');

-- CreateTable
CREATE TABLE "auth"."accounts" (
    "id" UUID NOT NULL,
    "type" "auth"."AccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "roles" "auth"."StaffRole"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "phone_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."sessions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."otp_codes" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "purpose" "auth"."OtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."departments" (
    "id" UUID NOT NULL,
    "kind" "core"."DepartmentKind" NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."clinics" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "directions_ar" TEXT NOT NULL,
    "directions_en" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."staff_clinics" (
    "staff_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_clinics_pkey" PRIMARY KEY ("staff_id","clinic_id")
);

-- CreateTable
CREATE TABLE "core"."slots" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "core"."SlotStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."appointments" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "status" "core"."AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "booked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "no_show_reason" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."visit_note_versions" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "clinical_notes" TEXT NOT NULL,
    "patient_summary" TEXT,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_note_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."test_orders" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "test_name" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "core"."TestStatus" NOT NULL DEFAULT 'REQUESTED',
    "ordered_by_id" UUID NOT NULL,
    "ordered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "released_by_id" UUID,

    CONSTRAINT "test_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."test_result_files" (
    "id" UUID NOT NULL,
    "test_order_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_result_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."journey_stages" (
    "code" "core"."JourneyStageCode" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title_ar" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "next_step_ar" TEXT NOT NULL,
    "next_step_en" TEXT NOT NULL,
    "location" "core"."JourneyLocation" NOT NULL,

    CONSTRAINT "journey_stages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "core"."audit_log" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "actor_type" "auth"."AccountType",
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "outcome" "core"."AuditOutcome" NOT NULL,
    "ip" TEXT,
    "details" JSONB,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_phone_key" ON "auth"."accounts"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "auth"."sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_account_id_idx" ON "auth"."sessions"("account_id");

-- CreateIndex
CREATE INDEX "otp_codes_account_id_purpose_created_at_idx" ON "auth"."otp_codes"("account_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "clinics_department_id_idx" ON "core"."clinics"("department_id");

-- CreateIndex
CREATE INDEX "staff_clinics_clinic_id_idx" ON "core"."staff_clinics"("clinic_id");

-- CreateIndex
CREATE INDEX "slots_clinic_id_starts_at_idx" ON "core"."slots"("clinic_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "slots_doctor_id_starts_at_key" ON "core"."slots"("doctor_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "core"."appointments"("patient_id");

-- CreateIndex
CREATE INDEX "appointments_slot_id_idx" ON "core"."appointments"("slot_id");

-- CreateIndex
CREATE INDEX "appointments_status_checked_in_at_idx" ON "core"."appointments"("status", "checked_in_at");

-- CreateIndex
CREATE UNIQUE INDEX "visit_note_versions_appointment_id_version_key" ON "core"."visit_note_versions"("appointment_id", "version");

-- CreateIndex
CREATE INDEX "test_orders_appointment_id_idx" ON "core"."test_orders"("appointment_id");

-- CreateIndex
CREATE INDEX "test_orders_clinic_id_status_idx" ON "core"."test_orders"("clinic_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "test_result_files_test_order_id_key" ON "core"."test_result_files"("test_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "test_result_files_storage_key_key" ON "core"."test_result_files"("storage_key");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "core"."audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_occurred_at_idx" ON "core"."audit_log"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "core"."audit_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."otp_codes" ADD CONSTRAINT "otp_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."clinics" ADD CONSTRAINT "clinics_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "core"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."staff_clinics" ADD CONSTRAINT "staff_clinics_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "auth"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."staff_clinics" ADD CONSTRAINT "staff_clinics_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "core"."clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."slots" ADD CONSTRAINT "slots_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."slots" ADD CONSTRAINT "slots_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "core"."clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "auth"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."appointments" ADD CONSTRAINT "appointments_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "core"."slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."visit_note_versions" ADD CONSTRAINT "visit_note_versions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "core"."appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."visit_note_versions" ADD CONSTRAINT "visit_note_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."test_orders" ADD CONSTRAINT "test_orders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "core"."appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."test_orders" ADD CONSTRAINT "test_orders_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "core"."clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."test_orders" ADD CONSTRAINT "test_orders_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "auth"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."test_orders" ADD CONSTRAINT "test_orders_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "auth"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."test_result_files" ADD CONSTRAINT "test_result_files_test_order_id_fkey" FOREIGN KEY ("test_order_id") REFERENCES "core"."test_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."test_result_files" ADD CONSTRAINT "test_result_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "auth"."accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Written by hand: rules Prisma can't express (schema.md, "Raw SQL in the
-- first migration").
-- ---------------------------------------------------------------------------

-- 1. A slot never has more than one active booking. Two people booking at the
--    same moment: the second insert fails here.
CREATE UNIQUE INDEX "appointments_one_active_per_slot"
  ON "core"."appointments" ("slot_id") WHERE "status" <> 'CANCELLED';

-- 2. A slot ends after it starts.
ALTER TABLE "core"."slots"
  ADD CONSTRAINT "slots_ends_after_starts" CHECK ("ends_at" > "starts_at");

-- 3. Result files: at most 10 MB, PDF or image only.
ALTER TABLE "core"."test_result_files"
  ADD CONSTRAINT "test_result_files_size" CHECK ("size_bytes" BETWEEN 1 AND 10485760),
  ADD CONSTRAINT "test_result_files_content_type"
    CHECK ("content_type" IN ('application/pdf', 'image/jpeg', 'image/png'));

-- 4. Patients have no staff roles.
ALTER TABLE "auth"."accounts"
  ADD CONSTRAINT "accounts_patients_have_no_roles" CHECK ("type" = 'STAFF' OR "roles" = '{}');

-- 5. The audit log is append-only, for everyone, on top of the grants below.
CREATE FUNCTION "core"."audit_log_refuse_change"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'core.audit_log is append-only';
END;
$$;

CREATE TRIGGER "audit_log_no_update_or_delete"
  BEFORE UPDATE OR DELETE ON "core"."audit_log"
  FOR EACH ROW EXECUTE FUNCTION "core"."audit_log_refuse_change"();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "core"."audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "core"."audit_log_refuse_change"();

-- 6. Grants beyond the defaults set by database/init.sh (schema.md, "DB users").
--    The core reads only these account columns: never password hashes.
GRANT SELECT ("id", "type", "name", "phone", "roles", "active") ON "auth"."accounts" TO wasla_core;
GRANT REFERENCES ("id") ON "auth"."accounts" TO wasla_core;
--    The auth service writes login events into the same audit log.
GRANT INSERT ON "core"."audit_log" TO wasla_auth;
GRANT USAGE ON SEQUENCE "core"."audit_log_id_seq" TO wasla_auth;
REVOKE UPDATE, DELETE, TRUNCATE ON "core"."audit_log" FROM wasla_core;
