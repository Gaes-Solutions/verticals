import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestApp,
  cleanupTestTenants,
  createTenantUser,
  createTestTenant,
  loginTenantUser,
} from "./helpers.js";

const SLUG = "test-venta-mon";
const OWNER = { email: "owner-vmon@test.local", password: "Owner!2026x" };

let app: FastifyInstance;
let token: string;
let sucursalId = "";
let varianteId = "";
let clienteId = "";

function auth() {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  await cleanupTestTenants();
  app = await buildTestApp();
  await createTestTenant(SLUG);
  await createTenantUser(SLUG, { ...OWNER, rolCodigo: "dueno", nombre: "Dueño" });
  token = (await loginTenantUser(app, SLUG, OWNER.email, OWNER.password)).accessToken;

  const sucs = (
    await app.inject({ method: "GET", url: "/t/sucursales", headers: auth() })
  ).json() as Array<{ id: string; codigo: string }>;
  sucursalId = sucs.find((s) => s.codigo === "SUC-PRINCIPAL")?.id ?? "";

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: {
      skuPadre: "MON-A",
      nombre: "Producto Monedero",
      precioBase: "100",
      aplicaIva: false,
    },
  });
  varianteId = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0]?.id ?? "";

  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "20", motivo: "Stock" },
  });

  // Cliente con $150 de saldo en el monedero.
  const cliente = await getTenantClient(SLUG).cliente.create({
    data: { nombre: "Cliente con saldo", saldoMonedero: "150" },
  });
  clienteId = cliente.id;
});

afterAll(async () => {
  await cleanupTestTenants();
  if (app) await app.close();
});

describe("consumo de monedero en venta POS", () => {
  it("paga venta de $100 completa con monedero y descuenta el saldo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(),
      payload: {
        sucursalId,
        clienteId,
        canal: "pos",
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "monedero", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(201);

    const cliente = await getTenantClient(SLUG).cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: { saldoMonedero: true },
    });
    expect(Number(cliente.saldoMonedero)).toBe(50);

    const mov = await getTenantClient(SLUG).monederoMovimiento.findFirst({
      where: { clienteId, tipo: "cargo" },
      orderBy: { createdAt: "desc" },
    });
    expect(mov).toBeTruthy();
    expect(Number(mov?.monto)).toBe(100);
    expect(Number(mov?.saldoResultante)).toBe(50);
    expect(mov?.refTipo).toBe("venta");
  });

  it("rechaza pago con monedero sin clienteId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(),
      payload: {
        sucursalId,
        canal: "pos",
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "monedero", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rechaza cuando el saldo del monedero es insuficiente", async () => {
    // Saldo restante = $50; intenta pagar $100 todo con monedero.
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(),
      payload: {
        sucursalId,
        clienteId,
        canal: "pos",
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "monedero", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(409);

    // El saldo no debe haberse modificado tras el rechazo.
    const cliente = await getTenantClient(SLUG).cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: { saldoMonedero: true },
    });
    expect(Number(cliente.saldoMonedero)).toBe(50);
  });

  it("permite split: $50 monedero + $50 efectivo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(),
      payload: {
        sucursalId,
        clienteId,
        canal: "pos",
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [
          { metodo: "monedero", monto: "50" },
          { metodo: "efectivo", monto: "50" },
        ],
      },
    });
    expect(res.statusCode).toBe(201);

    const cliente = await getTenantClient(SLUG).cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: { saldoMonedero: true },
    });
    expect(Number(cliente.saldoMonedero)).toBe(0);
  });
});
