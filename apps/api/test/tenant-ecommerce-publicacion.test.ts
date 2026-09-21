import { getTenantClient } from "@gaespos/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const slug = "test-publicacion-lote";
let app: Awaited<ReturnType<typeof buildTestApp>>;
let token: string;
let sucursalId: string;
let categoriaFiestaId: string;
const db = () => getTenantClient(slug);
const auth = () => ({ authorization: `Bearer ${token}` });

async function crearProducto(nombre: string, sku: string, categoriaId?: string, stock = 0) {
  const producto = await db().producto.create({
    data: {
      skuPadre: sku,
      nombre,
      aplicaIva: false,
      tasaIva: 0,
      ...(categoriaId ? { categoriaId } : {}),
      variantes: { create: { sku, precioBase: 10, isDefault: true } },
    },
    include: { variantes: true },
  });
  const variante = producto.variantes[0];
  if (!variante) throw new Error("variante");
  await db().inventarioSucursal.create({
    data: { varianteId: variante.id, sucursalId, stockActual: stock },
  });
  return producto;
}

const lote = (payload: Record<string, unknown> = {}) =>
  app.inject({
    method: "POST",
    url: "/t/ecommerce/productos-publicados/lote",
    headers: auth(),
    payload,
  });

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(slug);
  await createTenantUser(slug, {
    email: "tienda@test.local",
    password: "ChangeMe!2026",
    rolCodigo: "dueno",
  });
  token = (await loginTenantUser(app, slug, "tienda@test.local", "ChangeMe!2026")).accessToken;
  sucursalId = (await db().sucursal.findFirstOrThrow()).id;
  categoriaFiestaId = (await db().categoria.create({ data: { nombre: "Fiesta", slug: "fiesta" } }))
    .id;
  const otra = await db().categoria.create({ data: { nombre: "Papelería", slug: "papeleria" } });
  await crearProducto("Globo metálico", "GLOBO-1", categoriaFiestaId, 5);
  await crearProducto("Globo metálico", "GLOBO-2", categoriaFiestaId, 3);
  await crearProducto("Cuaderno profesional", "CUAD-1", otra.id, 0);
});

afterAll(async () => {
  await app?.close();
});

describe("publicación del catálogo por lotes", () => {
  it("publica todo el catálogo y da direcciones distintas a los nombres repetidos", async () => {
    const res = await lote({ limite: 500 });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ procesados: 3, restantes: 0 });

    const publicados = await db().productoPublicado.findMany({
      select: { slugSeo: true, tituloPublico: true, isPublicado: true },
    });
    expect(publicados).toHaveLength(3);
    expect(publicados.every((p) => p.isPublicado)).toBe(true);
    expect(new Set(publicados.map((p) => p.slugSeo)).size).toBe(3);
    expect(publicados.map((p) => p.slugSeo).sort()).toEqual([
      "cuaderno-profesional",
      "globo-metalico",
      "globo-metalico-globo-2",
    ]);
  });

  it("repetir el lote no vuelve a publicar ni cambia las direcciones", async () => {
    const antes = await db().productoPublicado.findMany({ select: { slugSeo: true } });
    expect((await lote({ limite: 500 })).json()).toEqual({ procesados: 0, restantes: 0 });
    expect(await db().productoPublicado.findMany({ select: { slugSeo: true } })).toEqual(antes);
  });

  it("quita el catálogo de la tienda y lo vuelve a publicar sin perder la dirección", async () => {
    const antes = await db().productoPublicado.findFirstOrThrow({
      where: { tituloPublico: "Cuaderno profesional" },
      select: { slugSeo: true },
    });
    expect((await lote({ publicar: false, limite: 500 })).json()).toEqual({
      procesados: 3,
      restantes: 0,
    });
    expect(await db().productoPublicado.count({ where: { isPublicado: true } })).toBe(0);

    expect((await lote({ limite: 500 })).json()).toEqual({ procesados: 3, restantes: 0 });
    expect(await db().productoPublicado.count({ where: { isPublicado: true } })).toBe(3);
    const despues = await db().productoPublicado.findFirstOrThrow({
      where: { tituloPublico: "Cuaderno profesional" },
      select: { slugSeo: true },
    });
    expect(despues.slugSeo).toBe(antes.slugSeo);
  });

  it("publica solo un departamento y solo lo que tiene existencia", async () => {
    await lote({ publicar: false, limite: 500 });
    expect((await lote({ categoriaIds: [categoriaFiestaId], limite: 500 })).json()).toEqual({
      procesados: 2,
      restantes: 0,
    });
    expect(await db().productoPublicado.count({ where: { isPublicado: true } })).toBe(2);

    await lote({ publicar: false, limite: 500 });
    expect((await lote({ soloConStock: true, limite: 500 })).json()).toEqual({
      procesados: 2,
      restantes: 0,
    });
    const conStock = await db().productoPublicado.findMany({
      where: { isPublicado: true },
      select: { tituloPublico: true },
    });
    expect(conStock.every((p) => p.tituloPublico === "Globo metálico")).toBe(true);
  });

  it("entrega un texto base de políticas con los datos del negocio y lo publica en la tienda", async () => {
    await db().cfdiConfig.create({
      data: {
        rfcEmisor: "XAXX010101000",
        razonSocialEmisor: "Globos de Fiesta SA de CV",
        regimenFiscalSat: "601",
        codigoPostalEmisor: "58000",
        lugarExpedicion: "58000",
        facturamaApiKey: "test",
        correoEmisor: "hola@globosdefiesta.mx",
      },
    });

    const creada = await app.inject({
      method: "PUT",
      url: "/t/ecommerce/config",
      headers: auth(),
      payload: { activa: false, subdominio: "globos-de-fiesta", nombre: "Globos de Fiesta" },
    });
    expect([200, 201]).toContain(creada.statusCode);

    const config = await app.inject({ url: "/t/ecommerce/config", headers: auth() });
    expect(config.statusCode, config.body).toBe(200);
    const sugeridas = config.json().politicasSugeridas as Record<string, string>;
    expect(Object.keys(sugeridas).sort()).toEqual([
      "devoluciones",
      "envios",
      "privacidad",
      "terminos",
    ]);
    expect(sugeridas.privacidad).toContain("Globos de Fiesta SA de CV");
    expect(sugeridas.privacidad).toContain("hola@globosdefiesta.mx");
    expect(sugeridas.privacidad).toContain("ARCO");

    const publica = await app.inject({ url: "/t/tienda/config-publica", headers: auth() });
    expect(publica.statusCode, publica.body).toBe(200);
    const enTienda = publica.json().politicasHtml as Record<string, string>;
    expect(enTienda.privacidad).toBe(sugeridas.privacidad);
    expect(enTienda.terminos).toContain("PROFECO");
  });

  it("lo que escribe el dueño gana sobre el texto base", async () => {
    await app.inject({
      method: "PUT",
      url: "/t/ecommerce/config",
      headers: auth(),
      payload: {
        activa: false,
        subdominio: "globos-de-fiesta",
        nombre: "Globos de Fiesta",
        politicasHtml: { privacidad: "Mi propio aviso de privacidad." },
      },
    });
    const publica = await app.inject({ url: "/t/tienda/config-publica", headers: auth() });
    const enTienda = publica.json().politicasHtml as Record<string, string>;
    expect(enTienda.privacidad).toBe("Mi propio aviso de privacidad.");
    expect(enTienda.envios).toContain("República Mexicana");
  });

  it("avisa cuántos faltan cuando el lote se queda corto", async () => {
    await lote({ publicar: false, limite: 500 });
    expect((await lote({ limite: 2 })).json()).toEqual({ procesados: 2, restantes: 1 });
    expect((await lote({ limite: 2 })).json()).toEqual({ procesados: 1, restantes: 0 });
  });
});
