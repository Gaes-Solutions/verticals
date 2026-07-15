-- Stripe billing: customer de la plataforma por tenant (cobro de suscripción SaaS).
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" TEXT;
