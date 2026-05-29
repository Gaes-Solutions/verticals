-- CreateEnum
CREATE TYPE "tenant_vertical" AS ENUM ('retail_mayoreo', 'abarrotes', 'salud_vet', 'salud_humana', 'despacho_contable', 'otro');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'paused', 'unpaid');

-- CreateEnum
CREATE TYPE "subscription_interval" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');

-- CreateEnum
CREATE TYPE "invoice_payment_status" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "payment_method_type" AS ENUM ('card', 'oxxo', 'spei', 'manual');

-- CreateEnum
CREATE TYPE "coupon_discount_type" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "coupon_duration" AS ENUM ('once', 'repeating', 'forever');

-- CreateEnum
CREATE TYPE "admin_tenant_role" AS ENUM ('owner', 'billing_only', 'viewer');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "tenant_status" ADD VALUE 'past_due';
ALTER TYPE "tenant_status" ADD VALUE 'unpaid';
ALTER TYPE "tenant_status" ADD VALUE 'archived';

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tier_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "commercial_name" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'MX',
ADD COLUMN     "currency_default" TEXT NOT NULL DEFAULT 'MXN',
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "health_score" INTEGER,
ADD COLUMN     "health_score_updated_at" TIMESTAMP(3),
ADD COLUMN     "language_default" TEXT NOT NULL DEFAULT 'es-MX',
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN     "parent_tenant_id" TEXT,
ADD COLUMN     "partner_attributed_until" TIMESTAMP(3),
ADD COLUMN     "partner_id" TEXT,
ADD COLUMN     "rfc" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
ADD COLUMN     "trial_ends_at" TIMESTAMP(3),
ADD COLUMN     "vertical" "tenant_vertical",
ADD COLUMN     "vertical_subtype" TEXT;

-- CreateTable
CREATE TABLE "plan_features" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "value_type" TEXT NOT NULL DEFAULT 'string',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_prices" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "interval" "subscription_interval" NOT NULL,
    "unit_amount" INTEGER NOT NULL,
    "tax_behavior" TEXT NOT NULL DEFAULT 'inclusive',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'trialing',
    "currency" TEXT NOT NULL,
    "interval" "subscription_interval" NOT NULL DEFAULT 'monthly',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_start" TIMESTAMP(3),
    "trial_end" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "pause_collection_until" TIMESTAMP(3),
    "discount_coupon_id" TEXT,
    "external_subscription_id" TEXT,
    "external_provider" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_items" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_amount" INTEGER NOT NULL,
    "external_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'open',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "subtotal" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "cfdi_uuid" TEXT,
    "cfdi_pdf_url" TEXT,
    "cfdi_xml_url" TEXT,
    "external_invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_amount" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subscription_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "payment_method_id" TEXT,
    "status" "invoice_payment_status" NOT NULL DEFAULT 'pending',
    "external_charge_id" TEXT,
    "failure_reason" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "payment_method_type" NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "external_method_id" TEXT,
    "last4" TEXT,
    "brand" TEXT,
    "exp_month" INTEGER,
    "exp_year" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partner_id" TEXT,
    "discount_type" "coupon_discount_type" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "currency" TEXT,
    "duration" "coupon_duration" NOT NULL DEFAULT 'once',
    "duration_in_months" INTEGER,
    "max_redemptions" INTEGER,
    "times_redeemed" INTEGER NOT NULL DEFAULT 0,
    "applicable_plan_ids" JSONB NOT NULL DEFAULT '[]',
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "discount_amount_total" INTEGER NOT NULL DEFAULT 0,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_users_admin" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role_admin" "admin_tenant_role" NOT NULL DEFAULT 'owner',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_users_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings_master" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "billing_email" TEXT NOT NULL,
    "billing_address" JSONB,
    "tax_data" JSONB,
    "notification_preferences" JSONB,
    "auto_charge_enabled" BOOLEAN NOT NULL DEFAULT true,
    "dunning_policy" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_master_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_plan_id_feature_key_key" ON "plan_features"("plan_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_prices_plan_id_currency_interval_key" ON "plan_prices"("plan_id", "currency", "interval");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_status_idx" ON "subscriptions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_current_period_end_idx" ON "subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "subscription_items_subscription_id_idx" ON "subscription_items"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_due_date_idx" ON "invoices"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_status_next_retry_at_idx" ON "invoices"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_payments_invoice_id_idx" ON "invoice_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_payments_status_idx" ON "invoice_payments"("status");

-- CreateIndex
CREATE INDEX "payment_methods_tenant_id_is_default_idx" ON "payment_methods"("tenant_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_is_active_valid_until_idx" ON "coupons"("is_active", "valid_until");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_coupon_id_tenant_id_key" ON "coupon_redemptions"("coupon_id", "tenant_id");

-- CreateIndex
CREATE INDEX "tenant_users_admin_email_idx" ON "tenant_users_admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_admin_tenant_id_email_key" ON "tenant_users_admin"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_master_tenant_id_key" ON "tenant_settings_master"("tenant_id");

-- CreateIndex
CREATE INDEX "tenants_parent_tenant_id_idx" ON "tenants"("parent_tenant_id");

-- CreateIndex
CREATE INDEX "tenants_partner_id_idx" ON "tenants"("partner_id");

-- CreateIndex
CREATE INDEX "tenants_deleted_at_idx" ON "tenants"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_rfc_country_key" ON "tenants"("rfc", "country");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_parent_tenant_id_fkey" FOREIGN KEY ("parent_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_discount_coupon_id_fkey" FOREIGN KEY ("discount_coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_subscription_item_id_fkey" FOREIGN KEY ("subscription_item_id") REFERENCES "subscription_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_users_admin" ADD CONSTRAINT "tenant_users_admin_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings_master" ADD CONSTRAINT "tenant_settings_master_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
