import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-b2b-portal-1";
const OWNER = { email: "owner-b2bp@test.local", password: "ChangeMe!2026" };
const PORTAL_USER = { email: "compras@acme-b2b.mx", password: "PortalB2b!2026" };

let app: FastifyInstance;
let ownerToken: string;
let portalToken: string;
let sucursalId: string;
let varianteId: string;
let clienteB2bId: string;
let otroClienteB2bId: string;
let cotizacionId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authPortal() {
  return { authorization: `Bearer ${portalToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant B2B Portal");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Owner B2BP",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: authOwner() });
  sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  )!.id;

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "B2BP-A",
      nombre: "Costal Harina 20kg",
      precioBase: "500",
      aplicaIva: false,
      tasaIva: "0",
    },
  });
  varianteId = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;
  await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: authOwner(),
    payload: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad: "500", motivo: "seed" },
  });

  const c1 = await app.inject({
    method: "POST",
    url: "/t/clientes-b2b",
    headers: authOwner(),
    payload: { razonSocial: "Acme Mayoreo SA", rfc: "AMA900101XX1", regimenFiscalSat: "601" },
  });
  clienteB2bId = c1.json().id;
  const c2 = await app.inject({
    method: "POST",
    url: "/t/clientes-b2b",
    headers: authOwner(),
    payload: { razonSocial: "Otro Cliente SA", rfc: "OCL900101XX2", regimenFiscalSat: "601" },
  });
  otroClienteB2bId = c2.json().id;

  // lista de precios mayorista: la variante a $450 (vs $500 base)
  const lista = await app.inject({
    method: "POST",
    url: "/t/precios/listas",
    headers: authOwner(),
    payload: { codigo: "MAYOREO-ORO", nombre: "Mayoreo Oro", tipo: "cliente_individual" },
  });
  if (lista.statusCode !== 201) throw new Error(`seed lista: ${lista.body}`);
  const listaId = lista.json().id as string;
  const item = await app.inject({
    method: "PUT",
    url: `/t/precios/listas/${listaId}/items`,
    headers: authOwner(),
    payload: { varianteId, precio: "450" },
  });
  if (![200, 201].includes(item.statusCode)) throw new Error(`seed item: ${item.body}`);
  const asig = await app.inject({
    method: "POST",
    url: `/t/clientes-b2b/${clienteB2bId}/listas-precio`,
    headers: authOwner(),
    payload: { listaPrecioCodigo: "MAYOREO-ORO" },
  });
  if (asig.statusCode !== 201) throw new Error(`seed asignacion: ${asig.body}`);
});

afterAll(async () => {
  if (app) await app.close();
});

describe("usuarios del portal B2B (alta por el tenant)", () => {
  it("tenant da de alta un usuario del portal", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteB2bId}/usuarios`,
      headers: authOwner(),
      payload: {
        nombre: "Carlos Compras",
        email: PORTAL_USER.email,
        password: PORTAL_USER.password,
        rol: "admin",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().email).toBe(PORTAL_USER.email);
  });

  it("email duplicado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteB2bId}/usuarios`,
      headers: authOwner(),
      payload: { nombre: "Otro", email: PORTAL_USER.email, password: "Password!123" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("login del portal → token kind cliente_b2b", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente-b2b/login",
      payload: { tenantSlug: TENANT_SLUG, ...PORTAL_USER },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      accessToken: string;
      empresa: { razonSocial: string };
      usuario: { rol: string };
    };
    expect(body.empresa.razonSocial).toBe("Acme Mayoreo SA");
    expect(body.usuario.rol).toBe("admin");
    portalToken = body.accessToken;
  });

  it("password incorrecta → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/cliente-b2b/login",
      payload: { tenantSlug: TENANT_SLUG, email: PORTAL_USER.email, password: "mala-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("portal rechaza token de tenant (kind incorrecto) → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/b2b-portal/me", headers: authOwner() });
    expect(res.statusCode).toBe(401);
  });
});

describe("portal: me + catálogo con mis precios", () => {
  it("GET /me devuelve empresa, usuario y crédito null (sin línea)", async () => {
    const res = await app.inject({ method: "GET", url: "/b2b-portal/me", headers: authPortal() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      empresa: { razonSocial: string };
      usuario: { nombre: string };
      credito: unknown;
    };
    expect(body.empresa.razonSocial).toBe("Acme Mayoreo SA");
    expect(body.usuario.nombre).toBe("Carlos Compras");
    expect(body.credito).toBeNull();
  });

  it("con línea de crédito autorizada, /me la refleja", async () => {
    await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteB2bId}/credito`,
      headers: authOwner(),
      payload: { lineaAutorizada: 50000, diasCredito: 30 },
    });
    const res = await app.inject({ method: "GET", url: "/b2b-portal/me", headers: authPortal() });
    const credito = res.json().credito as { lineaAutorizada: string; disponible: string };
    expect(Number(credito.lineaAutorizada)).toBe(50000);
    expect(Number(credito.disponible)).toBe(50000);
  });

  it("catálogo muestra MI precio de lista ($450) sobre el base ($500)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/b2b-portal/catalogo?q=Harina",
      headers: authPortal(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      listaPrecioCodigo: string;
      items: Array<{
        variantes: Array<{ precio: string; precioBase: string; precioLista: boolean }>;
      }>;
    };
    expect(body.listaPrecioCodigo).toBe("MAYOREO-ORO");
    const v = body.items[0]?.variantes[0];
    expect(Number(v?.precio)).toBe(450);
    expect(Number(v?.precioBase)).toBe(500);
    expect(v?.precioLista).toBe(true);
  });
});

describe("portal: pedido autoservicio", () => {
  let pedidoId: string;

  it("crea pedido con precio de lista aplicado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/b2b-portal/pedidos",
      headers: authPortal(),
      payload: { lineas: [{ varianteId, cantidad: "10" }], notas: "Pedido desde el portal" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { pedidoId: string; folio: string; total: string };
    pedidoId = body.pedidoId;
    // 10 × $450 (lista) = $4,500
    expect(Number(body.total)).toBe(4500);
    expect(body.folio).toMatch(/^PD-/);
  });

  it("mis pedidos lo lista y el detalle trae líneas", async () => {
    const lista = await app.inject({
      method: "GET",
      url: "/b2b-portal/pedidos",
      headers: authPortal(),
    });
    expect((lista.json() as Array<{ id: string }>).some((p) => p.id === pedidoId)).toBe(true);
    const det = await app.inject({
      method: "GET",
      url: `/b2b-portal/pedidos/${pedidoId}`,
      headers: authPortal(),
    });
    expect(det.statusCode).toBe(200);
    expect((det.json().lineas as unknown[]).length).toBe(1);
  });

  it("empresa con requiereOrdenCompra exige OC → 422", async () => {
    await app.inject({
      method: "PATCH",
      url: `/t/clientes-b2b/${clienteB2bId}`,
      headers: authOwner(),
      payload: { requiereOrdenCompra: true },
    });
    const res = await app.inject({
      method: "POST",
      url: "/b2b-portal/pedidos",
      headers: authPortal(),
      payload: { lineas: [{ varianteId, cantidad: "1" }] },
    });
    expect(res.statusCode).toBe(422);
    const ok = await app.inject({
      method: "POST",
      url: "/b2b-portal/pedidos",
      headers: authPortal(),
      payload: { lineas: [{ varianteId, cantidad: "1" }], ordenCompraCliente: "OC-7788" },
    });
    expect(ok.statusCode).toBe(201);
  });
});

describe("portal: cotizaciones (firma del cliente)", () => {
  it("setup: vendedor crea y envía cotización", async () => {
    const cot = await app.inject({
      method: "POST",
      url: "/t/cotizaciones",
      headers: authOwner(),
      payload: {
        sucursalId,
        clienteB2bId,
        diasVigencia: 15,
        lineas: [{ varianteId, cantidad: "20" }],
      },
    });
    expect(cot.statusCode).toBe(201);
    cotizacionId = cot.json().cotizacionId;
    const env = await app.inject({
      method: "POST",
      url: `/t/cotizaciones/${cotizacionId}/enviar`,
      headers: authOwner(),
      payload: { canal: "email", destino: PORTAL_USER.email },
    });
    expect(env.statusCode).toBe(200);
  });

  it("el cliente la ve en su lista (sin borradores)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/b2b-portal/cotizaciones",
      headers: authPortal(),
    });
    const items = res.json() as Array<{ id: string; estado: string }>;
    expect(items.some((c) => c.id === cotizacionId && c.estado === "enviada")).toBe(true);
  });

  it("el cliente ACEPTA la cotización (firma desde el portal)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/b2b-portal/cotizaciones/${cotizacionId}/aceptar`,
      headers: authPortal(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("aceptada");
  });

  it("cotización de otro cliente → 404 (ownership)", async () => {
    const otra = await app.inject({
      method: "POST",
      url: "/t/cotizaciones",
      headers: authOwner(),
      payload: {
        sucursalId,
        clienteB2bId: otroClienteB2bId,
        diasVigencia: 15,
        lineas: [{ varianteId, cantidad: "1" }],
      },
    });
    const res = await app.inject({
      method: "POST",
      url: `/b2b-portal/cotizaciones/${otra.json().cotizacionId}/aceptar`,
      headers: authPortal(),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("portal: estado de cuenta", () => {
  it("refleja crédito y CxC del cliente", async () => {
    await app.inject({
      method: "POST",
      url: "/t/cxc",
      headers: authOwner(),
      payload: {
        sucursalId,
        tipoOrigen: "manual",
        clienteB2bId,
        montoOriginal: "1200",
        diasCreditoOtorgados: 30,
      },
    });
    const res = await app.inject({
      method: "GET",
      url: "/b2b-portal/estado-cuenta",
      headers: authPortal(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      credito: { disponible: string };
      cuentas: Array<{ montoOriginal: string }>;
    };
    expect(body.cuentas.length).toBeGreaterThanOrEqual(1);
    // 50,000 - 1,200 = 48,800 disponibles
    expect(Number(body.credito.disponible)).toBe(48800);
  });
});
