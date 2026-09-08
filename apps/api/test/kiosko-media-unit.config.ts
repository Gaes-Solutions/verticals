import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/kiosko-media.unit.test.ts"], setupFiles: [] },
});
