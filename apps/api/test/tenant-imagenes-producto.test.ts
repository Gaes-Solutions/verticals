import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT = "test-imagenes-producto";
let app: FastifyInstance;
let token: string;
let productoId: string;
let raiz: string;
const auth = () => ({ authorization: `Bearer ${token}` });
const db = () => getTenantClient(TENANT);

/** JPG mínimo válido: empieza con su firma, que es lo que el servidor verifica. */
const jpg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("JFIF-prueba-de-foto-de-producto"),
]);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("PNG-prueba"),
]);

const subir = (cuerpo: Buffer, tipo = "image/jpeg", id = productoId) =>
  app.inject({
    method: "POST",
    url: `/t/productos/${id}/imagenes`,
    headers: { ...auth(), "content-type": tipo },
    payload: cuerpo,
  });

beforeAll(async () => {
  raiz = await mkdtemp(join(tmpdir(), "gaespos-fotos-"));
  process.env.PRODUCTOS_MEDIA_ROOT = raiz;
  app = await buildTestApp();
  await createTestTenant(TENANT);
  const email = "fotos@test.local";
  await createTenantUser(TENANT, { email, password: "ChangeMe!2026", rolCodigo: "dueno" });
  token = (await loginTenantUser(app, TENANT, email, "ChangeMe!2026")).accessToken;
  const producto = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: { skuPadre: "FOTO-1", nombre: "Globo con foto", precioBase: "50" },
  });
  expect(producto.statusCode, producto.body).toBe(201);
  productoId = producto.json().id;
});

afterAll(async () => {
  await app?.close();
  await rm(raiz, { recursive: true, force: true });
  Reflect.deleteProperty(process.env, "PRODUCTOS_MEDIA_ROOT");
});

describe("fotos de producto", () => {
  it("guarda la foto y la sirve pública para la tienda", async () => {
    const res = await subir(jpg);
    expect(res.statusCode, res.body).toBe(201);
    const { id, cdnUrl } = res.json() as { id: string; cdnUrl: string };
    expect(cdnUrl).toBe(`/tienda/imagenes/${id}`);

    const publica = await app.inject({ url: `/t/tienda/imagenes/${id}`, headers: auth() });
    expect(publica.statusCode).toBe(200);
    expect(publica.headers["content-type"]).toContain("image/jpeg");
    expect(publica.headers["cache-control"]).toContain("immutable");
    expect(publica.rawPayload.equals(jpg)).toBe(true);
  });

  it("ordena las fotos como se suben y las lista para el panel", async () => {
    await subir(png, "image/png");
    const lista = await app.inject({ url: `/t/productos/${productoId}/imagenes`, headers: auth() });
    expect(lista.statusCode).toBe(200);
    const fotos = lista.json() as Array<{ orden: number }>;
    expect(fotos.length).toBeGreaterThanOrEqual(2);
    expect(fotos.map((f) => f.orden)).toEqual([...fotos.map((f) => f.orden)].sort((a, b) => a - b));
  });

  it("rechaza un archivo que dice ser imagen pero no lo es", async () => {
    const res = await subir(Buffer.from("esto no es una imagen"), "image/jpeg");
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toContain("no es una imagen");
  });

  it("no acepta formatos que pueden ejecutar scripts", async () => {
    const res = await subir(Buffer.from("<svg onload=alert(1)>"), "image/svg+xml");
    expect(res.statusCode).toBe(415);
  });

  it("no acepta una foto sin sesión", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/productos/${productoId}/imagenes`,
      headers: { "content-type": "image/jpeg" },
      payload: jpg,
    });
    expect(res.statusCode).toBe(401);
  });

  it("la tienda muestra las fotos del producto publicado y se actualizan al borrar", async () => {
    await app.inject({
      method: "POST",
      url: "/t/ecommerce/productos-publicados/lote",
      headers: auth(),
      payload: { limite: 100 },
    });
    const publicado = await db().productoPublicado.findUniqueOrThrow({ where: { productoId } });
    expect((publicado.fotosArray as string[]).length).toBeGreaterThanOrEqual(2);

    const [primera] = await db().productoImagen.findMany({
      where: { productoId },
      orderBy: { orden: "asc" },
    });
    const borrada = await app.inject({
      method: "DELETE",
      url: `/t/productos/imagenes/${primera?.id}`,
      headers: auth(),
    });
    expect(borrada.statusCode).toBe(204);

    const despues = await db().productoPublicado.findUniqueOrThrow({ where: { productoId } });
    expect(despues.fotosArray as string[]).not.toContain(primera?.cdnUrl);
    expect(
      (await app.inject({ url: `/t/tienda/imagenes/${primera?.id}`, headers: auth() })).statusCode,
    ).toBe(404);
  });

  it("no guarda fotos de un producto que no existe", async () => {
    const res = await subir(jpg, "image/jpeg", "no-existe");
    expect(res.statusCode).toBe(404);
  });
});
