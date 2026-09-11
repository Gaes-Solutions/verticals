import { prismaMigrateDeploy } from "./prisma-cli.js";

export async function migrateMaster(): Promise<void> {
  console.info("[master] applying migrations…");
  await prismaMigrateDeploy("./prisma/master/schema.prisma", process.env);
  console.info("[master] done.");
}
