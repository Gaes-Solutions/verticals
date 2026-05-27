import { MockEmailProvider } from "@gaespos/email";
import { type MockMessagingProvider, mockSms, mockWhatsapp } from "@gaespos/mensajeria";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-marketing-1";
const OWNER = { email: "owner-mkt@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let waMock: MockMessagingProvider;
let emailMock: MockEmailProvider;
let ownerToken: string;
let sucursalId: string;
let cajaId: string;
let varianteId: string;
let productoId: string;
let clienteId: string;

function auth() {
  return { authorization: `Bearer ${ownerToken}` };
}

beforeAll(async () => {
  waMock = mockWhatsapp();
  emailMock = new MockEmailProvider();
  app = await buildTestApp(
    {},
    {
      mensajeriaProviderFactory: (canal) => (canal === "whatsapp" ? waMock : mockSms()),
      emailProviderFactory: () => emailMock,
    },
  );
  await createTestTenant(TENANT_SLUG, "Marketing Demo");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Owner Mkt",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth() });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;
  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: auth() });
  cajaId = (cajas.json() as Array<{ id: string; codigo: string }>).find(
    (c) => c.codigo === "CAJA-1",
  )!.id;
  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: auth(),
    payload: { montoInicial: "100" },
  });

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: {
      skuPadre: "MKT-001",
      nombre: "Producto Mkt",
      precioBase: "100",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  productoId = prod.json().id;
  varianteId = prod.json().variantes[0].id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(),
    payload: {
      varianteId,
      sucursalId,
      tipo: "ajuste_positivo",
      cantidad: "200",
      motivo: "Inicial",
    },
  });
  const cli = await app.inject({
    method: "POST",
    url: "/t/clientes",
    headers: auth(),
    payload: {
      nombre: "Carla",
      apellidos: "Test",
      telefonoPrincipal: "3339998888",
      emailPrincipal: "carla@test.mx",
    },
  });
  clienteId = cli.json().id;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("motor de promociones en venta", () => {
  it("promo descuento_pct 20% reduce el total y registra aplicación", async () => {
    const promo = await app.inject({
      method: "POST",
      url: "/t/promociones",
      headers: auth(),
      payload: {
        nombre: "20% productos Mkt",
        tipo: "descuento_pct",
        acciones: { valor: 20 },
        vigenciaInicio: new Date(Date.now() - 86400000).toISOString(),
        canales: ["todos"],
        productos: [{ productoId, rol: "incluido" }],
      },
    });
    expect(promo.statusCode).toBe(201);
    await app.inject({
      method: "POST",
      url: `/t/promociones/${promo.json().id}/activar`,
      headers: auth(),
    });

    // vende 1 unidad ($100 con IVA incluido) → con 20% promo, total ~$80
    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "100" }],
      },
    });
    expect(venta.statusCode).toBe(201);
    const detalle = await app.inject({
      method: "GET",
      url: `/t/ventas/${venta.json().ventaId}`,
      headers: auth(),
    });
    const d = detalle.json() as {
      total: string;
      promocionesAplicadas: Array<{ montoDescuento: string }>;
    };
    expect(Number(d.total)).toBeCloseTo(80, 0);
    expect(d.promocionesAplicadas.length).toBe(1);
    expect(Number(d.promocionesAplicadas[0]?.montoDescuento)).toBeCloseTo(20, 0);
  });

  it("venta sin promos vigentes mantiene precio normal", async () => {
    // pausa la promo
    const promos = await app.inject({
      method: "GET",
      url: "/t/promociones?status=activa",
      headers: auth(),
    });
    for (const p of promos.json() as Array<{ id: string }>) {
      await app.inject({ method: "POST", url: `/t/promociones/${p.id}/pausar`, headers: auth() });
    }
    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "100" }],
      },
    });
    const detalle = await app.inject({
      method: "GET",
      url: `/t/ventas/${venta.json().ventaId}`,
      headers: auth(),
    });
    expect(Number(detalle.json().total)).toBeCloseTo(100, 0);
  });
});

describe("segmentación RFM", () => {
  it("recalcula RFM y asigna segmento al cliente con compras", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/segmentos/recalcular-rfm",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().clientesProcesados).toBeGreaterThanOrEqual(0);
    // crea venta atribuida al cliente para que tenga métricas
    await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(),
      payload: {
        sucursalId,
        cajaId,
        clienteId,
        lineas: [{ varianteId, cantidad: "2" }],
        pagos: [{ metodo: "efectivo", monto: "200" }],
      },
    });
    await app.inject({ method: "POST", url: "/t/segmentos/recalcular-rfm", headers: auth() });
    const metricas = await app.inject({
      method: "GET",
      url: "/t/segmentos/rfm/metricas",
      headers: auth(),
    });
    const arr = metricas.json() as Array<{ cliente: { id: string }; segmentoRfmCalculado: string }>;
    const mia = arr.find((m) => m.cliente.id === clienteId);
    expect(mia).toBeDefined();
    expect(mia?.segmentoRfmCalculado).toBeTruthy();
  });

  it("segmento dinámico RFM resuelve clientes por segmento calculado", async () => {
    const seg = await app.inject({
      method: "POST",
      url: "/t/segmentos",
      headers: auth(),
      payload: {
        nombre: "Todos activos",
        tipo: "dinamico_rfm",
        definicion: {
          segmentos: ["champion", "leal", "nuevo", "hibernando", "en_riesgo", "perdido"],
        },
      },
    });
    const clientes = await app.inject({
      method: "GET",
      url: `/t/segmentos/${seg.json().id}/clientes`,
      headers: auth(),
    });
    expect(clientes.json().total).toBeGreaterThanOrEqual(1);
  });
});

describe("campañas + worker in-process", () => {
  let campanaId: string;
  let segmentoId: string;

  beforeAll(async () => {
    const seg = await app.inject({
      method: "POST",
      url: "/t/segmentos",
      headers: auth(),
      payload: {
        nombre: "Campaña target",
        tipo: "dinamico_rfm",
        definicion: {
          segmentos: ["champion", "leal", "nuevo", "hibernando", "en_riesgo", "perdido"],
        },
      },
    });
    segmentoId = seg.json().id;
  });

  it("crea plantilla + campaña whatsapp", async () => {
    const pl = await app.inject({
      method: "POST",
      url: "/t/campanas/plantillas",
      headers: auth(),
      payload: {
        nombre: "Promo WA",
        canal: "whatsapp",
        tipo: "promocional",
        contenidoHandlebars: "Hola {{nombre}}, 20% off!",
      },
    });
    expect(pl.statusCode).toBe(201);
    const camp = await app.inject({
      method: "POST",
      url: "/t/campanas",
      headers: auth(),
      payload: {
        nombre: "Reactivación",
        objetivo: "reactivacion",
        canal: "whatsapp",
        segmentoId,
        plantillaId: pl.json().id,
      },
    });
    expect(camp.statusCode).toBe(201);
    campanaId = camp.json().id;
  });

  it("encola envíos para el segmento", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/campanas/${campanaId}/encolar`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().encolados).toBeGreaterThanOrEqual(1);
  });

  it("worker procesa la cola y envía via mock WhatsApp", async () => {
    const antes = waMock.enviados.length;
    const res = await app.inject({
      method: "POST",
      url: `/t/campanas/${campanaId}/procesar`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().enviados).toBeGreaterThanOrEqual(1);
    expect(waMock.enviados.length).toBeGreaterThan(antes);
    expect(waMock.enviados.some((m) => m.contenido.includes("Carla"))).toBe(true);
  });

  it("opt-out bloquea envío promocional al cliente", async () => {
    // cliente nuevo con opt-out
    const cli2 = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: auth(),
      payload: { nombre: "NoQuiero", apellidos: "Promo", telefonoPrincipal: "3331110000" },
    });
    // venta para que entre al segmento RFM
    await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: auth(),
      payload: {
        sucursalId,
        cajaId,
        clienteId: cli2.json().id,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "efectivo", monto: "100" }],
      },
    });
    await app.inject({ method: "POST", url: "/t/segmentos/recalcular-rfm", headers: auth() });
    // opt-out directo en DB via API no existe; usamos el modelo (se valida en encolar)
    const { getTenantClient } = await import("@gaespos/db");
    const tc = await getTenantClient(TENANT_SLUG);
    await tc.clienteOptOut.create({
      data: { clienteId: cli2.json().id, canal: "whatsapp", tipo: "promocional" },
    });

    const camp2 = await app.inject({
      method: "POST",
      url: "/t/campanas",
      headers: auth(),
      payload: { nombre: "Promo 2", objetivo: "promo", canal: "whatsapp", segmentoId },
    });
    const enc = await app.inject({
      method: "POST",
      url: `/t/campanas/${camp2.json().id}/encolar`,
      headers: auth(),
    });
    expect(enc.json().omitidosOptOut).toBeGreaterThanOrEqual(1);
  });
});

describe("lealtad por puntos", () => {
  it("configura programa, inscribe, acumula y canjea", async () => {
    const prog = await app.inject({
      method: "PUT",
      url: "/t/lealtad/programa",
      headers: auth(),
      payload: {
        nombre: "Puntos GaesSoft",
        reglaAcumulacion: { puntosPorPeso: 1 },
        valorPuntoRedimible: "0.1",
        requiereConsentimiento: true,
      },
    });
    expect([200, 201]).toContain(prog.statusCode);

    const insc = await app.inject({
      method: "POST",
      url: "/t/lealtad/inscribir",
      headers: auth(),
      payload: { clienteId, consentimiento: true },
    });
    expect(insc.statusCode).toBe(201);

    const acum = await app.inject({
      method: "POST",
      url: "/t/lealtad/acumular",
      headers: auth(),
      payload: { clienteId, monto: "500" },
    });
    expect(acum.statusCode).toBe(200);
    expect(acum.json().puntosGanados).toBe(500);

    const canje = await app.inject({
      method: "POST",
      url: "/t/lealtad/canjear",
      headers: auth(),
      payload: { clienteId, puntos: 200 },
    });
    expect(canje.statusCode).toBe(200);
    expect(canje.json().saldo).toBe(300);
    expect(Number(canje.json().valorMxn)).toBeCloseTo(20, 1);
  });

  it("canje sin saldo suficiente → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/lealtad/canjear",
      headers: auth(),
      payload: { clienteId, puntos: 999999 },
    });
    expect(res.statusCode).toBe(409);
  });

  it("inscribir sin consentimiento cuando se requiere → 400", async () => {
    const cli3 = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: auth(),
      payload: { nombre: "Sin", apellidos: "Consent" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/t/lealtad/inscribir",
      headers: auth(),
      payload: { clienteId: cli3.json().id, consentimiento: false },
    });
    expect(res.statusCode).toBe(400);
  });
});
