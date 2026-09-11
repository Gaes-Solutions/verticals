#!/usr/bin/env node
import { Command } from "commander";
import { masterPrisma } from "../client.js";
import { onboardTenant } from "../onboard-tenant.js";
import { seedAllTenantDefaults, seedTenantDefaults } from "../seed-tenant.js";
import { makeMigration } from "./make-migration.js";
import { migrateMaster } from "./master.js";
import { createTenant, listTenants, migrateAllTenants, migrateTenant } from "./tenant.js";

const program = new Command();

program
  .name("gaes-migrate")
  .description("CLI para migraciones multi-schema GaesSoft POS")
  .version("0.0.0");

program
  .command("master")
  .description("Aplica migrations pendientes sobre master DB")
  .action(async () => {
    try {
      await migrateMaster();
    } finally {
      await masterPrisma.$disconnect();
    }
  });

const tenant = program.command("tenant").description("Operaciones sobre tenants");

tenant
  .command("create <slug>")
  .description("Crea tenant: registro en master + schema postgres + migrations")
  .requiredOption("-n, --name <name>", "Nombre del tenant")
  .option("-p, --plan <code>", "Código del plan", "free")
  .action(async (slug: string, opts: { name: string; plan: string }) => {
    try {
      await createTenant({ slug, name: opts.name, planCode: opts.plan });
    } finally {
      await masterPrisma.$disconnect();
    }
  });

tenant
  .command("onboard <slug>")
  .description("Alta completa: tenant + schema + migrations + defaults + usuario dueño")
  .requiredOption("-n, --name <name>", "Nombre del negocio")
  .requiredOption("-e, --email <email>", "Correo del dueño")
  .option("-p, --plan <code>", "Código del plan", "free")
  .option("-P, --password <password>", "Contraseña del dueño (si se omite, se genera)")
  .option("--nombre <nombre>", "Nombre del dueño", "Dueño")
  .action(
    async (
      slug: string,
      opts: { name: string; email: string; plan: string; password?: string; nombre: string },
    ) => {
      try {
        const r = await onboardTenant({
          slug,
          name: opts.name,
          planCode: opts.plan,
          ownerEmail: opts.email,
          ...(opts.password ? { ownerPassword: opts.password } : {}),
          ownerNombre: opts.nombre,
        });
        console.info("\n========================================");
        console.info(`✅ Tenant listo: ${r.slug} (${r.tenantCreado ? "nuevo" : "ya existía"})`);
        console.info(`   Negocio:   ${opts.name}`);
        console.info(`   Dueño:     ${r.ownerEmail}`);
        console.info(`   Password:  ${r.ownerPassword ?? "(la que indicaste)"}`);
        console.info("   Acceso:    web-admin → slug del negocio + correo + contraseña");
        if (r.ownerPassword) {
          console.info("   ⚠️  Guarda/entrega esta contraseña: no se vuelve a mostrar.");
        }
        console.info("========================================\n");
      } finally {
        await masterPrisma.$disconnect();
      }
    },
  );

tenant
  .command("migrate <slug>")
  .description("Aplica migrations pendientes sobre el schema de un tenant")
  .action(async (slug: string) => {
    try {
      await migrateTenant(slug);
    } finally {
      await masterPrisma.$disconnect();
    }
  });

tenant
  .command("migrate-all")
  .description("Aplica migrations pendientes sobre todos los tenants no cancelados")
  .action(async () => {
    try {
      await migrateAllTenants();
    } finally {
      await masterPrisma.$disconnect();
    }
  });

tenant
  .command("directorio")
  .description("Rellena el índice de correo → negocio (permite entrar sin escribir el slug)")
  .action(async () => {
    try {
      const { sembrarDirectorio } = await import("../directorio-seed.js");
      const r = await sembrarDirectorio();
      console.info(`[directorio] ${r.usuarios} usuarios de ${r.tenants} tenants indexados`);
    } finally {
      await masterPrisma.$disconnect();
    }
  });

tenant
  .command("dominios")
  .description("Registra la dirección de cada tienda en el índice host → tienda (para el QR)")
  .action(async () => {
    try {
      const { sembrarDominios } = await import("../dominios-seed.js");
      const r = await sembrarDominios();
      console.info(`[dominios] ${r.registrados} tiendas con dirección registrada`);
      for (const o of r.omitidos) console.info(`[dominios] omitida: ${o}`);
    } finally {
      await masterPrisma.$disconnect();
    }
  });

tenant
  .command("list")
  .description("Lista tenants en master DB")
  .action(async () => {
    try {
      await listTenants();
    } finally {
      await masterPrisma.$disconnect();
    }
  });

tenant
  .command("seed <slug>")
  .description("Siembra roles preset + sucursal/caja default en un tenant (idempotente)")
  .action(async (slug: string) => {
    try {
      const result = await seedTenantDefaults(slug);
      console.info(
        `[tenant seed] ${slug}: roles_created=${result.rolesCreated}, roles_updated=${result.rolesUpdated}, sucursal_creada=${result.sucursalCreated}, caja_creada=${result.cajaCreated}`,
      );
    } finally {
      await masterPrisma.$disconnect();
    }
  });

const make = program
  .command("make <target> <name>")
  .description("Genera una migration nueva via shadow schema. target: master|tenant")
  .action(async (target: string, name: string) => {
    if (target !== "master" && target !== "tenant") {
      throw new Error(`target inválido: "${target}". Usa "master" o "tenant".`);
    }
    try {
      await makeMigration(target, name);
    } finally {
      await masterPrisma.$disconnect();
    }
  });
void make;

tenant
  .command("seed-all")
  .description("Siembra defaults en todos los tenants no cancelados")
  .action(async () => {
    try {
      await seedAllTenantDefaults();
    } finally {
      await masterPrisma.$disconnect();
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  void masterPrisma.$disconnect();
  process.exit(1);
});
