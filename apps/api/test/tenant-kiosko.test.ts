import { getTenantClient, masterPrisma } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT = "test-kiosko-security";
const OTHER = "test-kiosko-other";
let app: FastifyInstance;
let ownerToken: string;
let restrictedToken: string;
let branchId: string;
let otherBranchId: string;
let deviceToken: string;
let productId: string;
let variantId: string;
const auth = (token = ownerToken) => ({ authorization: `Bearer ${token}` });
const deviceGet = (url: string, token = deviceToken) =>
  app.inject({ method: "GET", url: `/kiosko${url}`, headers: auth(token) });

beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT);
  await createTestTenant(OTHER);
  for (const role of ["dueno", "cajero"]) {
    const email = `${role}-kiosko@test.local`;
    await createTenantUser(TENANT, { email, password: "ChangeMe!2026", rolCodigo: role });
    const session = await loginTenantUser(app, TENANT, email, "ChangeMe!2026");
    if (role === "dueno") ownerToken = session.accessToken;
    else restrictedToken = session.accessToken;
  }
  branchId = (await getTenantClient(TENANT).sucursal.findFirstOrThrow()).id;
  otherBranchId = (await getTenantClient(OTHER).sucursal.findFirstOrThrow()).id;
  const device = await app.inject({
    method: "POST",
    url: "/t/kioskos",
    headers: auth(),
    payload: { nombre: "Entrada", sucursalId: branchId },
  });
  expect(device.statusCode).toBe(201);
  deviceToken = device.json().token;
  const product = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: auth(),
    payload: {
      skuPadre: "KIOSKO",
      nombre: "Producto kiosko",
      precioBase: "100",
      aplicaIva: true,
      tasaIva: "16",
    },
  });
  expect(product.statusCode).toBe(201);
  productId = product.json().id;
  variantId = product.json().variantes[0].id;
  await getTenantClient(TENANT).productoCodigoBarras.create({
    data: { varianteId: variantId, codigo: "7501234567890" },
  });
});

afterAll(async () => {
  if (app) await app.close();
});

describe("kiosko: seguridad, configuración y precio público", () => {
  it("rechaza credenciales ausentes, malformadas, inexistentes y sustitución del tenant", async () => {
    const missing = await app.inject({ method: "GET", url: "/kiosko/config" });
    expect(missing.statusCode).toBe(401);
    const secret = deviceToken.split(".")[1];
    for (const token of [
      "incorrecto",
      `${TENANT}.${"x".repeat(32)}`,
      `test-no-existe.${secret}`,
      `${OTHER}.${secret}`,
      ownerToken,
    ]) {
      expect((await deviceGet("/config", token)).statusCode).toBe(401);
    }
  });

  it("rechaza alta en sucursal ajena, inexistente o inactiva", async () => {
    const prisma = getTenantClient(TENANT);
    const inactive = await prisma.sucursal.create({
      data: { codigo: "INACTIVA", nombre: "Inactiva", isActive: false },
    });
    for (const sucursalId of [otherBranchId, "missing", inactive.id]) {
      const response = await app.inject({
        method: "POST",
        url: "/t/kioskos",
        headers: auth(),
        payload: { nombre: "No válido", sucursalId },
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it("protege administración contra cajeros y dispositivos y no expone hashes", async () => {
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/t/kioskos/config",
          headers: auth(restrictedToken),
          payload: { precioSegundos: 10 },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "GET", url: "/t/kioskos", headers: auth(deviceToken) }))
        .statusCode,
    ).toBe(401);
    const listed = await app.inject({ method: "GET", url: "/t/kioskos", headers: auth() });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain("tokenHash");
    expect(listed.body).not.toContain(deviceToken);
  });

  it("crea una sola configuración durante arranques simultáneos y conserva cambios parciales", async () => {
    const prisma = getTenantClient(TENANT);
    await prisma.kioskoConfig.deleteMany();
    const responses = await Promise.all(Array.from({ length: 8 }, () => deviceGet("/config")));
    expect(responses.map((r) => r.statusCode)).toEqual(Array(8).fill(200));
    expect(await prisma.kioskoConfig.count()).toBe(1);
    const edits = await Promise.all([
      app.inject({
        method: "PUT",
        url: "/t/kioskos/config",
        headers: auth(),
        payload: { mensajeBienvenida: "Bienvenido" },
      }),
      app.inject({
        method: "PUT",
        url: "/t/kioskos/config",
        headers: auth(),
        payload: { precioSegundos: 12 },
      }),
    ]);
    expect(edits.map((r) => r.statusCode)).toEqual([200, 200]);
    expect((await deviceGet("/config")).json()).toMatchObject({
      mensajeBienvenida: "Bienvenido",
      precioSegundos: 12,
    });
  });

  it("revoca inmediatamente el acceso del dispositivo", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/t/kioskos",
      headers: auth(),
      payload: { nombre: "Revocable", sucursalId: branchId },
    });
    const { device, token } = created.json();
    expect((await deviceGet("/config", token)).statusCode).toBe(200);
    expect(
      (await app.inject({ method: "DELETE", url: `/t/kioskos/${device.id}`, headers: auth() }))
        .statusCode,
    ).toBe(204);
    for (const path of ["/config", "/precio/7501234567890", "/idle"])
      expect((await deviceGet(path, token)).statusCode).toBe(401);
  });

  it("rechaza sucursal desactivada y tenant cancelado", async () => {
    const prisma = getTenantClient(TENANT);
    const previous = await masterPrisma.tenant.findUniqueOrThrow({ where: { slug: TENANT } });
    try {
      await prisma.sucursal.update({ where: { id: branchId }, data: { isActive: false } });
      expect((await deviceGet("/config")).statusCode).toBe(401);
      await prisma.sucursal.update({ where: { id: branchId }, data: { isActive: true } });
      await masterPrisma.tenant.update({ where: { slug: TENANT }, data: { status: "cancelled" } });
      expect((await deviceGet("/config")).statusCode).toBe(401);
    } finally {
      await prisma.sucursal.update({ where: { id: branchId }, data: { isActive: true } });
      await masterPrisma.tenant.update({
        where: { slug: TENANT },
        data: { status: previous.status },
      });
    }
  });

  it("devuelve 404 para productos desconocidos y variantes o productos inactivos", async () => {
    const prisma = getTenantClient(TENANT);
    expect((await deviceGet("/precio/NO-EXISTE")).statusCode).toBe(404);
    try {
      await prisma.productoVariante.update({ where: { id: variantId }, data: { isActive: false } });
      expect((await deviceGet("/precio/7501234567890")).statusCode).toBe(404);
      await prisma.productoVariante.update({ where: { id: variantId }, data: { isActive: true } });
      await prisma.producto.update({ where: { id: productId }, data: { isActive: false } });
      expect((await deviceGet("/precio/7501234567890")).statusCode).toBe(404);
      expect((await deviceGet("/precio/KIOSKO")).statusCode).toBe(404);
    } finally {
      await prisma.productoVariante.update({ where: { id: variantId }, data: { isActive: true } });
      await prisma.producto.update({ where: { id: productId }, data: { isActive: true } });
    }
  });

  it("filtra anuncios por vigencia, canal, sucursal, horario, cupo y visibilidad", async () => {
    const prisma = getTenantClient(TENANT);
    const base = {
      tipo: "descuento_pct" as const,
      acciones: { valor: 10 },
      status: "activa" as const,
      vigenciaInicio: new Date(Date.now() - 86400000),
    };
    await prisma.promocion.createMany({
      data: [
        { ...base, nombre: "Vigente", canales: ["pos"], sucursalesAplicables: [branchId] },
        { ...base, nombre: "Global", canales: ["todos"] },
        { ...base, nombre: "Futura", vigenciaInicio: new Date(Date.now() + 86400000) },
        { ...base, nombre: "Vencida", vigenciaFin: new Date(Date.now() - 3600000) },
        { ...base, nombre: "Web", canales: ["ecommerce"] },
        { ...base, nombre: "Otra sucursal", sucursalesAplicables: [otherBranchId] },
        { ...base, nombre: "Privada", visiblePublico: false },
        { ...base, nombre: "Agotada", limiteUsosTotal: 1, usosActuales: 1 },
        { ...base, nombre: "Otro día", horarios: { dias: [(new Date().getDay() + 1) % 7] } },
        { ...base, nombre: "Borrador", status: "draft" },
      ],
    });
    const response = await deviceGet("/idle");
    expect(response.statusCode).toBe(200);
    expect(
      response
        .json()
        .slides.map((slide: { titulo: string }) => slide.titulo)
        .sort(),
    ).toEqual(["Global", "Vigente"]);
  });

  it("coincide con POS con IVA y promociones y oculta existencias por defecto", async () => {
    const payload = {
      sucursalId: branchId,
      canal: "pos",
      lineas: [{ varianteId: variantId, cantidad: "1" }],
    };
    const pos = await app.inject({
      method: "POST",
      url: "/t/ventas/preview",
      headers: auth(),
      payload,
    });
    const kiosk = await deviceGet("/precio/7501234567890");
    expect(pos.statusCode).toBe(200);
    expect(kiosk.statusCode).toBe(200);
    expect(kiosk.json().precioVigente).toBe(pos.json().total);
    expect(kiosk.json().existencia).toBeNull();
    expect(kiosk.json().promoLabel).toBe("Promoción aplicada");
  });
  it("no anuncia un producto publicado que fue archivado", async () => {
    const prisma = getTenantClient(TENANT);
    await prisma.productoPublicado.create({
      data: {
        productoId: productId,
        tituloPublico: "Publicado kiosko",
        slugSeo: "publicado-kiosko",
      },
    });
    const titles = async () =>
      (await deviceGet("/idle")).json().slides.map((slide: { titulo: string }) => slide.titulo);
    expect(await titles()).toContain("Publicado kiosko");
    try {
      await prisma.producto.update({ where: { id: productId }, data: { archivedAt: new Date() } });
      expect(await titles()).not.toContain("Publicado kiosko");
      expect((await deviceGet("/precio/7501234567890")).statusCode).toBe(404);
    } finally {
      await prisma.producto.update({ where: { id: productId }, data: { archivedAt: null } });
    }
  });
});
