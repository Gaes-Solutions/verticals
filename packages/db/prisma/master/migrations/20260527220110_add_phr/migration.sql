-- CreateEnum
CREATE TYPE "PatientSexAtBirth" AS ENUM ('male', 'female', 'intersex', 'unknown');

-- CreateEnum
CREATE TYPE "FhirResourceType" AS ENUM ('Encounter', 'Observation', 'Condition', 'AllergyIntolerance', 'Immunization', 'MedicationRequest', 'DiagnosticReport', 'Procedure', 'CarePlan');

-- CreateEnum
CREATE TYPE "PatientRecordStatus" AS ENUM ('draft', 'final', 'amended', 'cancelled');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('full_phr', 'appointments_only', 'prescriptions_only', 'vaccines_only');

-- CreateEnum
CREATE TYPE "ConsentSubjectType" AS ENUM ('patient', 'pet');

-- CreateEnum
CREATE TYPE "FamilyRelationship" AS ENUM ('mother', 'father', 'legal_guardian', 'spouse', 'caregiver', 'sibling', 'other');

-- CreateEnum
CREATE TYPE "FamilyPermissionScope" AS ENUM ('full', 'view_only', 'agendar_only', 'custom');

-- CreateEnum
CREATE TYPE "FamilyConsentStatus" AS ENUM ('pending', 'accepted', 'revoked');

-- CreateEnum
CREATE TYPE "PhrAuditActorType" AS ENUM ('patient', 'tenant_user', 'system');

-- CreateEnum
CREATE TYPE "PhrAuditAction" AS ENUM ('viewed_summary', 'viewed_record', 'created_record', 'modified_record', 'shared_record', 'exported_data');

-- AlterTable
ALTER TABLE "pacientes_master" ADD COLUMN     "address" JSONB,
ADD COLUMN     "birth_date" DATE,
ADD COLUMN     "blood_type" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'MX',
ADD COLUMN     "curp" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "gender_identity" TEXT,
ADD COLUMN     "height_cm" DECIMAL(6,2),
ADD COLUMN     "language_preferred" TEXT NOT NULL DEFAULT 'es-MX',
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "phone_e164" TEXT,
ADD COLUMN     "preferred_name" TEXT,
ADD COLUMN     "rfc" TEXT,
ADD COLUMN     "sex_at_birth" "PatientSexAtBirth",
ADD COLUMN     "weight_kg" DECIMAL(6,2),
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "patient_logins" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "device_fingerprint" TEXT NOT NULL,
    "device_name" TEXT,
    "device_trusted_until" TIMESTAMP(3),
    "last_otp_sent_at" TIMESTAMP(3),
    "otp_method" TEXT,
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_logins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_auth_challenges" (
    "id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'whatsapp',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_auth_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_family" (
    "id" TEXT NOT NULL,
    "dependiente_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "relationship_type" "FamilyRelationship" NOT NULL,
    "permission_scope" "FamilyPermissionScope" NOT NULL DEFAULT 'view_only',
    "permission_details" JSONB,
    "consent_status" "FamilyConsentStatus" NOT NULL DEFAULT 'pending',
    "consent_required_from_dependent" BOOLEAN NOT NULL DEFAULT false,
    "consent_accepted_at" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_consents" (
    "id" TEXT NOT NULL,
    "subject_type" "ConsentSubjectType" NOT NULL DEFAULT 'patient',
    "subject_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scope" "ConsentScope" NOT NULL DEFAULT 'full_phr',
    "revocable" BOOLEAN NOT NULL DEFAULT true,
    "terms_version" TEXT NOT NULL DEFAULT 'v1',
    "ip_at_grant" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "patient_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_records" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "resource_type" "FhirResourceType" NOT NULL,
    "resource_subtype" TEXT,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "status" "PatientRecordStatus" NOT NULL DEFAULT 'final',
    "data" JSONB NOT NULL,
    "summary_text" TEXT,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "is_visible_to_patient" BOOLEAN NOT NULL DEFAULT true,
    "parent_record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_emergency_qr" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "qr_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "visible_fields" JSONB NOT NULL DEFAULT '[]',
    "regenerated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_emergency_qr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_audit_log" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "subject_type" "ConsentSubjectType" NOT NULL DEFAULT 'patient',
    "subject_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "actor_type" "PhrAuditActorType" NOT NULL,
    "user_id" TEXT,
    "action" "PhrAuditAction" NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_logins_patient_id_idx" ON "patient_logins"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_logins_patient_id_device_fingerprint_key" ON "patient_logins"("patient_id", "device_fingerprint");

-- CreateIndex
CREATE INDEX "patient_auth_challenges_phone_e164_consumed_at_idx" ON "patient_auth_challenges"("phone_e164", "consumed_at");

-- CreateIndex
CREATE INDEX "patient_family_tutor_id_idx" ON "patient_family"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_family_dependiente_id_tutor_id_key" ON "patient_family"("dependiente_id", "tutor_id");

-- CreateIndex
CREATE INDEX "patient_consents_subject_type_subject_id_tenant_id_idx" ON "patient_consents"("subject_type", "subject_id", "tenant_id");

-- CreateIndex
CREATE INDEX "patient_consents_tenant_id_idx" ON "patient_consents"("tenant_id");

-- CreateIndex
CREATE INDEX "patient_records_patient_id_effective_date_idx" ON "patient_records"("patient_id", "effective_date");

-- CreateIndex
CREATE INDEX "patient_records_patient_id_resource_type_effective_date_idx" ON "patient_records"("patient_id", "resource_type", "effective_date");

-- CreateIndex
CREATE INDEX "patient_records_tenant_id_created_at_idx" ON "patient_records"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "patient_records_is_critical_patient_id_idx" ON "patient_records"("is_critical", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_emergency_qr_patient_id_key" ON "patient_emergency_qr"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_emergency_qr_qr_token_key" ON "patient_emergency_qr"("qr_token");

-- CreateIndex
CREATE INDEX "patient_audit_log_patient_id_created_at_idx" ON "patient_audit_log"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "patient_audit_log_tenant_id_created_at_idx" ON "patient_audit_log"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_master_phone_e164_key" ON "pacientes_master"("phone_e164");

-- CreateIndex
CREATE INDEX "pacientes_master_phone_e164_idx" ON "pacientes_master"("phone_e164");

-- CreateIndex
CREATE INDEX "pacientes_master_rfc_country_idx" ON "pacientes_master"("rfc", "country");

-- CreateIndex
CREATE INDEX "pacientes_master_curp_idx" ON "pacientes_master"("curp");

-- AddForeignKey
ALTER TABLE "patient_logins" ADD CONSTRAINT "patient_logins_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "pacientes_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_family" ADD CONSTRAINT "patient_family_dependiente_id_fkey" FOREIGN KEY ("dependiente_id") REFERENCES "pacientes_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_family" ADD CONSTRAINT "patient_family_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "pacientes_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "pacientes_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_records" ADD CONSTRAINT "patient_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "pacientes_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_emergency_qr" ADD CONSTRAINT "patient_emergency_qr_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "pacientes_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_audit_log" ADD CONSTRAINT "patient_audit_log_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "pacientes_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;
