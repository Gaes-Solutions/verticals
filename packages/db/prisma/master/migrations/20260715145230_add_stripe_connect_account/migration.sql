-- Stripe Connect: cuenta vinculada del tenant (cobros a sus clientes) + estado.
ALTER TABLE "tenants" ADD COLUMN "stripe_account_id" TEXT;
ALTER TABLE "tenants" ADD COLUMN "stripe_account_status" TEXT;
