CREATE TABLE "devolucion_attempts" (
 "id" TEXT PRIMARY KEY, "key" TEXT NOT NULL, "usuario_id" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'ready', "request_hash" TEXT, "devolucion_id" TEXT,
 "result" JSONB, "cancelled_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "devolucion_attempts_state_check" CHECK (
 ("status"='ready' AND "request_hash" IS NOT NULL AND "devolucion_id" IS NOT NULL AND "result" IS NOT NULL AND "cancelled_at" IS NULL)
 OR ("status"='cancelled' AND "request_hash" IS NULL AND "devolucion_id" IS NULL AND "result" IS NULL AND "cancelled_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "devolucion_attempts_usuario_id_key_key" ON "devolucion_attempts"("usuario_id","key");
CREATE UNIQUE INDEX "devolucion_attempts_devolucion_id_key" ON "devolucion_attempts"("devolucion_id");
