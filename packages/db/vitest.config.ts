import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/generated/**",
        "**/migrations/**",
        "**/*.config.*",
        "**/*.test.*",
        "src/cli/migrate.ts",
        "src/seed-master.ts",
      ],
    },
  },
});
