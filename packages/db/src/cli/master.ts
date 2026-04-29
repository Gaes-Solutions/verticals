import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function migrateMaster(): Promise<void> {
  console.info("[master] applying migrations…");
  await execa(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy", "--schema=./prisma/master/schema.prisma"],
    {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
    },
  );
  console.info("[master] done.");
}
