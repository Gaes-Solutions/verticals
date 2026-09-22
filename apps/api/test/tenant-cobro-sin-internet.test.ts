import { getTenantClient } from "@gaespos/db";
import { type CatalogoLocal, calcularVentaLocal } from "@gaespos/pricing";
import type { CatalogManifest, CatalogPage } from "@gaespos/sync";
import { InMemoryStorage, cobrarSinInternet } from "@gaespos/sync-client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

/**
 * Recorrido completo del cobro sin internet: la caja calcula con su catálogo,
 * cobra en efectivo, guarda la venta en su cola y al reconectar el servidor la
 * acepta tal como se cobró. Si algo de esto se desalinea, el cajero cobraría un
 * importe que el servidor luego rechaza.
 */
const TENANT = "test-cobro-sin-internet";
let app: FastifyInstance;
let token: string;
let usuarioId: string;
let sucursalId: string;
let cajaId: string;
let aperturaId: string;
let varianteId: string;
const auth = () => ({ authorization: `Bearer ${token}` });
const db = () => getTenantClient(TENANT);

async function catalogoDelEquipo(): Promise<CatalogoLocal> {
  const creado = await app.inject({ method: "POST", url: "/t/sync/catalog", headers: auth() });
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

/** Lo que hace la caja cuando no hay internet: calcular, cobrar y encolar. */
async function cobrarEnLaCaja(cantidad: string, efectivo: string) {
  const lineas = [{ varianteId, cantidad }];
  const calculo = calcularVentaLocal(await catalogoDelEquipo(), {
    lineas,
    sucursalId,
    usuarioId,
  });
  const storage = new InMemoryStorage();
  await cobrarSinInternet(storage, {
    sucursalId,
    cajaId,
    aperturaId,
    lineas,
    pagos: [{ metodo: "efectivo", monto: efectivo }],
    total: calculo.total,
    comprobante: calculo.lineas,
  });
  const [pendiente] = await storage.getPending(10);
  if (!pendiente) throw new Error("la venta no quedó en la cola");
  return { calculo, operacion: pendiente.operation };
}

const sincronizar = (ops: unknown[]) =>
  app.inject({
    method: "POST",
    url: "/t/sync/push",
    headers: auth(),
    payload: { operations: ops },
  });

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT);
  const email = "offline@test.local";
  await createTenantUser(TENANT, { email, password: "ChangeMe!2026", rolCodigo: "dueno" });
  const sesion = await loginTenantUser(app, TENANT, email, "ChangeMe!2026");
  token = sesion.accessToken;
  usuarioId = sesion.userId;
  sucursalId = (await db().sucursal.findFirstOrThrow()).id;
  const cajas = await app.inject({ method: "GET", url: "/t/cajas", headers: auth() });
  cajaId = (cajas.json() as Array<{ id: string }>)[0]?.id ?? "";
  await app.inject({
    method: "POST",
    url: `/t/cajas/${cajaId}/aperturar`,
    headers: auth(),
    payload: { montoInicial: "100" },
  });
  aperturaId = (await db().cajaApertura.findFirstOrThrow({ where: { cajaId, estado: "abierta" } }))
    .id;

  const producto = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: {
      skuPadre: "OFF-1",
      nombre: "Globo sin internet",
      precioBase: "125.50",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  expect(producto.statusCode, producto.body).toBe(201);
  varianteId = producto.json().variantes[0].id;
  const ajuste = await app.inject({
    method: "POST",
    url: "/t/inventario/ajustes",
    headers: auth(),
    payload: {
      varianteId,
      sucursalId,
      tipo: "ajuste_positivo",
      cantidad: "100",
      motivo: "Inicial",
    },
  });
  expect(ajuste.statusCode).toBe(201);
});

afterAll(async () => {
  if (app) await app.close();
});

describe("cobro sin internet de punta a punta", () => {
  it("el servidor acepta la venta con el importe que cobró la caja", async () => {
    const { calculo, operacion } = await cobrarEnLaCaja("3", "400.00");
    const ventasAntes = await db().venta.count();

    const res = await sincronizar([operacion]);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().results[0]).toMatchObject({ status: "applied" });

    const ventaId = res.json().results[0].entityIdRemoto as string;
    const venta = await db().venta.findUniqueOrThrow({
      where: { id: ventaId },
      include: { lineas: true, pagos: true },
    });
    expect(venta.total.toString()).toBe(calculo.total);
    expect(venta.lineas).toHaveLength(1);
    expect(venta.lineas[0]?.totalLinea.toString()).toBe(calculo.lineas[0]?.totalLinea);
    expect(venta.pagos[0]?.metodo).toBe("efectivo");
    expect(await db().venta.count()).toBe(ventasAntes + 1);
  });

  it("reenviar la misma venta no cobra dos veces", async () => {
    const { operacion } = await cobrarEnLaCaja("1", "200.00");
    const primera = await sincronizar([operacion]);
    expect(primera.json().results[0].status).toBe("applied");
    const ventas = await db().venta.count();

    const reenvio = await sincronizar([operacion]);
    expect(reenvio.json().results[0].status).toBe("deduped");
    expect(reenvio.json().results[0].entityIdRemoto).toBe(primera.json().results[0].entityIdRemoto);
    expect(await db().venta.count()).toBe(ventas);
  });

  it("si el precio cambió mientras no había internet, la venta queda para revisión", async () => {
    const { operacion } = await cobrarEnLaCaja("2", "300.00");
    const original = await db().productoVariante.findUniqueOrThrow({ where: { id: varianteId } });
    const ventas = await db().venta.count();
    try {
      await db().productoVariante.update({
        where: { id: varianteId },
        data: { precioBase: "140.00" },
      });
      const res = await sincronizar([operacion]);
      expect(res.json().results[0].status).toBe("failed");
      expect(await db().venta.count()).toBe(ventas);
    } finally {
      await db().productoVariante.update({
        where: { id: varianteId },
        data: { precioBase: original.precioBase },
      });
    }
  });

  it("una venta cobrada en un turno cerrado no entra al turno nuevo", async () => {
    const { operacion } = await cobrarEnLaCaja("1", "150.00");
    const ventas = await db().venta.count();
    await db().cajaApertura.update({
      where: { id: aperturaId },
      data: { estado: "cerrada", cerradaAt: new Date() },
    });
    try {
      const res = await sincronizar([operacion]);
      expect(res.json().results[0].status).toBe("failed");
      expect(await db().venta.count()).toBe(ventas);
    } finally {
      await db().cajaApertura.update({
        where: { id: aperturaId },
        data: { estado: "abierta", cerradaAt: null },
      });
    }
  });
});
