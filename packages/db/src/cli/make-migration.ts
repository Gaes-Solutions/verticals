import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { Client } from "pg";
import { requireEnv } from "./utils.js";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Target = "master" | "tenant";

/**
 * Genera una migration nueva usando el patrón shadow-database:
 *   1. Crea una database postgres temporal (no schema)
 *   2. Usa `migrate diff --from-migrations` que aplica las existentes al shadow
 *   3. Compara contra el schema.prisma actual (delta)
 *   4. Escribe el SQL resultante en una migration nueva con timestamp
 *   5. Limpia la database temporal
 *
 * El "shadow DB" (no schema dentro de la misma DB) evita que el diff
 * confunda el schema temporal con `public` y termine recreando todo.
 */
export async function makeMigration(target: Target, name: string): Promise<void> {
  if (!/^[a-z][a-z0-9_]{1,60}$/.test(name)) {
    throw new Error(`Nombre inválido: "${name}". Solo a-z 0-9 _, empezar con letra, 2-61 chars.`);
  }

  const schemaPath = `./prisma/${target}/schema.prisma`;
  const migrationsDirAbs = path.join(PACKAGE_ROOT, "prisma", target, "migrations");

  const masterUrl = requireEnv("DATABASE_URL_MASTER");
  const shadowDbName = `_gaes_shadow_${randomBytes(4).toString("hex")}`;
  const shadowUrl = adminUrlWithDatabase(masterUrl, shadowDbName);
  const adminUrl = adminUrlWithDatabase(masterUrl, "postgres");

  console.info(`[migration make] target=${target} name=${name} shadow_db=${shadowDbName}`);

  try {
    await withPgClient(adminUrl, async (client) => {
      await client.query(`CREATE DATABASE "${shadowDbName}"`);
    });

    console.info("[migration make] generando diff contra schema.prisma actual…");
    const diff = await execa(
      "pnpm",
      [
        "exec",
        "prisma",
        "migrate",
        "diff",
        "--from-migrations",
        migrationsDirAbs,
        "--to-schema-datamodel",
        schemaPath,
        "--shadow-database-url",
        shadowUrl,
        "--script",
      ],
      {
        cwd: PACKAGE_ROOT,
        env: {
          ...process.env,
          ...(target === "master"
            ? { DATABASE_URL_MASTER: shadowUrl }
            : { DATABASE_URL_TENANT: shadowUrl }),
        },
      },
    );

    const sql = diff.stdout.trim();
    if (!sql || /^-- This is an empty migration\.?$/i.test(sql)) {
      console.info("[migration make] No hay cambios pendientes. Migration NO creada.");
      return;
    }

    const timestamp = formatTimestamp(new Date());
    const dirName = `${timestamp}_${name}`;
    const dirPath = path.join(migrationsDirAbs, dirName);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(path.join(dirPath, "migration.sql"), `${sql}\n`, "utf8");

    console.info(`[migration make] ✓ creada ${path.relative(PACKAGE_ROOT, dirPath)}`);
    console.info(
      `[migration make] revisa el SQL y aplícalo con: pnpm migrate ${target === "master" ? "master" : "tenant migrate-all"}`,
    );
  } finally {
    try {
      await withPgClient(adminUrl, async (client) => {
        await client.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${shadowDbName}' AND pid<>pg_backend_pid()`,
        );
        await client.query(`DROP DATABASE IF EXISTS "${shadowDbName}"`);
      });
    } catch (err) {
      console.warn(`[migration make] no pudo limpiar shadow_db=${shadowDbName}:`, err);
    }
  }
}

function adminUrlWithDatabase(baseUrl: string, dbName: string): string {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  u.searchParams.delete("schema");
  return u.toString();
}

async function withPgClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function formatTimestamp(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}
