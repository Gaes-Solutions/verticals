import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // El tsconfig usa jsx:"preserve" (Next); para los tests el JSX se compila con
  // el runtime automático, igual que apps/web-pos.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
