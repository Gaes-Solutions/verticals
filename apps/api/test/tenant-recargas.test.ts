import { MockRecargaProvider } from "@gaespos/recargas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-recargas-1";
const OWNER_EMAIL = "owner-rc@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-rc@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let mockProvider: MockRecargaProvider;
let ownerToken: string;
let cashierToken: string;
let sucursalId: string;
let cajaId: string;
let aperturaId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

beforeAll(async () => {
  mockProvider = new MockRecargaProvider();
  app = await buildTestApp({}, { recargaProviderFactory: () => mockProvider });
  await createTestTenant(TENANT_SLUG, "Tenant Recargas");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner RC",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero RC",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: authOwner() });
  const suc = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  );
  if (!suc) throw new Error("seed sucursal");
  sucursalId = suc.id;
  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: authOwner() });
  const caja = (cajas.json() as Array<{ id: string; codigo: string }>).find(
    (c) => c.codigo === "CAJA-1",
  );
  if (!caja) throw new Error("seed caja");
  cajaId = caja.id;

  const ap = await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: authCashier(),
    payload: { montoInicial: "100" },
  });
  aperturaId = ap.json().id;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("catálogo y configuración proveedor", () => {
  it("GET /t/recargas/catalogo devuelve 9 compañías tiempo aire + Bait pospago + 3 proveedores", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/recargas/catalogo",
      headers: authCashier(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      companias: Array<{ codigo: string }>;
      proveedores: Array<{ codigo: string; isInternoDev?: boolean }>;
    };
    expect(body.companias.length).toBe(10);
    expect(body.companias.some((c) => c.codigo === "telcel")).toBe(true);
    expect(body.companias.some((c) => c.codigo === "bait_pospago")).toBe(true);
    // mock no se expone públicamente
    expect(body.proveedores.some((p) => p.codigo === "mock")).toBe(false);
    expect(body.proveedores.length).toBe(3);
  });

  it("POST recarga sin proveedor configurado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "3311112222",
        montoSolicitado: "50",
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("owner configura proveedor mock con saldo prefondeado $5000", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/t/recargas/proveedores/mock/config",
      headers: authOwner(),
      payload: {
        apiKeyEncrypted: "stub-mock-key-1234567890",
        isPrimario: true,
        isActive: true,
        saldoPrefondeado: "5000",
        saldoAlertaMinimo: "500",
        comisionProveedorPct: 2,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isPrimario).toBe(true);
    expect(Number(res.json().saldoPrefondeado)).toBe(5000);
  });

  it("cajero NO puede configurar proveedor (sin RECARGAS_CONFIGURAR, 403)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/t/recargas/proveedores/recargaki/config",
      headers: authCashier(),
      payload: { saldoPrefondeado: "100" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /t/recargas/proveedores/saldos lista estado y flag bajo=false", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/recargas/proveedores/saldos",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const saldos = res.json() as Array<{
      proveedorCodigo: string;
      bajo: boolean;
      saldoActual: string;
    }>;
    const mock = saldos.find((s) => s.proveedorCodigo === "mock");
    expect(mock).toBeDefined();
    expect(Number(mock!.saldoActual)).toBe(5000);
    expect(mock!.bajo).toBe(false);
  });
});

describe("procesar recarga exitosa", () => {
  it("cajero procesa recarga $100 telcel → exitosa + descuenta saldo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "3311112222",
        montoSolicitado: "100",
        montoCobradoCliente: "102",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      folio: string;
      estado: string;
      folioProveedor: string;
      comisionTenant: string;
    };
    expect(body.folio).toMatch(/^RC-SUC-PRINCIPAL-\d{6}$/);
    expect(body.estado).toBe("exitosa");
    expect(body.folioProveedor).toMatch(/^MOCK-/);
    expect(Number(body.comisionTenant)).toBe(2);

    const saldos = await app.inject({
      method: "GET",
      url: "/t/recargas/proveedores/saldos",
      headers: authOwner(),
    });
    const mock = (saldos.json() as Array<{ proveedorCodigo: string; saldoActual: string }>).find(
      (s) => s.proveedorCodigo === "mock",
    );
    expect(Number(mock!.saldoActual)).toBe(4900);
  });

  it("detalle incluye 1 reintento con respuesta del proveedor", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/t/recargas?estado=exitosa",
      headers: authOwner(),
    });
    const items = (list.json() as { items: Array<{ id: string }> }).items;
    const detalle = await app.inject({
      method: "GET",
      url: `/t/recargas/${items[0]!.id}`,
      headers: authOwner(),
    });
    expect(detalle.statusCode).toBe(200);
    const body = detalle.json() as {
      reintentos: Array<{ intentoNumero: number }>;
      respuestaProveedor: { code: string };
    };
    expect(body.reintentos.length).toBe(1);
    expect(body.respuestaProveedor.code).toBe("OK");
  });
});

describe("validaciones input", () => {
  it("número no-10-dígitos → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "12345",
        montoSolicitado: "50",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("monto no disponible en telcel → 400 (lista de opciones)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "3311112222",
        montoSolicitado: "77",
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message: string }).message).toMatch(/no disponible/i);
  });

  it("bait_pospago requiere referenciaCapturada → 400 sin ella", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "bait_pospago",
        numeroTelefonico: "3311112222",
        montoSolicitado: "200",
      },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { message: string }).message).toMatch(/referencia/i);
  });

  it("bait_pospago con referencia OK", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "bait_pospago",
        numeroTelefonico: "3311112222",
        montoSolicitado: "200",
        referenciaCapturada: "3311112222",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe("exitosa");
  });

  it("montoCobradoCliente < montoSolicitado → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "3311112222",
        montoSolicitado: "100",
        montoCobradoCliente: "95",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("retry y fallidas", () => {
  it("primera falla → retry → segunda exitosa: estado=exitosa, intentos=2", async () => {
    mockProvider.resetMemo();
    mockProvider.setOptions({ rejectNextRecharge: true });

    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "3311112222",
        montoSolicitado: "50",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe("exitosa");

    const detalle = await app.inject({
      method: "GET",
      url: `/t/recargas/${res.json().recargaId}`,
      headers: authOwner(),
    });
    const body = detalle.json() as { intentosTotales: number; reintentos: Array<unknown> };
    expect(body.intentosTotales).toBe(2);
    expect(body.reintentos.length).toBe(2);
  });

  it("provider lanza network error en ambos intentos → estado=fallida sin descontar saldo", async () => {
    mockProvider.resetMemo();
    const saldoAntes = await app.inject({
      method: "GET",
      url: "/t/recargas/proveedores/saldos",
      headers: authOwner(),
    });
    const saldoInicial = Number(
      (saldoAntes.json() as Array<{ proveedorCodigo: string; saldoActual: string }>).find(
        (s) => s.proveedorCodigo === "mock",
      )!.saldoActual,
    );

    mockProvider.setOptions({ numerosInvalidos: ["3399887766"] });

    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "3399887766",
        montoSolicitado: "50",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe("fallida");

    const saldoAfter = await app.inject({
      method: "GET",
      url: "/t/recargas/proveedores/saldos",
      headers: authOwner(),
    });
    const saldoFinal = Number(
      (saldoAfter.json() as Array<{ proveedorCodigo: string; saldoActual: string }>).find(
        (s) => s.proveedorCodigo === "mock",
      )!.saldoActual,
    );
    expect(saldoFinal).toBe(saldoInicial);

    mockProvider.setOptions({ numerosInvalidos: [] });
  });

  it("saldo prefondeado insuficiente → 409", async () => {
    await app.inject({
      method: "PUT",
      url: "/t/recargas/proveedores/mock/config",
      headers: authOwner(),
      payload: { saldoPrefondeado: "10" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "3311112222",
        montoSolicitado: "100",
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { message: string }).message).toMatch(/insuficiente/i);

    await app.inject({
      method: "PUT",
      url: "/t/recargas/proveedores/mock/config",
      headers: authOwner(),
      payload: { saldoPrefondeado: "5000" },
    });
  });
});

describe("reembolso y disputa", () => {
  let recargaFallidaId: string;

  it("registra recarga fallida para reembolso", async () => {
    mockProvider.resetMemo();
    mockProvider.setOptions({ numerosInvalidos: ["3300000000"] });
    const r = await app.inject({
      method: "POST",
      url: "/t/recargas",
      headers: authCashier(),
      payload: {
        sucursalId,
        cajaAperturaId: aperturaId,
        companiaCodigo: "telcel",
        numeroTelefonico: "3300000000",
        montoSolicitado: "50",
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().estado).toBe("fallida");
    recargaFallidaId = r.json().recargaId;
    mockProvider.setOptions({ numerosInvalidos: [] });
  });

  it("reembolsar recarga fallida marca estado=reembolsada", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/recargas/${recargaFallidaId}/reembolsar`,
      headers: authOwner(),
      payload: { motivo: "Cliente recibió mensaje del carrier de error" },
    });
    expect(res.statusCode).toBe(200);

    const detalle = await app.inject({
      method: "GET",
      url: `/t/recargas/${recargaFallidaId}`,
      headers: authOwner(),
    });
    expect(detalle.json().estado).toBe("reembolsada");
  });

  it("re-reembolsar → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/recargas/${recargaFallidaId}/reembolsar`,
      headers: authOwner(),
      payload: { motivo: "intento duplicado" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("reembolsar recarga exitosa → 409 (solo se reembolsan fallidas/disputadas)", async () => {
    const exitosas = await app.inject({
      method: "GET",
      url: "/t/recargas?estado=exitosa",
      headers: authOwner(),
    });
    const items = (exitosas.json() as { items: Array<{ id: string }> }).items;
    const res = await app.inject({
      method: "POST",
      url: `/t/recargas/${items[0]!.id}/reembolsar`,
      headers: authOwner(),
      payload: { motivo: "intento exitosa" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("cajero sin RECARGAS_REEMBOLSAR → 403", async () => {
    const exitosas = await app.inject({
      method: "GET",
      url: "/t/recargas?estado=exitosa",
      headers: authOwner(),
    });
    const items = (exitosas.json() as { items: Array<{ id: string }> }).items;
    const res = await app.inject({
      method: "POST",
      url: `/t/recargas/${items[0]!.id}/reembolsar`,
      headers: authCashier(),
      payload: { motivo: "intento cajero" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("marcar disputada permite reembolsar después", async () => {
    const exitosas = await app.inject({
      method: "GET",
      url: "/t/recargas?estado=exitosa",
      headers: authOwner(),
    });
    const items = (exitosas.json() as { items: Array<{ id: string }> }).items;
    const recargaId = items[items.length - 1]!.id;

    const dis = await app.inject({
      method: "POST",
      url: `/t/recargas/${recargaId}/marcar-disputada`,
      headers: authCashier(),
      payload: { motivo: "Cliente reclamó que no recibió saldo" },
    });
    expect(dis.statusCode).toBe(200);
    expect(dis.json().estado).toBe("disputada");

    const reemb = await app.inject({
      method: "POST",
      url: `/t/recargas/${recargaId}/reembolsar`,
      headers: authOwner(),
      payload: { motivo: "Resolución a favor del cliente" },
    });
    expect(reemb.statusCode).toBe(200);
  });
});

describe("filtros lista", () => {
  it("filtro por compañía", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/recargas?companiaCodigo=telcel",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ companiaCodigo: string }> }).items;
    expect(items.every((i) => i.companiaCodigo === "telcel")).toBe(true);
  });

  it("filtro por número telefónico", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/recargas?numeroTelefonico=3311112222",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });
});
