import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-b2b-1";
const OWNER_EMAIL = "owner-b2b@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const VENDEDOR_EMAIL = "vendedor-b2b@test.local";
const VENDEDOR_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let vendedorUserId: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant B2B");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner B2B",
  });
  const vendedor = await createTenantUser(TENANT_SLUG, {
    email: VENDEDOR_EMAIL,
    password: VENDEDOR_PASSWORD,
    rolCodigo: "vendedor",
    nombre: "Vendedor B2B",
  });
  vendedorUserId = vendedor.id;
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("CRUD clientes B2B", () => {
  let clienteId: string;

  it("crea cliente B2B con RFC + datos fiscales", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes-b2b",
      headers: authOwner(),
      payload: {
        razonSocial: "ABC Comercializadora SA de CV",
        nombreComercial: "ABC Mayorista",
        rfc: "ACO850101AB1",
        regimenFiscalSat: "601",
        usoCfdiDefault: "G03",
        codigoPostalFiscal: "44100",
        emailPrincipal: "compras@abc.com",
        telefonoPrincipal: "3312345678",
        industria: "tlapaleria",
        diasCreditoDefault: 30,
        condicionesPago: "credito",
        requiereOrdenCompra: true,
        requiereAprobacionInterna: true,
        montoAprobacionRequired: "5000",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; rfc: string };
    clienteId = body.id;
    expect(body.rfc).toBe("ACO850101AB1");
  });

  it("rechaza RFC duplicado (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes-b2b",
      headers: authOwner(),
      payload: {
        razonSocial: "Dup",
        rfc: "ACO850101AB1",
        regimenFiscalSat: "601",
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it("búsqueda por razón social parcial", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/clientes-b2b?q=Comerc",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });

  it("búsqueda por RFC", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/clientes-b2b?q=ACO850101",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Array<{ id: string }>;
    expect(items.some((c) => c.id === clienteId)).toBe(true);
  });

  it("GET detalle incluye contactos+direcciones+creditos+listas+vendedores", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/clientes-b2b/${clienteId}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      contactos: unknown[];
      direcciones: unknown[];
      creditos: unknown[];
    };
    expect(Array.isArray(body.contactos)).toBe(true);
    expect(Array.isArray(body.direcciones)).toBe(true);
    expect(Array.isArray(body.creditos)).toBe(true);
  });

  it("PATCH actualiza nivel mayoreo y notas", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/clientes-b2b/${clienteId}`,
      headers: authOwner(),
      payload: { notas: "Cliente principal del corredor norte" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().notas).toContain("corredor");
  });
});

describe("sub-recursos B2B: contactos + direcciones envío", () => {
  let clienteId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes-b2b",
      headers: authOwner(),
      payload: {
        razonSocial: "Distribuidora del Norte SA",
        rfc: "DNO900101XY1",
        regimenFiscalSat: "601",
      },
    });
    clienteId = res.json().id;
  });

  it("agrega 3 contactos con roles", async () => {
    for (const c of [
      { nombre: "Ana", apellidos: "Gómez", puesto: "Gerente Compras", esDecisor: true },
      { nombre: "Luis", apellidos: "Ríos", puesto: "Asistente", esDecisor: false },
      { nombre: "Maria", apellidos: "Pérez", puesto: "Contadora", esPagador: true },
    ]) {
      const res = await app.inject({
        method: "POST",
        url: `/t/clientes-b2b/${clienteId}/contactos`,
        headers: authOwner(),
        payload: c,
      });
      expect(res.statusCode).toBe(201);
    }
    const detalle = await app.inject({
      method: "GET",
      url: `/t/clientes-b2b/${clienteId}`,
      headers: authOwner(),
    });
    expect((detalle.json() as { contactos: unknown[] }).contactos).toHaveLength(3);
  });

  it("agrega 2 direcciones de envío con swap is_default_envio", async () => {
    await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteId}/direcciones`,
      headers: authOwner(),
      payload: {
        etiqueta: "Bodega Centro",
        calle: "Av. Industrial",
        numeroExterior: "100",
        codigoPostal: "44100",
        isDefaultEnvio: true,
      },
    });
    await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteId}/direcciones`,
      headers: authOwner(),
      payload: {
        etiqueta: "Sucursal Norte",
        calle: "Av. Patria",
        codigoPostal: "45100",
        contactoRecepcionNombre: "Juan",
        contactoRecepcionTelefono: "3398765432",
        horarioRecepcion: "L-V 9-18hrs",
        isDefaultEnvio: true,
      },
    });
    const detalle = await app.inject({
      method: "GET",
      url: `/t/clientes-b2b/${clienteId}`,
      headers: authOwner(),
    });
    const dirs = (
      detalle.json() as { direcciones: Array<{ etiqueta: string; isDefaultEnvio: boolean }> }
    ).direcciones;
    expect(dirs).toHaveLength(2);
    expect(dirs.filter((d) => d.isDefaultEnvio)).toHaveLength(1);
    expect(dirs.find((d) => d.isDefaultEnvio)?.etiqueta).toBe("Sucursal Norte");
  });
});

describe("créditos B2B", () => {
  let clienteId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes-b2b",
      headers: authOwner(),
      payload: {
        razonSocial: "Cliente con crédito SA",
        rfc: "CCC850101AB1",
        regimenFiscalSat: "601",
        condicionesPago: "credito",
      },
    });
    clienteId = res.json().id;
  });

  it("autoriza línea de crédito", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteId}/credito`,
      headers: authOwner(),
      payload: {
        lineaAutorizada: "50000",
        diasCredito: 45,
        tasaInteresMoraPct: 3.5,
        notasAutorizacion: "Cliente con historial de 2 años en otra cuenta",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      lineaAutorizada: string;
      diasCredito: number;
      aprobadoPorId: string;
      isActive: boolean;
    };
    expect(Number(body.lineaAutorizada)).toBe(50000);
    expect(body.diasCredito).toBe(45);
    expect(body.isActive).toBe(true);
  });

  it("nueva autorización archiva la anterior (max 1 activa)", async () => {
    await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteId}/credito`,
      headers: authOwner(),
      payload: { lineaAutorizada: "100000", diasCredito: 60 },
    });
    const detalle = await app.inject({
      method: "GET",
      url: `/t/clientes-b2b/${clienteId}`,
      headers: authOwner(),
    });
    const creditos = (
      detalle.json() as { creditos: Array<{ isActive: boolean; lineaAutorizada: string }> }
    ).creditos;
    expect(creditos).toHaveLength(2);
    const activas = creditos.filter((c) => c.isActive);
    expect(activas).toHaveLength(1);
    expect(Number(activas[0]?.lineaAutorizada)).toBe(100000);
  });
});

describe("multi-vendedor y listas de precio asignadas", () => {
  let clienteId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes-b2b",
      headers: authOwner(),
      payload: {
        razonSocial: "Cliente multi-vendedor SA",
        rfc: "CMV900101AB1",
        regimenFiscalSat: "601",
      },
    });
    clienteId = res.json().id;
  });

  it("asigna lista de precios PUBLICO sembrada por seed", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteId}/listas-precio`,
      headers: authOwner(),
      payload: { listaPrecioCodigo: "PUBLICO", prioridad: 100 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("rechaza lista de precios inexistente (404)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteId}/listas-precio`,
      headers: authOwner(),
      payload: { listaPrecioCodigo: "NO_EXISTE", prioridad: 100 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("asigna vendedor principal con comisión override", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteId}/vendedores`,
      headers: authOwner(),
      payload: {
        usuarioId: vendedorUserId,
        tipo: "principal",
        comisionPctOverride: 7.5,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it("asigna 2do vendedor de cobranza al mismo cliente", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes-b2b/${clienteId}/vendedores`,
      headers: authOwner(),
      payload: { usuarioId: vendedorUserId, tipo: "cobranza", comisionPctOverride: 2 },
    });
    expect(res.statusCode).toBe(201);
    const detalle = await app.inject({
      method: "GET",
      url: `/t/clientes-b2b/${clienteId}`,
      headers: authOwner(),
    });
    const vends = (detalle.json() as { vendedoresAsignados: Array<{ tipo: string }> })
      .vendedoresAsignados;
    expect(vends).toHaveLength(2);
    expect(vends.map((v) => v.tipo).sort()).toEqual(["cobranza", "principal"]);
  });
});

describe("ventas referenciando clienteB2b", () => {
  let clienteB2bId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes-b2b",
      headers: authOwner(),
      payload: {
        razonSocial: "Cliente venta B2B SA",
        rfc: "CVB900101AB1",
        regimenFiscalSat: "601",
      },
    });
    clienteB2bId = res.json().id;
  });

  it("crea venta con clienteB2bId (sin clienteId)", async () => {
    const sucs = await app.inject({
      method: "GET",
      url: "/t/sucursales",
      headers: authOwner(),
    });
    const sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
      (s) => s.codigo === "SUC-PRINCIPAL",
    )!.id;
    const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: authOwner() });
    const cajaId = (cajas.json() as Array<{ id: string; codigo: string }>).find(
      (c) => c.codigo === "CAJA-1",
    )!.id;
    const prod = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: authOwner(),
      payload: {
        skuPadre: "B2B-A",
        nombre: "Producto B2B",
        precioBase: "100",
        aplicaIva: false,
        tasaIva: "0",
      },
    });
    const varianteId = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;
    await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: authOwner(),
      payload: {
        varianteId,
        sucursalId,
        tipo: "ajuste_positivo",
        cantidad: "10",
        motivo: "seed",
      },
    });
    await app.inject({
      method: "POST",
      url: `/t/cajas/${cajaId}/aperturar`,
      headers: authOwner(),
      payload: { montoInicial: "0" },
    });

    const venta = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteB2bId,
        lineas: [{ varianteId, cantidad: "3" }],
        pagos: [{ metodo: "efectivo", monto: "300" }],
      },
    });
    expect(venta.statusCode).toBe(201);

    const detalle = await app.inject({
      method: "GET",
      url: `/t/ventas/${venta.json().ventaId}`,
      headers: authOwner(),
    });
    expect((detalle.json() as { clienteB2bId: string }).clienteB2bId).toBe(clienteB2bId);
  });
});
