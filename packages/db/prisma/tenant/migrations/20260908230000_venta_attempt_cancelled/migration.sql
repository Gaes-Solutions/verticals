ALTER TABLE "venta_attempts" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ready', ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "venta_attempts" ALTER COLUMN "request_hash" DROP NOT NULL, ALTER COLUMN "venta_id" DROP NOT NULL, ALTER COLUMN "result" DROP NOT NULL;
ALTER TABLE "venta_attempts" ADD CONSTRAINT "venta_attempts_state_check" CHECK (
 ("status" = 'ready' AND "request_hash" IS NOT NULL AND "venta_id" IS NOT NULL AND "result" IS NOT NULL AND "cancelled_at" IS NULL)
 OR ("status" = 'cancelled' AND "request_hash" IS NULL AND "venta_id" IS NULL AND "result" IS NULL AND "cancelled_at" IS NOT NULL)
);
