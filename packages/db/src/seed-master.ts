import { hash } from "@node-rs/argon2";
import { masterPrisma } from "./client.js";

/**
 * Planes V1 (Hito 6, modelo de negocio cerrado en sesión 2026-04-24).
 * Conservo los `code` históricos (free/starter/growth/scale) por compatibilidad
 * con demos/tests; los nombres user-facing y precios siguen el modelo oficial.
 */
const PLAN_CONFIG = [
  {
    code: "free",
    name: "Free",
    displayName: "Free",
    priceCents: 0,
    description: "Demo/eval — 1 sucursal, 1 caja, 100 productos, sin CFDI",
    tierOrder: 0,
    isPublic: false,
    mxnMonthly: 0,
    usdMonthly: 0,
    features: {
      pos_basico: ["bool", "true"],
      usuarios_max: ["int", "1"],
      sucursales_max: ["int", "1"],
      productos_max: ["int", "100"],
      ventas_mes_max: ["int", "100"],
    },
  },
  {
    code: "starter",
    name: "Starter",
    displayName: "Starter",
    priceCents: 39900,
    description: "1 sucursal, 2 usuarios, 500 productos, POS+Inventario+Clientes+Caja",
    tierOrder: 1,
    isPublic: true,
    mxnMonthly: 39900,
    usdMonthly: 2400,
    features: {
      pos_basico: ["bool", "true"],
      usuarios_max: ["int", "2"],
      sucursales_max: ["int", "1"],
      productos_max: ["int", "500"],
      ventas_mes_max: ["int", "1000"],
      cfdi: ["bool", "false"],
      ecommerce_basico: ["bool", "false"],
      whatsapp_transaccional: ["int", "0"],
    },
  },
  {
    code: "growth",
    name: "Pro",
    displayName: "Pro",
    priceCents: 79900,
    description:
      "3 sucursales, 10 usuarios, productos ilimitados, ecommerce + WhatsApp transaccional",
    tierOrder: 2,
    isPublic: true,
    mxnMonthly: 79900,
    usdMonthly: 4900,
    features: {
      pos_basico: ["bool", "true"],
      mayoreo_b2b: ["bool", "true"],
      apartados_cxc: ["bool", "true"],
      cotizaciones_comisiones: ["bool", "true"],
      usuarios_max: ["int", "10"],
      sucursales_max: ["int", "3"],
      productos_max: ["int", "-1"],
      ventas_mes_max: ["int", "5000"],
      cfdi: ["bool", "true"],
      ecommerce_basico: ["bool", "true"],
      whatsapp_transaccional: ["int", "500"],
      salud_basico: ["bool", "true"],
    },
  },
  {
    code: "scale",
    name: "Business",
    displayName: "Business",
    priceCents: 149900,
    description:
      "Sucursales y usuarios ilimitados, pagos online, WhatsApp marketing, offline, API, dominio",
    tierOrder: 3,
    isPublic: true,
    mxnMonthly: 149900,
    usdMonthly: 8900,
    features: {
      pos_basico: ["bool", "true"],
      mayoreo_b2b: ["bool", "true"],
      apartados_cxc: ["bool", "true"],
      cotizaciones_comisiones: ["bool", "true"],
      usuarios_max: ["int", "-1"],
      sucursales_max: ["int", "-1"],
      productos_max: ["int", "-1"],
      ventas_mes_max: ["int", "20000"],
      cfdi: ["bool", "true"],
      ecommerce_basico: ["bool", "true"],
      ecommerce_pagos_online: ["bool", "true"],
      whatsapp_transaccional: ["int", "2000"],
      whatsapp_marketing: ["int", "2000"],
      desktop_offline: ["bool", "true"],
      api_publico: ["bool", "true"],
      dominio_custom: ["bool", "true"],
      salud_basico: ["bool", "true"],
      salud_n3_hospitalizacion: ["bool", "true"],
      marketplace_doctoralia: ["bool", "true"],
      phr_unificado: ["bool", "true"],
      partners_panel: ["bool", "true"],
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    displayName: "Enterprise",
    priceCents: 349900,
    description: "Multi-marca, white-label, SLA, servidor dedicado opcional. Por cotización.",
    tierOrder: 4,
    isPublic: false,
    mxnMonthly: 349900,
    usdMonthly: 19900,
    features: {
      everything: ["bool", "true"],
      usuarios_max: ["int", "-1"],
      sucursales_max: ["int", "-1"],
      productos_max: ["int", "-1"],
      ventas_mes_max: ["int", "-1"],
      white_label: ["bool", "true"],
      sla: ["bool", "true"],
    },
  },
];

async function seedPlans(): Promise<void> {
  for (const cfg of PLAN_CONFIG) {
    const plan = await masterPrisma.plan.upsert({
      where: { code: cfg.code },
      update: {
        name: cfg.name,
        priceCents: cfg.priceCents,
        currency: "MXN",
        description: cfg.description,
        tierOrder: cfg.tierOrder,
        isPublic: cfg.isPublic,
        active: true,
      },
      create: {
        code: cfg.code,
        name: cfg.name,
        priceCents: cfg.priceCents,
        currency: "MXN",
        description: cfg.description,
        tierOrder: cfg.tierOrder,
        isPublic: cfg.isPublic,
        active: true,
      },
    });

    // Multi-currency: MXN + USD, monthly + yearly (yearly = monthly × 10 = 17% off)
    const prices = [
      { currency: "MXN", interval: "monthly" as const, unitAmount: cfg.mxnMonthly },
      { currency: "MXN", interval: "yearly" as const, unitAmount: cfg.mxnMonthly * 10 },
      { currency: "USD", interval: "monthly" as const, unitAmount: cfg.usdMonthly },
      { currency: "USD", interval: "yearly" as const, unitAmount: cfg.usdMonthly * 10 },
    ];
    for (const p of prices) {
      await masterPrisma.planPrice.upsert({
        where: {
          planId_currency_interval: {
            planId: plan.id,
            currency: p.currency,
            interval: p.interval,
          },
        },
        update: { unitAmount: p.unitAmount, isActive: true },
        create: { planId: plan.id, ...p, isActive: true },
      });
    }

    const featureEntries = Object.entries(cfg.features) as Array<[string, [string, string]]>;
    for (const [key, [type, value]] of featureEntries) {
      await masterPrisma.planFeature.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey: key } },
        update: { value, valueType: type },
        create: { planId: plan.id, featureKey: key, value, valueType: type },
      });
    }
  }
  console.info(`[seed-master] upserted ${PLAN_CONFIG.length} plans + prices + features`);
}

async function main(): Promise<void> {
  console.info("[seed-master] starting…");
  await seedPlans();

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@gaessoft.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!2026";
  const passwordHash = await hash(adminPassword, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await masterPrisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: "Admin GaesSoft",
      role: "superadmin",
      active: true,
    },
  });
  console.info(`[seed-master] upserted admin user "${adminEmail}"`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.warn(
      `[seed-master] ⚠️  Admin password = "${adminPassword}" (set SEED_ADMIN_PASSWORD env to override)`,
    );
  }

  const totalPlans = await masterPrisma.plan.count();
  const totalTenants = await masterPrisma.tenant.count();
  const totalAdmins = await masterPrisma.adminUser.count();
  console.info(
    `[seed-master] DB state: ${totalPlans} plans, ${totalTenants} tenants, ${totalAdmins} admins`,
  );
}

main()
  .then(async () => {
    await masterPrisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[seed-master] error:", err);
    await masterPrisma.$disconnect();
    process.exit(1);
  });
