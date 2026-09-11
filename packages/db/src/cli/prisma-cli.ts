import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Corre `prisma migrate deploy` con el mismo Node que ya está corriendo.
 *
 * El contenedor de producción no trae pnpm ni npx, y el API sí crea negocios
 * (registro público y alta desde superadmin), cada uno con sus tablas. Llamar
 * a "pnpm exec prisma" ahí tronaba con ENOENT y dejaba el alta a medias.
 */
export async function prismaMigrateDeploy(schema: string, env: NodeJS.ProcessEnv): Promise<void> {
  await execa(process.execPath, [prismaCli(), "migrate", "deploy", `--schema=${schema}`], {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
    env,
  });
}

function prismaCli(): string {
  const require = createRequire(import.meta.url);
  const manifiesto = require.resolve("prisma/package.json");
  const { bin } = require(manifiesto) as { bin: string | Record<string, string> };
  const relativo = typeof bin === "string" ? bin : bin.prisma;
  if (!relativo) throw new Error("El paquete prisma no declara su ejecutable");
  return path.join(path.dirname(manifiesto), relativo);
}
