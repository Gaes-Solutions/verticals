-- Time-step TOTP ya consumido por admin: uso único del código (anti-replay del codepath superadmin).
ALTER TABLE "admin_users" ADD COLUMN "mfa_last_step" INTEGER;
