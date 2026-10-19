import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/incident-worker.unit.ts"], setupFiles: [] },
});
