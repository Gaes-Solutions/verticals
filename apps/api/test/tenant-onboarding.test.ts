import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const slug = "test-owner-onboarding";
const email = "owner-onboarding@example.invalid";
const password = "OwnerOnboarding!2026";
let app: FastifyInstance;
let token: string;
const headers = () => ({ authorization: `Bearer ${token}` });
async function progress() {
  const response = await app.inject({ method: "GET", url: "/t/onboarding", headers: headers() });
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
}
beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(slug, "New owner onboarding", "free");
  await createTenantUser(slug, { email, password, rolCodigo: "dueno", nombre: "Owner QA" });
  token = (await loginTenantUser(app, slug, email, password)).accessToken;
}, 60000);
afterAll(async () => {
  if (app) await app.close();
});

it("a fresh store does not claim configuration or sales are complete", async () => {
  const result = await progress();
  expect(result.conteos).toEqual({ productos: 0, listas: 0, clientesB2b: 0, ventas: 0 });
  expect(result.pasos).toEqual({
    datosNegocio: false,
    productos: false,
    listaPrecios: false,
    clientesB2b: false,
    vendedores: false,
    comisiones: false,
    primeraVenta: false,
  });
});
it("unassigned and disabled users do not count as an operating team", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/t/usuarios",
    headers: headers(),
    payload: {
      nombre: "No role QA",
      email: "unassigned-onboarding@example.invalid",
      password,
      rolIds: [],
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  await createTenantUser(slug, {
    email: "cashier-onboarding@example.invalid",
    password,
    rolCodigo: "cajero",
    nombre: "Cashier QA",
  });
  const db = getTenantClient(slug);
  await db.usuario.update({
    where: { email: "cashier-onboarding@example.invalid" },
    data: { isActive: false },
  });
  expect((await progress()).pasos.vendedores).toBe(false);
  await db.usuario.update({
    where: { email: "cashier-onboarding@example.invalid" },
    data: { isActive: true },
  });
  expect((await progress()).pasos.vendedores).toBe(true);
});
it("archiving the only product makes the catalogue step pending again", async () => {
  const created = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: headers(),
    payload: { nombre: "Product onboarding QA", skuPadre: "QA-ONBOARD", precioBase: "50.00" },
  });
  expect(created.statusCode, created.body).toBe(201);
  expect((await progress()).pasos.productos).toBe(true);
  const removed = await app.inject({
    method: "DELETE",
    url: `/t/productos/${created.json().id}`,
    headers: headers(),
  });
  expect(removed.statusCode, removed.body).toBe(200);
  expect((await progress()).pasos.productos).toBe(false);
});
it("inactive wholesale records and draft or cancelled sales do not complete the guide", async () => {
  const db = getTenantClient(slug);
  await db.listaPrecio.create({
    data: {
      codigo: "QA-INACTIVE",
      nombre: "Inactive QA",
      tipo: "mayoreo_nivel",
      isDefault: false,
      isActive: false,
    },
  });
  await db.clienteB2b.create({
    data: {
      razonSocial: "Inactive QA",
      rfc: "XAXX010101000",
      regimenFiscalSat: "601",
      isActive: false,
    },
  });
  await db.reglaComision.create({
    data: { nombre: "Inactive QA", pct: "5", base: "venta", isActive: false },
  });
  const sucursal = await db.sucursal.findFirstOrThrow({ where: { isDefault: true } });
  const owner = await db.usuario.findUniqueOrThrow({ where: { email } });
  await db.venta.createMany({
    data: [
      {
        folio: "QA-ONBOARD-DRAFT",
        sucursalId: sucursal.id,
        usuarioId: owner.id,
        estado: "borrador",
      },
      {
        folio: "QA-ONBOARD-CANCELLED",
        sucursalId: sucursal.id,
        usuarioId: owner.id,
        estado: "cancelada",
      },
    ],
  });
  const result = await progress();
  expect(result.pasos.listaPrecios).toBe(false);
  expect(result.pasos.clientesB2b).toBe(false);
  expect(result.pasos.comisiones).toBe(false);
  expect(result.pasos.primeraVenta).toBe(false);
  expect(result.conteos.ventas).toBe(0);
});
it("owner can save an address and clear optional contact data without losing it", async () => {
  const db = getTenantClient(slug);
  const sucursal = await db.sucursal.findFirstOrThrow({ where: { isDefault: true } });
  const url = `/t/sucursales/${sucursal.id}`;
  const direccion = {
    calle: "QA Avenue",
    municipio: "Guadalajara",
    cp: "44100",
    referencia: "Preserved QA",
  };
  const saved = await app.inject({
    method: "PATCH",
    url,
    headers: headers(),
    payload: {
      direccion,
      telefono: "3312340000",
      emailContacto: "contact-onboarding@example.invalid",
    },
  });
  expect(saved.statusCode, saved.body).toBe(200);
  expect((await progress()).pasos.datosNegocio).toBe(true);
  const cleared = await app.inject({
    method: "PATCH",
    url,
    headers: headers(),
    payload: { telefono: null, emailContacto: null },
  });
  expect(cleared.statusCode, cleared.body).toBe(200);
  const reload = await app.inject({ method: "GET", url, headers: headers() });
  expect(reload.json().telefono).toBeNull();
  expect(reload.json().emailContacto).toBeNull();
  expect(reload.json().direccion).toEqual(direccion);
  const invalid = await app.inject({
    method: "PATCH",
    url,
    headers: headers(),
    payload: { emailContacto: "not-an-email" },
  });
  expect(invalid.statusCode, invalid.body).toBe(400);
});
it("cashier cannot overwrite the branch configuration", async () => {
  const cashier = (await loginTenantUser(app, slug, "cashier-onboarding@example.invalid", password))
    .accessToken;
  const sucursal = await getTenantClient(slug).sucursal.findFirstOrThrow({
    where: { isDefault: true },
  });
  const response = await app.inject({
    method: "PATCH",
    url: `/t/sucursales/${sucursal.id}`,
    headers: { authorization: `Bearer ${cashier}` },
    payload: { nombre: "Unauthorized QA", telefono: null, emailContacto: null },
  });
  expect(response.statusCode, response.body).toBe(403);
  expect(
    (await getTenantClient(slug).sucursal.findUniqueOrThrow({ where: { id: sucursal.id } })).nombre,
  ).toBe(sucursal.nombre);
});
