import { defineConfig } from "vitest/config";

// Medición de presupuestos de rendimiento. Fuera de la batería normal: tarda y
// depende de la máquina, así que se corre a mano o en un job aparte.
export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    include: ["test/carga.perf.ts"],
    setupFiles: ["./test/setup.ts"],
    hookTimeout: 600000,
    testTimeout: 600000,
  },
});
