import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    hookTimeout: 30000,
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/test/**", "**/*.config.*"],
    },
  },
});
