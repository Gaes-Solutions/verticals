import { hash } from "@node-rs/argon2";
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
