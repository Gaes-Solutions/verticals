import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/producto-registro.unit.test.ts"], setupFiles: [] },
});
