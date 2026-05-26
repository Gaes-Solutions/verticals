-- CreateEnum
CREATE TYPE "partner_tipo" AS ENUM ('contador', 'integrador', 'consultor', 'agencia', 'otro');

-- CreateEnum
CREATE TYPE "partner_nivel" AS ENUM ('bronze', 'silver', 'gold', 'diamond');

-- CreateEnum
CREATE TYPE "partner_estado" AS ENUM ('invitado', 'activo', 'pausado', 'terminado');

-- CreateEnum
CREATE TYPE "referral_estado" AS ENUM ('click', 'signup', 'trial', 'paying', 'churned');

-- CreateEnum
CREATE TYPE "commission_estado" AS ENUM ('pendiente', 'aprobada', 'pagada', 'rechazada', 'disputada');

-- CreateEnum
CREATE TYPE "payout_estado" AS ENUM ('pendiente', 'en_proceso', 'pagado', 'fallido');

-- CreateEnum
CREATE TYPE "payout_metodo" AS ENUM ('spei', 'paypal', 'stripe_connect', 'otro');

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "rfc" TEXT,
    "email_contacto" TEXT NOT NULL,
    "telefono_contacto" TEXT,
    "tipo" "partner_tipo" NOT NULL,
    "nivel" "partner_nivel" NOT NULL DEFAULT 'bronze',
    "comision_pct_override" DECIMAL(5,2),
    "estado" "partner_estado" NOT NULL DEFAULT 'invitado',
    "terms_accepted_at" TIMESTAMP(3),
    "is_accepting_new_referrals" BOOLEAN NOT NULL DEFAULT true,
    "bank_account" JSONB,
    "ciudad" TEXT,
    "estado_mx" TEXT,
    "pagina_web" TEXT,
    "notas_internas" TEXT,
    "fecha_ingreso" TIMESTAMP(3),
    "fecha_terminacion" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_branding" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "slug_publico" TEXT NOT NULL,
    "logo_url" TEXT,
    "color_primario" TEXT,
    "color_secundario" TEXT,
    "tagline" TEXT,
    "dominio_partner" TEXT,
    "bio_publica" TEXT,
    "is_publico_activo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_links" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "target_path" TEXT NOT NULL DEFAULT '/signup',
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "clicks_total" INTEGER NOT NULL DEFAULT 0,
    "signups_total" INTEGER NOT NULL DEFAULT 0,
    "paid_conversions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "estado" "referral_estado" NOT NULL DEFAULT 'click',
    "cookie_value" TEXT,
    "first_click_at" TIMESTAMP(3),
    "signup_at" TIMESTAMP(3),
    "trial_start_at" TIMESTAMP(3),
    "paid_start_at" TIMESTAMP(3),
    "churned_at" TIMESTAMP(3),
    "atribucion_expira_en" TIMESTAMP(3),
    "ip_primer_click" TEXT,
    "user_agent_primer_click" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "periodo_yyyymm" TEXT NOT NULL,
    "monto_base_tenant_paid" DECIMAL(14,2) NOT NULL,
    "porcentaje_aplicado" DECIMAL(5,2) NOT NULL,
    "monto_comision" DECIMAL(14,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "estado" "commission_estado" NOT NULL DEFAULT 'pendiente',
    "aprobada_at" TIMESTAMP(3),
    "aprobada_por_admin_id" TEXT,
    "rechazada_at" TIMESTAMP(3),
    "rechazada_motivo" TEXT,
    "pagada_at" TIMESTAMP(3),
    "payout_id" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "periodo_yyyymm" TEXT NOT NULL,
    "monto_total" DECIMAL(14,2) NOT NULL,
    "retencion_isr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "retencion_iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "monto_neto" DECIMAL(14,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "metodoPago" "payout_metodo" NOT NULL,
    "estado" "payout_estado" NOT NULL DEFAULT 'pendiente',
    "folio_bancario" TEXT,
    "fecha_pago" TIMESTAMP(3),
    "invoice_partner_url" TEXT,
    "motivo_falla" TEXT,
    "creado_por_admin_id" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_invitaciones" (
    "id" TEXT NOT NULL,
    "partner_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "enviada_a" TEXT NOT NULL,
    "enviada_por_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_codigo_key" ON "partners"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "partners_rfc_key" ON "partners"("rfc");

-- CreateIndex
CREATE UNIQUE INDEX "partners_email_contacto_key" ON "partners"("email_contacto");

-- CreateIndex
CREATE INDEX "partners_nivel_idx" ON "partners"("nivel");

-- CreateIndex
CREATE INDEX "partners_estado_idx" ON "partners"("estado");

-- CreateIndex
CREATE INDEX "partners_tipo_idx" ON "partners"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "partner_branding_partner_id_key" ON "partner_branding"("partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_branding_slug_publico_key" ON "partner_branding"("slug_publico");

-- CreateIndex
CREATE UNIQUE INDEX "partner_branding_dominio_partner_key" ON "partner_branding"("dominio_partner");

-- CreateIndex
CREATE UNIQUE INDEX "partner_links_slug_key" ON "partner_links"("slug");

-- CreateIndex
CREATE INDEX "partner_links_partner_id_idx" ON "partner_links"("partner_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_tenant_id_key" ON "referrals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_cookie_value_key" ON "referrals"("cookie_value");

-- CreateIndex
CREATE INDEX "referrals_partner_id_estado_idx" ON "referrals"("partner_id", "estado");

-- CreateIndex
CREATE INDEX "referrals_link_id_idx" ON "referrals"("link_id");

-- CreateIndex
CREATE INDEX "referrals_tenant_id_idx" ON "referrals"("tenant_id");

-- CreateIndex
CREATE INDEX "referrals_atribucion_expira_en_idx" ON "referrals"("atribucion_expira_en");

-- CreateIndex
CREATE INDEX "commissions_partner_id_periodo_yyyymm_idx" ON "commissions"("partner_id", "periodo_yyyymm");

-- CreateIndex
CREATE INDEX "commissions_estado_idx" ON "commissions"("estado");

-- CreateIndex
CREATE INDEX "commissions_payout_id_idx" ON "commissions"("payout_id");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_referral_id_periodo_yyyymm_key" ON "commissions"("referral_id", "periodo_yyyymm");

-- CreateIndex
CREATE INDEX "payouts_estado_idx" ON "payouts"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_partner_id_periodo_yyyymm_key" ON "payouts"("partner_id", "periodo_yyyymm");

-- CreateIndex
CREATE UNIQUE INDEX "partner_invitaciones_token_key" ON "partner_invitaciones"("token");

-- CreateIndex
CREATE INDEX "partner_invitaciones_partner_id_idx" ON "partner_invitaciones"("partner_id");

-- CreateIndex
CREATE INDEX "partner_invitaciones_expires_at_idx" ON "partner_invitaciones"("expires_at");

-- AddForeignKey
ALTER TABLE "partner_branding" ADD CONSTRAINT "partner_branding_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "partner_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invitaciones" ADD CONSTRAINT "partner_invitaciones_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
