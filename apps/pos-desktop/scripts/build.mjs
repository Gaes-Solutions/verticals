import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./build-plan.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
let temporary;
try {
  const source = JSON.parse(await readFile(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
  if (process.argv.length > 3)
    throw new Error(
      "El script acepta únicamente un destino de build; no recibe argumentos libres de Tauri.",
    );
  const target = process.argv[2] ?? "native";
  const plan = buildPlan(process.env.GAESPOS_API_BASE, source.app.security.csp, target);
  for (const script of ["check-native.mjs", "check-assets.mjs"]) {
    const checked = spawnSync(process.execPath, [join(root, "scripts", script)], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    if (checked.error || checked.status !== 0)
      throw new Error("No se cumplieron las comprobaciones previas del build.");
  }
  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const relativeTemp = relative(repositoryRoot, await realpath(tmpdir()));
  if (relativeTemp !== ".." && !relativeTemp.startsWith(`..${sep}`) && !isAbsolute(relativeTemp))
    throw new Error(
      "El directorio temporal debe estar fuera del repositorio. Configura un directorio temporal del sistema.",
    );
  temporary = await mkdtemp(join(tmpdir(), "gaespos-desktop-build-"));
  const configPath = join(temporary, "tauri.override.json");
  await writeFile(configPath, JSON.stringify(plan.override), { mode: 0o600 });
  const environment = { ...process.env, VITE_POS_API_BASE: plan.apiBase };
  environment.TAURI_CONFIG = undefined;
  const result = spawnSync(
    process.execPath,
    [require.resolve("@tauri-apps/cli/tauri.js"), ...plan.args, "--config", configPath],
    {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: environment,
    },
  );
  if (result.error) throw new Error("No se pudo iniciar la CLI de Tauri.");
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "No se pudo preparar el build de escritorio.",
  );
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}
