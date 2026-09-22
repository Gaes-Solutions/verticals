import { getTenantClient } from "@gaespos/db";
import { type CatalogoLocal, calcularVentaLocal } from "@gaespos/pricing";
import type { CatalogManifest, CatalogPage } from "@gaespos/sync";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

/**
 * La caja sin internet cobra con lo que calcula en el equipo. Si ese importe no
 * coincide al centavo con el del servidor, la venta se quedaría para revisión al
 * sincronizar (o peor, se cobraría distinto de lo facturado). Esta prueba compara
 * los dos cálculos sobre el mismo catálogo descargado.
 */
const TENANT = "test-paridad-local";
let app: FastifyInstance;
let token: string;
let userId: string;
let sucursalId: string;
let ivaId = "";
let iepsId = "";
let mayoreoId = "";
const auth = () => ({ authorization: `Bearer ${token}` });
const db = () => getTenantClient(TENANT);

async function crearProducto(
  sku: string,
  nombre: string,
  precio: string,
  extra: Record<string, unknown> = {},
) {
  const res = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: { skuPadre: sku, nombre, precioBase: precio, ...extra },
  });
  expect(res.statusCode, res.body).toBe(201);
  const varianteId = res.json().variantes[0].id as string;
  const ajuste = await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(),
    payload: {
      varianteId,
      sucursalId,
      tipo: "ajuste_positivo",
      cantidad: "500",
      motivo: "Inicial",
    },
  });
  expect(ajuste.statusCode, ajuste.body).toBe(201);
  return varianteId;
}

/** Arma el catálogo del equipo con las mismas páginas que bajaría la caja. */
async function catalogoDelEquipo(): Promise<CatalogoLocal> {
  const creado = await app.inject({
    method: "POST",
    url: "/t/sync/catalog",
    headers: auth(),
  });
  expect(creado.statusCode, creado.body).toBe(200);
  const manifest = creado.json<CatalogManifest>();
  const filas = new Map<string, Record<string, unknown>[]>();
  for (let i = 0; i < manifest.pageCount; i++) {
    const page = await app.inject({
      method: "GET",
      url: `/t/sync/catalog/${manifest.id}/${i}`,
      headers: auth(),
    });
    expect(page.statusCode).toBe(200);
    const { entityType, rows } = page.json<CatalogPage>();
    filas.set(entityType, [...(filas.get(entityType) ?? []), ...rows]);
  }
  const de = (tipo: string) => (filas.get(tipo) ?? []) as never[];
  return {
    productos: de("producto"),
    variantes: de("variante"),
    listas: de("lista_precio"),
    itemsLista: de("lista_precio_item"),
    escalonados: de("precio_escalonado"),
    reglas: de("regla_precio"),
    promociones: de("promocion"),
  };
}

async function totalDelServidor(
  lineas: Array<{ varianteId: string; cantidad: string }>,
  listaPrecioCodigo?: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/t/ventas/preview",
    headers: auth(),
    payload: {
      sucursalId,
      canal: "pos",
      lineas,
      ...(listaPrecioCodigo ? { listaPrecioCodigo } : {}),
    },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json() as {
    total: string;
    ivaTotal: string;
    iepsTotal: string;
    lineas: Array<Record<string, string>>;
  };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT);
  const email = "paridad@test.local";
  await createTenantUser(TENANT, { email, password: "ChangeMe!2026", rolCodigo: "dueno" });
  const sesion = await loginTenantUser(app, TENANT, email, "ChangeMe!2026");
  token = sesion.accessToken;
  userId = sesion.userId;
  sucursalId = (await db().sucursal.findFirstOrThrow()).id;

  ivaId = await crearProducto("PAR-IVA", "Globo con IVA", "125.50", {
    aplicaIva: true,
    tasaIva: "16",
  });
  iepsId = await crearProducto("PAR-IEPS", "Refresco con IEPS", "32.00", {
    aplicaIva: true,
    tasaIva: "16",
    aplicaIeps: true,
    tasaIeps: { tipo: "cuota_por_unidad", valor: 1.5375 },
  });
  mayoreoId = await crearProducto("PAR-MAY", "Bolsa mayoreo", "90.00", {
    aplicaIva: true,
    tasaIva: "16",
  });

  const lista = await db().listaPrecio.create({
    data: {
      codigo: "PARIDAD-MAY",
      nombre: "Mayoreo paridad",
      tipo: "mayoreo_nivel",
      isActive: true,
    },
  });
  await db().listaPrecioItem.create({
    data: { listaPrecioId: lista.id, varianteId: mayoreoId, precio: "72.30" },
  });
  await db().productoPrecioEscalonado.create({
    data: { varianteId: ivaId, nivel: 1, cantidadMinima: "6", precioUnitario: "111.11" },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

describe("la caja calcula igual que el servidor", () => {
  it("un artículo con IVA da el mismo total y el mismo desglose", async () => {
    const lineas = [{ varianteId: ivaId, cantidad: "3" }];
    const servidor = await totalDelServidor(lineas);
    const local = calcularVentaLocal(await catalogoDelEquipo(), {
      lineas,
      sucursalId,
      usuarioId: userId,
    });

    expect(local.total).toBe(servidor.total);
    expect(local.ivaTotal).toBe(servidor.ivaTotal);
    expect(local.lineas).toEqual(servidor.lineas);
  });

  it("con IEPS por cuota el desglose coincide al centavo", async () => {
    const lineas = [{ varianteId: iepsId, cantidad: "4" }];
    const servidor = await totalDelServidor(lineas);
    const local = calcularVentaLocal(await catalogoDelEquipo(), {
      lineas,
      sucursalId,
      usuarioId: userId,
    });

    expect(local.total).toBe(servidor.total);
    expect(local.iepsTotal).toBe(servidor.iepsTotal);
    expect(local.ivaTotal).toBe(servidor.ivaTotal);
    expect(local.lineas).toEqual(servidor.lineas);
  });

  it("respeta el precio escalonado por cantidad", async () => {
    const lineas = [{ varianteId: ivaId, cantidad: "10" }];
    const servidor = await totalDelServidor(lineas);
    const local = calcularVentaLocal(await catalogoDelEquipo(), {
      lineas,
      sucursalId,
      usuarioId: userId,
    });

    expect(local.lineas[0]?.precioUnitario).toBe("111.11");
    expect(local.total).toBe(servidor.total);
    expect(local.lineas).toEqual(servidor.lineas);
  });

  it("cobra el precio de mayoreo cuando el cajero elige esa lista", async () => {
    const lineas = [{ varianteId: mayoreoId, cantidad: "2" }];
    const servidor = await totalDelServidor(lineas, "PARIDAD-MAY");
    const local = calcularVentaLocal(await catalogoDelEquipo(), {
      lineas,
      sucursalId,
      usuarioId: userId,
      listaPrecioCodigo: "PARIDAD-MAY",
    });

    expect(local.lineas[0]?.precioUnitario).toBe("72.3");
    expect(local.total).toBe(servidor.total);
    expect(local.lineas).toEqual(servidor.lineas);
  });

  it("un ticket con los tres artículos juntos coincide en todo", async () => {
    const lineas = [
      { varianteId: ivaId, cantidad: "7" },
      { varianteId: iepsId, cantidad: "2" },
      { varianteId: mayoreoId, cantidad: "1" },
    ];
    const servidor = await totalDelServidor(lineas);
    const local = calcularVentaLocal(await catalogoDelEquipo(), {
      lineas,
      sucursalId,
      usuarioId: userId,
    });

    expect(local.total).toBe(servidor.total);
    expect(local.ivaTotal).toBe(servidor.ivaTotal);
    expect(local.iepsTotal).toBe(servidor.iepsTotal);
    expect(local.lineas).toEqual(servidor.lineas);
  });

  it("avisa cuando el artículo no está en el catálogo del equipo", async () => {
    const catalogo = await catalogoDelEquipo();
    expect(() =>
      calcularVentaLocal(catalogo, {
        lineas: [{ varianteId: "no-existe", cantidad: "1" }],
        sucursalId,
        usuarioId: userId,
      }),
    ).toThrow("no está en el catálogo");
  });
});
