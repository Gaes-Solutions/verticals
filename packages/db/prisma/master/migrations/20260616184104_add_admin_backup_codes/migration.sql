-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "mfa_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];
