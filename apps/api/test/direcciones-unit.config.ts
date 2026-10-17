import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/cliente-direcciones.unit.test.ts"], setupFiles: [] },
});
