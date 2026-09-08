import { getTenantClient } from "@gaespos/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";
const TENANT = "test-barcode-variant";
const db = () => getTenantClient(TENANT);
let app: FastifyInstance;
let token: string;
let productId: string;
let firstId: string;
let secondId: string;
const search = (code: string) =>
  app.inject({
    method: "GET",
    url: `/t/productos/buscar/${code}`,
    headers: { authorization: `Bearer ${token}` },
  });
beforeAll(async () => {
  app = await buildTestApp();
  await createTestTenant(TENANT);
  await createTenantUser(TENANT, {
    email: "barcode@test.local",
    password: "ChangeMe!2026",
    rolCodigo: "dueno",
  });
  token = (await loginTenantUser(app, TENANT, "barcode@test.local", "ChangeMe!2026")).accessToken;
  const product = await app.inject({
    method: "POST",
    url: "/t/productos",
    headers: { authorization: `Bearer ${token}` },
    payload: { skuPadre: "TSHIRT", nombre: "Camiseta", precioBase: "100" },
  });
  expect(product.statusCode).toBe(201);
  productId = product.json().id;
  firstId = product.json().variantes[0].id;
  await db().productoVariante.update({ where: { id: firstId }, data: { sku: "TSHIRT-S" } });
  secondId = (
    await db().productoVariante.create({
      data: {
        productoId: productId,
        sku: "TSHIRT-L",
        precioBase: "120",
        nombreVariante: "Grande",
        codigosBarras: { create: { codigo: "7500000000120" } },
      },
    })
  ).id;
});
afterAll(async () => {
  await app.close();
});
describe("barcode exact variant DTO", () => {
  it("barcode and SKU identify second variant while preserving compatible product shape", async () => {
    for (const code of ["7500000000120", "TSHIRT-L"]) {
      const response = await search(code);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: productId, varianteEncontradaId: secondId });
      expect(response.json().variantes.map((v: { id: string }) => v.id)).toContain(firstId);
    }
  });
  it("parent with multiple variants is explicitly ambiguous", async () => {
    expect((await search("TSHIRT")).json().varianteEncontradaId).toBeNull();
  });
  it("inactive barcode/SKU never selects active sibling", async () => {
    await db().productoVariante.update({ where: { id: secondId }, data: { isActive: false } });
    try {
      expect((await search("7500000000120")).statusCode).toBe(404);
      expect((await search("TSHIRT-L")).statusCode).toBe(404);
      expect((await search("TSHIRT")).json().varianteEncontradaId).toBe(firstId);
    } finally {
      await db().productoVariante.update({ where: { id: secondId }, data: { isActive: true } });
    }
  });
  it("archived variant and inactive product are excluded", async () => {
    await db().productoVariante.update({
      where: { id: secondId },
      data: { archivedAt: new Date() },
    });
    try {
      expect((await search("7500000000120")).statusCode).toBe(404);
    } finally {
      await db().productoVariante.update({ where: { id: secondId }, data: { archivedAt: null } });
    }
    await db().producto.update({ where: { id: productId }, data: { isActive: false } });
    try {
      expect((await search("TSHIRT-S")).statusCode).toBe(404);
      expect((await search("7500000000120")).statusCode).toBe(404);
    } finally {
      await db().producto.update({ where: { id: productId }, data: { isActive: true } });
    }
  });
});
