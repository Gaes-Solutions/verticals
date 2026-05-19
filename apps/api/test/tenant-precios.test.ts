import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-precios-1";
const OWNER_EMAIL = "owner-prec@test.local";
const OWNER_PASSWORD = "ChangeMe!2026";

let app: FastifyInstance;
let ownerToken: string;
let varianteId: string;
let categoriaId: string;
let listaPublicoId: string;

function authOwner(): { authorization: string } {
  return { authorization: `Bearer ${ownerToken}` };
}

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT_SLUG, "Tenant Precios");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    rolCodigo: "dueno",
    nombre: "Owner Precios",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  const cat = await app.inject({
    method: "POST",
    url: "/t/categorias",
    headers: authOwner(),
    payload: { nombre: "Cervezas", slug: "cervezas" },
  });
  categoriaId = cat.json().id;

  const prod = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: authOwner(),
    payload: {
      skuPadre: "CERV-355",
      nombre: "Cerveza 355ml",
      precioBase: "20",
      categoriaId,
    },
  });
  const prodBody = prod.json() as { variantes: Array<{ id: string }> };
  const variante = prodBody.variantes[0];
  if (!variante) throw new Error("variante missing");
  varianteId = variante.id;

  const listas = await app.inject({
    method: "GET",
    url: "/t/precios/listas",
    headers: authOwner(),
  });
  const items = listas.json() as Array<{ id: string; codigo: string }>;
  const publico = items.find((l) => l.codigo === "PUBLICO");
  if (!publico) throw new Error("Lista PUBLICO debe sembrarse en seedTenantDefaults");
  listaPublicoId = publico.id;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("/t/precios/listas — listas de precios", () => {
  it("seed sembró lista PUBLICO con isDefault=true", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/precios/listas",
      headers: authOwner(),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as Array<{ codigo: string; isDefault: boolean }>;
    const publico = items.find((l) => l.codigo === "PUBLICO");
    expect(publico?.isDefault).toBe(true);
  });

  it("PUT /listas/:id/items upsertea precio para variante", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/t/precios/listas/${listaPublicoId}/items`,
      headers: authOwner(),
      payload: { varianteId, precio: "18.50", incluyeIva: true },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().precio).toBe("18.5");
  });

  it("crea segunda lista MAYORISTA", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/listas",
      headers: authOwner(),
      payload: { codigo: "MAYORISTA", nombre: "Mayorista" },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("/t/precios/escalonados RF-02", () => {
  it("crea tier escalonado 6+ a precio reducido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/escalonados",
      headers: authOwner(),
      payload: {
        varianteId,
        nivel: 1,
        cantidadMinima: "6",
        cantidadMaxima: null,
        precioUnitario: "17",
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("/t/precios/reglas — motor de promociones", () => {
  let reglaCatId: string;

  it("crea regla descuento por categoría 10%", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/reglas",
      headers: authOwner(),
      payload: {
        codigo: "PROMO-CERV-10",
        nombre: "10% cervezas",
        tipo: "descuento_categoria",
        prioridad: 10,
        stackable: false,
        excluyeProductosConEscalonado: true,
        accion: { tipo: "porcentaje", valor: "10" },
        categoriasIds: [categoriaId],
      },
    });
    expect(res.statusCode).toBe(201);
    reglaCatId = res.json().id;
  });

  it("PATCH desactiva la regla", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/t/precios/reglas/${reglaCatId}`,
      headers: authOwner(),
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().isActive).toBe(false);
  });

  it("rechaza regla con código duplicado (409)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/reglas",
      headers: authOwner(),
      payload: {
        codigo: "PROMO-CERV-10",
        nombre: "Dup",
        tipo: "descuento_producto",
        accion: { tipo: "porcentaje", valor: "5" },
      },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("/t/precios/cupones", () => {
  it("crea cupón porcentaje SAVE10", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/cupones",
      headers: authOwner(),
      payload: {
        codigo: "SAVE10",
        nombre: "10% en compra",
        tipo: "porcentaje",
        valor: "10",
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe("/t/precios/preview — motor cascada end-to-end", () => {
  it("preview con 2 unidades usa precio base 20 (sin lista ni escalonado matched)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/preview",
      headers: authOwner(),
      payload: { lineas: [{ varianteId, cantidad: "2" }] },
    });
    expect(res.statusCode).toBe(200);
    const ticket = res.json() as {
      subtotal: string;
      total: string;
      lineas: Array<{ precioUnitario: string; subtotal: string }>;
    };
    expect(ticket.lineas[0]?.precioUnitario).toBe("20");
    expect(ticket.subtotal).toBe("40");
    expect(ticket.total).toBe("40");
  });

  it("preview con lista PUBLICO usa precio 18.5", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/preview",
      headers: authOwner(),
      payload: {
        lineas: [{ varianteId, cantidad: "2" }],
        listaPrecioCodigo: "PUBLICO",
      },
    });
    expect(res.statusCode).toBe(200);
    const ticket = res.json() as { total: string; lineas: Array<{ precioUnitario: string }> };
    expect(ticket.lineas[0]?.precioUnitario).toBe("18.5");
    expect(ticket.total).toBe("37");
  });

  it("preview con 6+ unidades aplica escalonado 17 (overrides lista)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/preview",
      headers: authOwner(),
      payload: {
        lineas: [{ varianteId, cantidad: "6" }],
        listaPrecioCodigo: "PUBLICO",
      },
    });
    expect(res.statusCode).toBe(200);
    const ticket = res.json() as { total: string; lineas: Array<{ precioUnitario: string }> };
    expect(ticket.lineas[0]?.precioUnitario).toBe("17");
    expect(ticket.total).toBe("102");
  });

  it("preview con cupón SAVE10 aplica 10% al total", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/preview",
      headers: authOwner(),
      payload: {
        lineas: [{ varianteId, cantidad: "2" }],
        cuponCodigo: "SAVE10",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe("36");
  });

  it("preview con cupón inexistente retorna 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/preview",
      headers: authOwner(),
      payload: {
        lineas: [{ varianteId, cantidad: "1" }],
        cuponCodigo: "NO-EXISTE",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("preview con descuento global del cajero 5%", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/preview",
      headers: authOwner(),
      payload: {
        lineas: [{ varianteId, cantidad: "1" }],
        descuentoGlobalPct: "5",
        descuentoGlobalMotivo: "Cliente leal",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe("19");
  });

  it("preview con varianteId inexistente retorna 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/precios/preview",
      headers: authOwner(),
      payload: { lineas: [{ varianteId: "no-existe-var", cantidad: "1" }] },
    });
    expect(res.statusCode).toBe(404);
  });
});
