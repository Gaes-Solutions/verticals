import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node", include: ["test/wishlist-variants.unit.test.ts"], setupFiles: [] },
});
