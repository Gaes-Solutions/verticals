-- TOTP de un solo uso (anti-replay): guarda el último time-step consumido por partner.
ALTER TABLE "partners" ADD COLUMN "mfa_last_step" INTEGER;
