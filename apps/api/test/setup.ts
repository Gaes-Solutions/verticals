import { masterPrisma } from "@gaespos/db";
import { afterAll, beforeAll } from "vitest";
import { cleanupTestRefreshTokens, cleanupTestTenants } from "./helpers.js";

beforeAll(async () => {
  await cleanupTestTenants();
  await cleanupTestRefreshTokens();
});

afterAll(async () => {
  await cleanupTestTenants();
  await cleanupTestRefreshTokens();
  await masterPrisma.$disconnect();
});
