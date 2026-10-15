ALTER TABLE "admin_users" ADD COLUMN "extra_permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
