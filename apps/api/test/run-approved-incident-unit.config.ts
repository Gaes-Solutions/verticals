import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "test/run-approved-incident.unit.ts",
      "test/incidents.unit.ts",
      "test/incidents-admin.unit.ts",
      "test/incidents-admin.unit.ts",
    ],
    setupFiles: [],
  },
});
