ALTER TABLE "pedidos_ecommerce" ADD COLUMN "payment_provider" TEXT, ADD COLUMN "payment_account_id" TEXT;
CREATE TABLE "online_bank_refunds" (
 "id" TEXT NOT NULL PRIMARY KEY, "solicitud_id" TEXT NOT NULL UNIQUE,
 "usuario_id" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'preparing',
 "provider" TEXT NOT NULL, "intent_id" TEXT NOT NULL, "account_id" TEXT,
 "request" JSONB NOT NULL, "return_key" TEXT NOT NULL UNIQUE, "return_result" JSONB,
 "amount_cents" INTEGER, "refund_id" TEXT, "submitted_at" TIMESTAMP(3), "last_error" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "online_bank_refunds_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitudes_devolucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "online_bank_refunds_state_idx" ON "online_bank_refunds"("state");
CREATE UNIQUE INDEX "online_bank_refunds_provider_intent_id_refund_id_key" ON "online_bank_refunds"("provider", "intent_id", "refund_id");

ALTER TABLE "solicitudes_devolucion" ADD COLUMN "approval_key" TEXT, ADD COLUMN "approval_request" JSONB, ADD COLUMN "approval_user_id" TEXT;
CREATE UNIQUE INDEX "solicitudes_devolucion_approval_key_key" ON "solicitudes_devolucion"("approval_key");
