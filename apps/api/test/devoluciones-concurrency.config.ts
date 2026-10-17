import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/devoluciones-concurrency.unit.test.ts"],
    setupFiles: [],
  },
});
