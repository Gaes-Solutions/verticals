CREATE TABLE "checkout_attempts" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "request_hash" TEXT NOT NULL,
  "carrito_id" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "pedido_id" TEXT,
  "result" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checkout_attempts_status_check" CHECK ("status" IN ('processing', 'ready', 'uncertain', 'failed'))
);
CREATE UNIQUE INDEX "checkout_attempts_carrito_id_key" ON "checkout_attempts"("carrito_id");
CREATE UNIQUE INDEX "checkout_attempts_pedido_id_key" ON "checkout_attempts"("pedido_id");
