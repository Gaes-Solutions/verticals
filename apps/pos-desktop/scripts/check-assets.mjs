import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("src-tauri/tauri.conf.json", root), "utf8"));
const failures = [];
for (const icon of config.bundle.icon) {
  try {
    await access(new URL(`src-tauri/${icon}`, root));
  } catch {
    failures.push(`Falta icono: ${icon}`);
  }
}
const cargo = await readFile(new URL("src-tauri/Cargo.toml", root), "utf8");
const version = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (version !== config.version) failures.push("Las versiones de Cargo y Tauri no coinciden.");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Configuración e iconos disponibles en ${fileURLToPath(root)}. Esta revisión no compila ni certifica el instalador.`,
);
