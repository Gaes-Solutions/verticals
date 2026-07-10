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

const SLUG = "test-cobrar-venta";

let app: FastifyInstance;
let token: string;
let userId: string;
let sucursalId: string;
let cajaId: string;
let folioSeq = 1;

function auth() {
  return { authorization: `Bearer ${token}` };
}

// Crea una venta en borrador (como la del alta hospitalaria) vía Prisma.
async function crearBorrador(total: string): Promise<string> {
  const client = getTenantClient(SLUG);
  const v = await client.venta.create({
    data: {
      folio: `BORRADOR-${folioSeq++}`,
      sucursalId,
      usuarioId: userId,
      canal: "pos",
      moneda: "MXN",
      estado: "borrador",
      subtotal: total,
      total,
      observaciones: "Alta hospitalización (test)",
    },
    select: { id: true },
  });
  return v.id;
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(SLUG);
  const dueno = await createTenantUser(SLUG, {
    email: "dueno@test.local",
    password: "Test1234!",
    rolCodigo: "dueno",
  });
  const sesion = await loginTenantUser(app, SLUG, dueno.email, dueno.password);
  token = sesion.accessToken;
  userId = sesion.userId;
  sucursalId = (
    await app.inject({ method: "GET", url: "/t/sucursales", headers: auth() })
  ).json()[0].id;
  cajaId = (await app.inject({ method: "GET", url: "/t/cajas", headers: auth() })).json()[0].id;
  // abrir caja (apertura) para que el cobro pueda ligarse al corte
  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: auth(),
    payload: { cajaId, montoInicial: "0" },
  });
});

afterAll(async () => {
  await app.close();
  await cleanupTestTenants();
});

describe("cobrar venta en borrador", () => {
  it("cobra una venta borrador, la liga a la caja y la cuenta el corte", async () => {
    const id = await crearBorrador("300.00");
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${id}/cobrar`,
      headers: auth(),
      payload: { cajaId, pagos: [{ metodo: "efectivo", monto: "300" }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalCobrado).toBe("300");
    expect(body.cambioDado).toBe("0");

    // estado cobrada + ligada a la caja con cobradaAt → el corte la cuenta
    // (el corte filtra por cajaId + cobradaAt en la ventana de apertura).
    const client = getTenantClient(SLUG);
    const venta = await client.venta.findUnique({
      where: { id },
      include: { pagos: true },
    });
    expect(venta?.estado).toBe("cobrada");
    expect(venta?.cajaId).toBe(cajaId);
    expect(venta?.cobradaAt).not.toBeNull();
    expect(venta?.pagos).toHaveLength(1);
  });

  it("calcula el cambio cuando se paga de más en efectivo", async () => {
    const id = await crearBorrador("250.00");
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${id}/cobrar`,
      headers: auth(),
      payload: { cajaId, pagos: [{ metodo: "efectivo", monto: "300" }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().cambioDado).toBe("50");
  });

  it("rechaza pagos insuficientes", async () => {
    const id = await crearBorrador("300.00");
    const res = await app.inject({
      method: "POST",
      url: `/t/ventas/${id}/cobrar`,
      headers: auth(),
      payload: { cajaId, pagos: [{ metodo: "efectivo", monto: "100" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("no permite cobrar dos veces", async () => {
    const id = await crearBorrador("120.00");
    const ok = await app.inject({
      method: "POST",
      url: `/t/ventas/${id}/cobrar`,
      headers: auth(),
      payload: { cajaId, pagos: [{ metodo: "tarjeta_debito", monto: "120" }] },
    });
    expect(ok.statusCode).toBe(200);
    const otra = await app.inject({
      method: "POST",
      url: `/t/ventas/${id}/cobrar`,
      headers: auth(),
      payload: { cajaId, pagos: [{ metodo: "efectivo", monto: "120" }] },
    });
    expect(otra.statusCode).toBe(409);
  });
});
