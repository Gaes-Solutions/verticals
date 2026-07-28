-- Challenges WebAuthn ya consumidos: uso único del challenge (anti-replay de aserción).
CREATE TABLE "webauthn_used_challenges" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webauthn_used_challenges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "webauthn_used_challenges_expires_at_idx" ON "webauthn_used_challenges"("expires_at");
