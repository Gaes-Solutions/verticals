import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/cfdi-fiscal-amounts.unit.test.ts"], setupFiles: [] },
});
