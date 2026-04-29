#!/usr/bin/env node
import { Command } from "commander";
import { masterPrisma } from "../client.js";
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
  .command("list")
  .description("Lista tenants en master DB")
  .action(async () => {
    try {
      await listTenants();
    } finally {
      await masterPrisma.$disconnect();
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  void masterPrisma.$disconnect();
  process.exit(1);
});
