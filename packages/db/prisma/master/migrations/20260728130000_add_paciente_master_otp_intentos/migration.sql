-- Cap de intentos por OTP en el login de marketplace (anti brute-force PHR).
-- Cada código emitido tolera un número fijo de fallos antes de invalidarse.
ALTER TABLE "pacientes_master" ADD COLUMN "otp_intentos" INTEGER NOT NULL DEFAULT 0;
