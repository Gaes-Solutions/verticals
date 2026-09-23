import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/password-reset.unit.test.ts"], setupFiles: [] },
});
