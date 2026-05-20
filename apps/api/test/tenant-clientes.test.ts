import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-clientes-1";
const OWNER_EMAIL = "owner-cli@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";
const CASHIER_EMAIL = "cajero-cli@test.local";
const CASHIER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let cashierToken: string;

function authOwner() {
  return { authorization: `Bearer ${ownerToken}` };
}
function authCashier() {
  return { authorization: `Bearer ${cashierToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Clientes");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner Cli",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CASHIER_EMAIL,
    password: CASHIER_PASSWORD,
    rolCodigo: "cajero",
    nombre: "Cajero Cli",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  cashierToken = (await loginTenantUser(app, TENANT_SLUG, CASHIER_EMAIL, CASHIER_PASSWORD))
    .accessToken;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("seed cliente Público en general", () => {
  it("GET /t/clientes/default devuelve el público con isDefault=true", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/clientes/default",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const cliente = res.json() as { isDefault: boolean; tipo: string };
    expect(cliente.isDefault).toBe(true);
    expect(cliente.tipo).toBe("publico_general");
  });

  it("listado incluye el público al inicio", async () => {
    const res = await app.inject({ method: "GET", url: "/t/clientes", headers: authOwner() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ isDefault: boolean }>; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items[0]?.isDefault).toBe(true);
  });

  it("público es read-only: PATCH bloqueado con 403", async () => {
    const def = await app.inject({
      method: "GET",
      url: "/t/clientes/default",
      headers: authOwner(),
    });
    const id = (def.json() as { id: string }).id;
    const res = await app.inject({
      method: "PATCH",
      url: `/t/clientes/${id}`,
      headers: authOwner(),
      payload: { nombre: "intento de cambio" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("público no se puede archivar (DELETE → 403)", async () => {
    const def = await app.inject({
      method: "GET",
      url: "/t/clientes/default",
      headers: authOwner(),
    });
    const id = (def.json() as { id: string }).id;
    const res = await app.inject({
      method: "DELETE",
      url: `/t/clientes/${id}`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("CRUD clientes B2C", () => {
  let clienteId: string;

  it("owner crea cliente con RFC válido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: authOwner(),
      payload: {
        nombre: "Juan",
        apellidos: "Pérez García",
        emailPrincipal: "juan@test.com",
        telefonoPrincipal: "3312345678",
        rfc: "peja850101qz4",
        regimenFiscalSat: "612",
        codigoPostalFiscal: "44100",
        usoCfdiDefault: "G03",
        permiteFiado: true,
        limiteFiado: "5000",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; rfc: string };
    clienteId = body.id;
    expect(body.rfc).toBe("PEJA850101QZ4");
  });

  it("rechaza RFC mal formado (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: authOwner(),
      payload: { nombre: "X", rfc: "invalido" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rechaza RFC duplicado (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: authOwner(),
      payload: { nombre: "Dup", rfc: "PEJA850101QZ4" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("búsqueda por nombre parcial encuentra al cliente", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/clientes?q=juan",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }>; total: number };
    expect(body.items.some((c) => c.id === clienteId)).toBe(true);
  });

  it("búsqueda por teléfono encuentra al cliente", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/clientes?q=33123",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });

  it("búsqueda por RFC encuentra al cliente", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/clientes?q=PEJA",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBeGreaterThanOrEqual(1);
  });

  it("cajero puede listar/leer clientes (POS)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/clientes",
      headers: authCashier(),
    });
    expect(res.statusCode).toBe(200);
  });

  it("cajero NO puede crear cliente (sin clientes.crear, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: authCashier(),
      payload: { nombre: "X" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("PATCH actualiza notas + activa fiado", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/clientes/${clienteId}`,
      headers: authOwner(),
      payload: { notas: "Cliente VIP", limiteFiado: "10000" },
    });
    expect(res.statusCode).toBe(200);
    expect(Number(res.json().limiteFiado)).toBe(10000);
  });
});

describe("sub-recursos: direcciones + teléfonos + etiquetas", () => {
  let clienteId: string;

  beforeAll(async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: authOwner(),
      payload: {
        nombre: "María",
        apellidos: "López",
        telefonoPrincipal: "5511122233",
      },
    });
    clienteId = res.json().id;
  });

  it("agrega 2 direcciones; solo la última is_default_envio queda como default", async () => {
    await app.inject({
      method: "POST",
      url: `/t/clientes/${clienteId}/direcciones`,
      headers: authOwner(),
      payload: {
        etiqueta: "Casa",
        calle: "Av. Juárez",
        numeroExterior: "100",
        codigoPostal: "44100",
        isDefaultEnvio: true,
      },
    });
    await app.inject({
      method: "POST",
      url: `/t/clientes/${clienteId}/direcciones`,
      headers: authOwner(),
      payload: {
        etiqueta: "Oficina",
        calle: "Av. Federalismo",
        codigoPostal: "44200",
        isDefaultEnvio: true,
      },
    });
    const detail = await app.inject({
      method: "GET",
      url: `/t/clientes/${clienteId}`,
      headers: authOwner(),
    });
    const direcciones = (
      detail.json() as { direcciones: Array<{ etiqueta: string; isDefaultEnvio: boolean }> }
    ).direcciones;
    expect(direcciones.filter((d) => d.isDefaultEnvio)).toHaveLength(1);
    expect(direcciones.find((d) => d.isDefaultEnvio)?.etiqueta).toBe("Oficina");
  });

  it("agrega teléfono con whatsapp y otro como principal swap", async () => {
    await app.inject({
      method: "POST",
      url: `/t/clientes/${clienteId}/telefonos`,
      headers: authOwner(),
      payload: { etiqueta: "Celular", telefono: "5599887766", whatsapp: true, esPrincipal: true },
    });
    await app.inject({
      method: "POST",
      url: `/t/clientes/${clienteId}/telefonos`,
      headers: authOwner(),
      payload: { etiqueta: "Trabajo", telefono: "5544332211", esPrincipal: true },
    });
    const detail = await app.inject({
      method: "GET",
      url: `/t/clientes/${clienteId}`,
      headers: authOwner(),
    });
    const tels = (
      detail.json() as { telefonos: Array<{ esPrincipal: boolean; whatsapp: boolean }> }
    ).telefonos;
    expect(tels.filter((t) => t.esPrincipal)).toHaveLength(1);
    expect(tels.some((t) => t.whatsapp)).toBe(true);
  });

  it("agrega y elimina etiquetas", async () => {
    const add = await app.inject({
      method: "POST",
      url: `/t/clientes/${clienteId}/etiquetas`,
      headers: authOwner(),
      payload: { etiqueta: "frecuente" },
    });
    expect(add.statusCode).toBe(201);

    const del = await app.inject({
      method: "DELETE",
      url: `/t/clientes/${clienteId}/etiquetas/frecuente`,
      headers: authOwner(),
    });
    expect(del.statusCode).toBe(204);
  });
});

describe("fiados — abonos y validación de límite en venta", () => {
  let clienteFiadoId: string;
  let sucursalId: string;
  let cajaId: string;
  let varianteId: string;

  beforeAll(async () => {
    const cli = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: authOwner(),
      payload: {
        nombre: "Don Memo",
        apellidos: "Abarrotero",
        telefonoPrincipal: "5500001111",
        permiteFiado: true,
        limiteFiado: "300",
      },
    });
    clienteFiadoId = cli.json().id;

    const sucs = await app.inject({
      method: "GET",
      url: "/t/sucursales",
      headers: authOwner(),
    });
    sucursalId = (sucs.json() as Array<{ id: string; codigo: string }>).find(
      (s) => s.codigo === "SUC-PRINCIPAL",
    )!.id;
    const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: authOwner() });
    cajaId = (cajas.json() as Array<{ id: string; codigo: string }>).find(
      (c) => c.codigo === "CAJA-1",
    )!.id;

    const prod = await app.inject({
      method: "POST",
      url: "/t/productos",
      headers: authOwner(),
      payload: {
        skuPadre: "FIA-A",
        nombre: "Producto fiado",
        precioBase: "100",
        aplicaIva: false,
        tasaIva: "0",
      },
    });
    varianteId = (prod.json() as { variantes: Array<{ id: string }> }).variantes[0]!.id;
    await app.inject({
      method: "POST",
      url: "/t/inventario/ajustes",
      headers: authOwner(),
      payload: {
        varianteId,
        sucursalId,
        tipo: "ajuste_positivo",
        cantidad: "20",
        motivo: "seed",
      },
    });
    await app.inject({
      method: "POST",
      url: `/t/cajas/${cajaId}/aperturar`,
      headers: authOwner(),
      payload: { montoInicial: "0" },
    });
  });

  it("GET /:id/fiado devuelve límite + usado + disponible", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/t/clientes/${clienteFiadoId}/fiado`,
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { limite: string; usado: string; disponible: string };
    expect(Number(body.limite)).toBe(300);
    expect(Number(body.usado)).toBe(0);
    expect(Number(body.disponible)).toBe(300);
  });

  it("venta con credito_fiado dentro del límite carga al fiado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteId: clienteFiadoId,
        lineas: [{ varianteId, cantidad: "2" }],
        pagos: [{ metodo: "credito_fiado", monto: "200" }],
      },
    });
    expect(res.statusCode).toBe(201);

    const fiado = await app.inject({
      method: "GET",
      url: `/t/clientes/${clienteFiadoId}/fiado`,
      headers: authOwner(),
    });
    expect(Number(fiado.json().usado)).toBe(200);
    expect(Number(fiado.json().disponible)).toBe(100);
  });

  it("venta a fiado que excede el límite → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteId: clienteFiadoId,
        lineas: [{ varianteId, cantidad: "2" }],
        pagos: [{ metodo: "credito_fiado", monto: "200" }],
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { message: string }).message).toMatch(/límite/i);
  });

  it("venta a fiado sin clienteId → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "credito_fiado", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("abono parcial reduce saldo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes/${clienteFiadoId}/fiado/abonar`,
      headers: authOwner(),
      payload: { monto: "50", metodoPago: "efectivo" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().saldoRestante).toBe("150");
    expect(res.json().estado).toBe("activo");
  });

  it("abono mayor al saldo → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes/${clienteFiadoId}/fiado/abonar`,
      headers: authOwner(),
      payload: { monto: "9999", metodoPago: "efectivo" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("abono total liquida el fiado", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/clientes/${clienteFiadoId}/fiado/abonar`,
      headers: authOwner(),
      payload: { monto: "150", metodoPago: "efectivo" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().saldoRestante).toBe("0");
    expect(res.json().estado).toBe("liquidado");
  });

  it("cliente sin permiteFiado rechaza venta a fiado → 409", async () => {
    const otro = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: authOwner(),
      payload: { nombre: "No fiado", permiteFiado: false, limiteFiado: "1000" },
    });
    const res = await app.inject({
      method: "POST",
      url: "/t/ventas",
      headers: authOwner(),
      payload: {
        sucursalId,
        cajaId,
        clienteId: otro.json().id,
        lineas: [{ varianteId, cantidad: "1" }],
        pagos: [{ metodo: "credito_fiado", monto: "100" }],
      },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { message: string }).message).toMatch(/no acepta/);
  });
});

describe("grupos de clientes", () => {
  it("owner crea grupo y luego asigna cliente a él", async () => {
    const grupo = await app.inject({
      method: "POST",
      url: "/t/clientes/grupos",
      headers: authOwner(),
      payload: {
        codigo: "MAYORISTA",
        nombre: "Mayoristas frecuentes",
        descuentoDefaultPct: 8,
      },
    });
    expect(grupo.statusCode).toBe(201);
    const grupoId = grupo.json().id as string;

    const cli = await app.inject({
      method: "POST",
      url: "/t/clientes",
      headers: authOwner(),
      payload: { nombre: "Carlos", clienteGrupoId: grupoId },
    });
    expect(cli.statusCode).toBe(201);
    expect(cli.json().clienteGrupoId).toBe(grupoId);
  });
});
