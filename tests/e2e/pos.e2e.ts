import { expect, test } from "@playwright/test";
import { CATALOGO, CUENTA } from "./siembra.js";

/**
 * Camino crítico del cajero: entrar, buscar producto, armar ticket y cobrar en
 * efectivo. Es el flujo que más veces al día corre un negocio real, así que si
 * algo se rompe aquí no hay piloto.
 */
test.use({ baseURL: "http://127.0.0.1:5173" });

const CAFE = CATALOGO[0];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Negocio (slug)").fill(CUENTA.tenant);
  await page.getByLabel("Correo").fill(CUENTA.email);
  await page.getByLabel("Contraseña").fill(CUENTA.password);
  await page.getByRole("button", { name: "Entrar" }).click();

  // El POS no deja vender sin caja abierta: es la salvaguarda que hace que el
  // corte cuadre, así que la prueba pasa por el mismo trámite que el cajero.
  await expect(page.getByRole("heading", { name: "Prepara tu punto de venta" })).toBeVisible();
  await page.getByLabel("Sucursal").selectOption({ index: 1 });
  await expect(page.getByLabel("Caja")).toBeEnabled();
  await page.getByLabel("Caja").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Consultar estado de caja" }).click();

  const abrir = page.getByRole("button", { name: "Abrir caja con este fondo" });
  if (await abrir.isVisible().catch(() => false)) {
    await page.getByPlaceholder("Escribe el efectivo contado").fill("1000");
    await abrir.click();
  }
  await page.getByRole("button", { name: "Entrar a vender" }).click();
  await expect(page.getByPlaceholder("Buscar producto o escanear código…")).toBeVisible();
});

test("el cajero cobra una venta en efectivo y el ticket queda limpio", async ({ page }) => {
  const buscador = page.getByPlaceholder("Buscar producto o escanear código…");

  // Escanear = teclear el código de barras y confirmar, que es lo que hace la
  // pistola física.
  await buscador.fill(CAFE.codigo);
  await buscador.press("Enter");

  await expect(page.getByText(CAFE.nombre).first()).toBeVisible();

  const cobrar = page.getByRole("button", { name: /Cobrar/ });
  await expect(cobrar).toBeEnabled();
  await cobrar.click();

  // El modal propone el importe exacto como recibido; se confirma tal cual.
  await page.getByRole("button", { name: "Confirmar" }).click();

  // Cobrada la venta, el ticket vuelve a cero y el botón de cobrar se apaga.
  await expect(page.getByRole("button", { name: /Cobrar/ })).toBeDisabled();
});

test("buscar por nombre encuentra el producto sembrado", async ({ page }) => {
  const buscador = page.getByPlaceholder("Buscar producto o escanear código…");
  await buscador.fill("Café");
  await expect(page.getByText(CAFE.nombre).first()).toBeVisible();
});

test("un código inexistente no agrega nada al ticket", async ({ page }) => {
  const buscador = page.getByPlaceholder("Buscar producto o escanear código…");
  await buscador.fill("0000000000000");
  await buscador.press("Enter");
  await expect(page.getByRole("button", { name: /Cobrar/ })).toBeDisabled();
});
