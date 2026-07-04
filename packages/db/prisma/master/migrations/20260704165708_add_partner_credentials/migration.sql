-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "last_login_at" TIMESTAMP(3),
ADD COLUMN     "mfa_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfa_secret" TEXT,
ADD COLUMN     "mfa_verified_at" TIMESTAMP(3),
ADD COLUMN     "password_hash" TEXT;
