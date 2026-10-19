import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/run-approved-incident.unit.ts"], setupFiles: [] },
});
