import { masterPrisma } from "./client.js";

async function main(): Promise<void> {
  console.info("[seed-master] starting…");

  const plans = [
    {
      code: "free",
      name: "Free",
      priceCents: 0,
      currency: "MXN",
      description: "Demo/eval — 1 sucursal, 1 caja, 100 productos, sin CFDI",
    },
    {
      code: "starter",
      name: "Starter",
      priceCents: 49900,
      currency: "MXN",
      description: "1 sucursal, 2 cajas, productos ilimitados, CFDI básico",
    },
    {
      code: "growth",
      name: "Growth",
      priceCents: 99900,
      currency: "MXN",
      description: "3 sucursales, multi-caja, ecommerce, IA básica, WhatsApp",
    },
    {
      code: "scale",
      name: "Scale",
      priceCents: 199900,
      currency: "MXN",
      description: "Sucursales ilimitadas, todos módulos verticales, IA completa, partner program",
    },
  ];

  for (const plan of plans) {
    await masterPrisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }

  console.info(`[seed-master] upserted ${plans.length} plans`);

  const totalPlans = await masterPrisma.plan.count();
  const totalTenants = await masterPrisma.tenant.count();
  console.info(`[seed-master] DB state: ${totalPlans} plans, ${totalTenants} tenants`);
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
