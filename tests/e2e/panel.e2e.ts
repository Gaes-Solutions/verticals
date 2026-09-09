import { expect, test } from "@playwright/test";
import { CATALOGO, CUENTA } from "./siembra.js";

/**
 * Camino crítico del dueño en el panel: entrar, ver su catálogo, dar de alta un
 * producto con sus claves fiscales y llegar a la carga masiva.
 *
 * El menú se pinta dos veces (escritorio y cajón móvil), así que cada botón de
 * navegación se toma con `.first()`.
 */
test.use({ baseURL: "http://127.0.0.1:5174" });

const menu = (nombre: string) => ({ name: nombre, exact: true }) as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Correo", { exact: true }).fill(CUENTA.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(CUENTA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", menu("Productos")).first()).toBeVisible();
});

test("el dueño ve su catálogo sembrado", async ({ page }) => {
  await page.getByRole("button", menu("Productos")).first().click();
  for (const producto of CATALOGO) {
    await expect(page.getByText(producto.nombre).first()).toBeVisible();
  }
});

test("dar de alta un producto pide y guarda las claves del SAT", async ({ page }) => {
  await page.getByRole("button", menu("Productos")).first().click();
  await page.getByRole("button", { name: /Nuevo producto/ }).click();

  const nombre = `Producto de prueba ${Date.now()}`;
  await page.getByLabel("Nombre *").fill(nombre);
  await page.getByLabel("Precio de venta (IVA incluido) *").fill("99.00");
  await page.getByLabel("SKU / código de barras *").fill(`E2E-ALTA-${Date.now()}`);

  // Sin estas dos claves, facturar el producto responde 409 y la venta se queda
  // sin poder timbrarse. La unidad viene propuesta como pieza.
  await expect(page.getByText("Datos para facturar (SAT)")).toBeVisible();
  await expect(page.getByLabel("Unidad")).toHaveValue("H87");
  await page.getByLabel("Clave del producto").fill("50181900");

  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(nombre).first()).toBeVisible();
});

test("la plantilla de carga masiva incluye las columnas fiscales", async ({ page }) => {
  await page.getByRole("button", menu("Carga masiva")).first().click();
  await expect(page.getByText("ClaveSAT").first()).toBeVisible();
  await expect(page.getByText("UnidadSAT").first()).toBeVisible();
});
