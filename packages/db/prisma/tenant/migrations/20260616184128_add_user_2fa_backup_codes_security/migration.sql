-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "mfa_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfa_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "config_seguridad" (
    "id" TEXT NOT NULL,
    "require_2fa_todos" BOOLEAN NOT NULL DEFAULT false,
    "require_2fa_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_seguridad_pkey" PRIMARY KEY ("id")
);
