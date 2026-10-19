import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/sentry-privacy.unit.test.ts"], setupFiles: [] },
});
