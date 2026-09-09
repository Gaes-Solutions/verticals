/**
 * Medición de los presupuestos de rendimiento de CLAUDE.md sin instalar nada.
 *
 * Levanta la API en proceso, siembra un tenant con catálogo, y mide la latencia
 * real de los caminos críticos. Complementa a k6 (tests/carga/k6): k6 mide con
 * concurrencia y red, esto mide el trabajo del servidor, que es donde vive la
 * mayor parte del presupuesto.
 *
 *   cd apps/api && set -a && . ../../.env && set +a
 *   pnpm vitest run --config test/carga.config.ts
 */
import { getTenantClient } from "@gaespos/db";
import { describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-carga";
const OWNER = { email: "owner-carga@test.local", password: "Carga!2026x" };
const CALENTAMIENTO = 20;
const ITERACIONES = 200;

interface Presupuesto {
  nombre: string;
  limiteMs: number;
  ejecutar: () => Promise<number>;
}

function percentil(valores: number[], p: number): number {
  const orden = [...valores].sort((a, b) => a - b);
  const i = Math.ceil((p / 100) * orden.length) - 1;
  return orden[Math.max(0, Math.min(i, orden.length - 1))] ?? 0;
}

async function medir(p: Presupuesto): Promise<{ p50: number; p95: number; max: number }> {
  for (let i = 0; i < CALENTAMIENTO; i++) await p.ejecutar();
  const muestras: number[] = [];
  for (let i = 0; i < ITERACIONES; i++) {
    const t0 = performance.now();
    await p.ejecutar();
    muestras.push(performance.now() - t0);
  }
  return { p50: percentil(muestras, 50), p95: percentil(muestras, 95), max: Math.max(...muestras) };
}

describe("presupuestos de rendimiento", () => {
  it("mide los caminos críticos del POS", async () => {
    await cleanupTestTenants();
    const app = await buildTestApp();
    await createTestTenant(SLUG, "Tenant Carga");
    await createTenantUser(SLUG, {
      email: OWNER.email,
      password: OWNER.password,
      rolCodigo: "dueno",
      nombre: "Dueño Carga",
    });
    const token = (await loginTenantUser(app, SLUG, OWNER.email, OWNER.password)).accessToken;
    const headers = { authorization: `Bearer ${token}` };
    const client = getTenantClient(SLUG);

    // Catálogo de 500 productos: medir contra 2 productos no dice nada real.
    process.stdout.write("Sembrando catálogo de 500 productos… ");
    const filas = Array.from({ length: 500 }, (_, i) => ({
      skuPadre: `CARGA-${String(i).padStart(4, "0")}`,
      nombre: `Producto de carga ${i}`,
      precioBase: (10 + (i % 90)).toFixed(2),
      codigoBarras: `75010000${String(i).padStart(5, "0")}`,
      claveSat: "50181900",
      claveUnidadSat: "H87",
    }));
    await app.inject({ method: "POST", url: "/t/productos/bulk", headers, payload: { filas } });
    console.log("listo");

    const sucursal = await client.sucursal.findFirstOrThrow({ select: { id: true } });
    const caja = await client.caja.findFirstOrThrow({ select: { id: true } });
    const variante = await client.productoVariante.findFirstOrThrow({
      where: { sku: "CARGA-0100" },
      select: { id: true },
    });

    // Stock alto: que la venta no falle por inventario y contamine la medición.
    await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers,
      payload: {
        varianteId: variante.id,
        sucursalId: sucursal.id,
        tipo: "ajuste_positivo",
        cantidad: "100000",
        motivo: "Carga",
      },
    });

    const presupuestos: Presupuesto[] = [
      {
        nombre: "Búsqueda producto POS",
        limiteMs: 100,
        ejecutar: async () => {
          const r = await app.inject({
            method: "GET",
            url: "/t/productos/buscar/7501000000100",
            headers,
          });
          return r.statusCode;
        },
      },
      {
        nombre: "Agregar línea a venta",
        limiteMs: 50,
        ejecutar: async () => {
          const r = await app.inject({
            method: "POST",
            url: "/t/ventas/preview",
            headers,
            payload: {
              sucursalId: sucursal.id,
              canal: "pos",
              lineas: [{ varianteId: variante.id, cantidad: "1" }],
            },
          });
          return r.statusCode;
        },
      },
      {
        nombre: "Checkout completo (sin CFDI)",
        limiteMs: 500,
        ejecutar: async () => {
          const r = await app.inject({
            method: "POST",
            url: "/t/ventas",
            headers,
            payload: {
              sucursalId: sucursal.id,
              cajaId: caja.id,
              lineas: [{ varianteId: variante.id, cantidad: "1" }],
              pagos: [{ metodo: "efectivo", monto: "1000" }],
            },
          });
          return r.statusCode;
        },
      },
    ];

    console.log(`\nMuestras: ${ITERACIONES} por caso (más ${CALENTAMIENTO} de calentamiento)\n`);
    console.log("Caso                            P50      P95      Máx     Presupuesto  Resultado");
    let fallas = 0;
    for (const p of presupuestos) {
      const m = await medir(p);
      const ok = m.p95 < p.limiteMs;
      if (!ok) fallas++;
      console.log(
        `${p.nombre.padEnd(30)} ${m.p50.toFixed(1).padStart(6)}ms ${m.p95.toFixed(1).padStart(6)}ms ` +
          `${m.max.toFixed(1).padStart(6)}ms ${`<${p.limiteMs}ms`.padStart(10)}  ${ok ? "CUMPLE" : "NO CUMPLE"}`,
      );
    }

    await cleanupTestTenants();
    await app.close();
    console.log(
      fallas === 0 ? "\nTodos los presupuestos se cumplen." : `\n${fallas} presupuesto(s) fuera.`,
    );
    expect(fallas, "presupuestos de rendimiento fuera de límite").toBe(0);
  }, 600_000);
});
