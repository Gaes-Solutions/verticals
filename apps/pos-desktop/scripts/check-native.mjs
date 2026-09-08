import { spawnSync } from "node:child_process";

const target = process.argv[2] ?? process.platform;
const platforms = { windows: "win32", macos: "darwin", linux: "linux" };
const expected = platforms[target] ?? target;
if (expected !== process.platform) {
  console.error(
    `El empaquetado ${target} debe ejecutarse en ese sistema operativo; esta máquina es ${process.platform}. Usa el agente de CI o equipo de destino.`,
  );
  process.exit(1);
}
const missing = [];
for (const command of ["rustc", "cargo"]) {
  if (spawnSync(command, ["--version"], { stdio: "ignore" }).status !== 0) missing.push(command);
}
if (
  process.platform === "linux" &&
  spawnSync("pkg-config", ["--exists", "webkit2gtk-4.1", "openssl"], { stdio: "ignore" }).status !==
    0
) {
  missing.push("pkg-config con WebKitGTK 4.1 y OpenSSL");
}
if (missing.length) {
  console.error(
    `No se puede compilar Tauri aquí. Faltan: ${missing.join(", ")}. Consulta README.md; este comando no instala dependencias.`,
  );
  process.exit(1);
}
console.log(
  "Herramientas básicas presentes. Aún se deben comprobar firma, API, hardware y ejecución del instalador.",
);
