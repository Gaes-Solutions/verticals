import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/carrito-verificar.unit.test.ts"], setupFiles: [] },
});
