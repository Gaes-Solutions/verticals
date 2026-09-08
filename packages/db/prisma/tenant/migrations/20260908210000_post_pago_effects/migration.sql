CREATE TABLE "pedido_post_pago_effects" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "pedido_id" TEXT NOT NULL REFERENCES "pedidos_ecommerce"("id") ON DELETE CASCADE,
 "tipo" TEXT NOT NULL CHECK ("tipo" IN ('guia','push_pago')),
 "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','processing','done','uncertain','skipped')),
 "claim_token" TEXT,
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "result" JSONB,
 "error_code" TEXT,
 "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "pedido_post_pago_effects_pedido_id_tipo_key" ON "pedido_post_pago_effects"("pedido_id", "tipo");
CREATE INDEX "pedido_post_pago_effects_status_next_attempt_at_idx" ON "pedido_post_pago_effects"("status", "next_attempt_at");
