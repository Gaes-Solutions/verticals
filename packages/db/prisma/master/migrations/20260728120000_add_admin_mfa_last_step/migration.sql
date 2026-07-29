-- TOTP de un solo uso (anti-replay): guarda el último time-step consumido por admin.
ALTER TABLE "admin_users" ADD COLUMN "mfa_last_step" INTEGER;
