import { expect, test } from "@playwright/test";
import { CATALOGO, CUENTA } from "./siembra.js";

/**
 * Camino crítico del dueño en el panel: entrar, ver su catálogo, dar de alta un
 * producto con sus claves fiscales y llegar a la carga masiva.
 */
test.use({ baseURL: "http://127.0.0.1:5174" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Negocio (slug)").fill(CUENTA.tenant);
  await page.getByLabel("Correo").fill(CUENTA.email);
  await page.getByLabel("Contraseña").fill(CUENTA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("navigation").or(page.getByText("Productos").first())).toBeVisible();
});

test("el dueño ve su catálogo sembrado", async ({ page }) => {
  await page.getByRole("button", { name: "Productos" }).first().click();
  for (const producto of CATALOGO) {
    await expect(page.getByText(producto.nombre).first()).toBeVisible();
  }
});

test("dar de alta un producto pide y guarda las claves del SAT", async ({ page }) => {
  await page.getByRole("button", { name: "Productos" }).first().click();
  await page.getByRole("button", { name: /Nuevo producto/i }).click();

  const sku = `E2E-ALTA-${Date.now()}`;
  await page
    .getByLabel(/Nombre/i)
    .first()
    .fill("Producto dado de alta en prueba");
  await page
    .getByLabel(/SKU|Código/i)
    .first()
    .fill(sku);
  await page
    .getByLabel(/Precio/i)
    .first()
    .fill("99.00");

  // Sin estas dos claves, facturar el producto responde 409 y la venta queda
  // sin poder timbrarse.
  await expect(page.getByText("Datos para facturar (SAT)")).toBeVisible();
  await page.getByLabel("Clave del producto").fill("50181900");
  await expect(page.getByLabel("Unidad")).toHaveValue("H87");

  await page
    .getByRole("button", { name: /Guardar|Crear/i })
    .first()
    .click();
  await expect(page.getByText("Producto dado de alta en prueba").first()).toBeVisible();
});

test("la plantilla de carga masiva incluye las columnas fiscales", async ({ page }) => {
  await page
    .getByRole("button", { name: /Carga masiva/i })
    .first()
    .click();
  await expect(page.getByText("ClaveSAT").first()).toBeVisible();
  await expect(page.getByText("UnidadSAT").first()).toBeVisible();
});
