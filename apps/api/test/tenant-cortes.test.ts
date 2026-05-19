import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-cortes-1";
const OWNER_EMAIL = "owner-c@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-c@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;

function authOwner(): { authorization: string } {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier(): { authorization: string } {
  return { authorization: `Bearer ${cashierToken}` };
}

async function injectStock(cantidad: string): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: {
      varianteId,
      sucursalId,
      tipo: "ajuste_positivo",
      cantidad,
      motivo: "stock test",
    },
  });
  if (res.statusCode !== 201) throw new Error("stock setup");
}

async function cobrarVenta(monto: string): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/t/ventas",
    headers: authCashier(),
    payload: {
      sucursalId,
      cajaId,
      lineas: [{ varianteId, cantidad: "1" }],
      pagos: [{ metodo: "efectivo", monto }],
    },
  });
  if (res.statusCode !== 201) throw new Error(`venta failed: ${res.body}`);
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Cortes");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner Cortes",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero Cortes",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: authOwner() });
  const principal = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  );
  if (!principal) throw new Error("sucursal");
  sucursalId = principal.id;

  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: authOwner() });
  const caja = (cajas.json() as Array<{ id: string; codigo: string }>).find(
    (c) => c.codigo === "CAJA-1",
  );
  if (!caja) throw new Error("caja");
  cajaId = caja.id;

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "CORTE-A",
      nombre: "Producto cortes",
      precioBase: "100",
      aplicaIva: false,
      tasaIva: "0",
    },
  });
  const v = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0];
  if (!v) throw new Error("variante");
  varianteId = v.id;
  await injectStock("100");
});

afterAll(async () => {
  if (app) await app.close();
});

describe("apertura de caja", () => {
  it("ventas sin apertura → 409 (caja sin apertura activa)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/apertura/);
  });

  it("cajero abre caja con monto inicial", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cajas/${cajaId}/aperturar`,
      headers: authCashier(),
      payload: { montoInicial: "500", observaciones: "Apertura test" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();
  });

  it("rechaza segunda apertura mientras la primera sigue abierta (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cajas/${cajaId}/aperturar`,
      headers: authOwner(),
      payload: { montoInicial: "100" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("GET apertura-actual devuelve la apertura abierta", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cajas/${cajaId}/apertura-actual`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(Number(res.json().montoInicial)).toBe(500);
  });

  it("ventas con apertura activa cobran OK", async () => {
    await cobrarVenta("100");
    await cobrarVenta("100");
    await cobrarVenta("100");
  });
});

describe("movimientos de caja", () => {
  let aperturaId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cajas/${cajaId}/apertura-actual`,
      headers: authOwner(),
    });
    aperturaId = res.json().id;
  });

  it("entrada por préstamo aumenta efectivo esperado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/caja-movimientos",
      headers: authCashier(),
      payload: {
        aperturaId,
        tipo: "entrada_prestamo",
        monto: "200",
        motivo: "Préstamo del gerente para cambio",
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("salida por gasto disminuye efectivo esperado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/caja-movimientos",
      headers: authCashier(),
      payload: {
        aperturaId,
        tipo: "salida_gasto",
        monto: "50",
        motivo: "Compra urgente de bolsas",
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("corte X — parcial informativo", () => {
  let aperturaId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cajas/${cajaId}/apertura-actual`,
      headers: authOwner(),
    });
    aperturaId = res.json().id;
  });

  it("calcula arqueo y diferencia (esperado = 500 inicial + 300 ventas + 200 préstamo - 50 gasto = 950)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cortes",
      headers: authOwner(),
      payload: {
        aperturaId,
        tipo: "X",
        denominaciones: {
          billetes: { "500": 1, "200": 2, "50": 1 },
          monedas: {},
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { tipo: string; diferencia: string };
    expect(body.tipo).toBe("X");
    expect(Number(body.diferencia)).toBe(0);
  });

  it("corte X NO cierra la apertura", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cajas/${cajaId}/apertura-actual`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
  });

  it("ventas siguen funcionando tras corte X", async () => {
    await cobrarVenta("100");
  });
});

describe("corte Z — definitivo cierre turno", () => {
  let aperturaId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cajas/${cajaId}/apertura-actual`,
      headers: authOwner(),
    });
    aperturaId = res.json().id;
  });

  it("corte Z con denominación incorrecta marca faltante", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cortes",
      headers: authOwner(),
      payload: {
        aperturaId,
        tipo: "Z",
        denominaciones: {
          billetes: { "500": 2 },
          monedas: {},
        },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(Number(res.json().diferencia)).toBeLessThan(0);
  });

  it("Z cerró la apertura", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cajas/${cajaId}/apertura-actual`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("ventas bloqueadas tras Z hasta nueva apertura (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("nueva apertura permite cobrar de nuevo", async () => {
    const apertura = await app.inject({
      method: "POST",
      url: `/t/cajas/${cajaId}/aperturar`,
      headers: authCashier(),
      payload: { montoInicial: "0" },
    });
    expect(apertura.statusCode).toBe(201);
    await cobrarVenta("100");
  });

  it("rechaza corte sobre apertura cerrada (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cortes",
      headers: authOwner(),
      payload: {
        aperturaId,
        tipo: "X",
        denominaciones: { billetes: {}, monedas: {} },
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("GET cortes lista con filtros sucursal", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/cortes?sucursalId=${sucursalId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(2);
  });
});

describe("permisos cortes", () => {
  it("cajero NO puede forzar cierre (sin caja.cerrar_forzoso, 403)", async () => {
    const apertura = await app.inject({
      method: "GET",
      url: `/t/cajas/${cajaId}/apertura-actual`,
      headers: authOwner(),
    });
    const aperturaId = apertura.json().id;
    const res = await app.inject({
      method: "POST",
      url: "/t/cortes",
      headers: authCashier(),
      payload: {
        aperturaId,
        tipo: "Z",
        cerradaForzosa: true,
        denominaciones: { billetes: {}, monedas: {} },
      },
    });
    expect(res.statusCode).toBe(403);
  });
});
