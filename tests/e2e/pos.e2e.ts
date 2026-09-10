import { expect, test } from "@playwright/test";
import { CATALOGO, CUENTA } from "./siembra.js";

/**
 * Camino crítico del cajero: entrar, buscar producto, armar ticket y cobrar en
 * efectivo. Es el flujo que más veces al día corre un negocio real, así que si
 * algo se rompe aquí no hay piloto.
 */
test.use({ baseURL: "http://127.0.0.1:5173" });

const CAFE = CATALOGO[0];
const AZUCAR = CATALOGO[1] as (typeof CATALOGO)[number];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
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

  // La consulta es asíncrona: hay que esperar a saber si la caja quedó abierta
  // de una corrida anterior o si toca abrirla con su fondo.
  const entrarAVender = page.getByRole("button", { name: "Entrar a vender" });
  const abrir = page.getByRole("button", { name: "Abrir caja con este fondo" });
  await expect(entrarAVender.or(abrir)).toBeVisible();
  if (await abrir.isVisible()) {
    await page.getByPlaceholder("Escribe el efectivo contado").fill("1000");
    await abrir.click();
  }
  await entrarAVender.click();
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

  // El cobro en efectivo pasa por la verificación del intento durable, que es
  // lo que evita cobrar dos veces si se cae la red a media venta.
  await expect(page.getByRole("heading", { name: "Verificar cobro en efectivo" })).toBeVisible();

  // El folio y el estado son la prueba de que la venta se persistió, no de que
  // la pantalla cambió.
  await expect(page.getByRole("status")).toContainText("cobrada");
  await expect(page.getByRole("status")).toContainText("128");

  // Y el cajero puede arrancar la siguiente venta con el ticket en cero.
  await page.getByRole("button", { name: "Iniciar nueva venta" }).click();
  await expect(page.getByPlaceholder("Buscar producto o escanear código…")).toBeVisible();
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

test("el corte abre con el conteo de efectivo listo", async ({ page }) => {
  await page.getByRole("button", { name: "Corte", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Corte de caja" })).toBeVisible();

  // El conteo por denominación es lo que el cajero llena cada noche.
  await expect(page.getByLabel("Billetes: cantidad de 100 pesos")).toBeVisible();
  await expect(page.getByLabel("Monedas: cantidad de 10 pesos")).toBeVisible();
});

test("una lectura X que falla deja reintentar, no bloquea la caja", async ({ page }) => {
  // El corte X solo consulta: si el envío se cae, repetirlo es inofensivo.
  // Antes el punto de venta decía "no lo vuelvas a enviar" y dejaba al cajero
  // sin salida hasta recargar la página.
  await page.route("**/t/cortes", (ruta) =>
    ruta.request().method() === "POST" ? ruta.abort("failed") : ruta.continue(),
  );

  await page.getByRole("button", { name: "Corte", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Corte de caja" })).toBeVisible();
  await expect(page.getByLabel("Billetes: cantidad de 100 pesos")).toBeVisible();
  await page.getByRole("button", { name: "Corte X (lectura)" }).click();

  const reintentar = page.getByRole("button", { name: "Volver a intentar la lectura" });
  await expect(reintentar).toBeVisible();

  // Al reintentar con la red restablecida, la lectura sale.
  await page.unroute("**/t/cortes");
  await reintentar.click();
  await page.getByRole("button", { name: "Corte X (lectura)" }).click();
  await expect(page.getByText("Diferencia vs esperado:")).toBeVisible();
});

test("devolver un producto de una venta cobrada", async ({ page }) => {
  // Vender primero, para tener un folio real que devolver.
  const buscador = page.getByPlaceholder("Buscar producto o escanear código…");
  await buscador.fill(CAFE.codigo);
  await buscador.press("Enter");
  await page.getByRole("button", { name: /Cobrar/ }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("heading", { name: "Verificar cobro en efectivo" })).toBeVisible();

  const folio = ((await page.getByRole("status").textContent()) ?? "").match(/[A-Z-]+\d{6}/)?.[0];
  expect(folio, "la venta debe traer folio para poder devolverla").toBeTruthy();
  await page.getByRole("button", { name: "Iniciar nueva venta" }).click();

  await page.getByRole("button", { name: "Devolución", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Devolución" })).toBeVisible();
  await page.getByLabel("Folio exacto de la venta").fill(folio as string);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();

  // Devolver una pieza del café.
  const cantidad = page.getByLabel(/Cantidad a devolver de/).first();
  await expect(cantidad).toBeVisible();
  await cantidad.fill("1");

  const devolver = page.getByRole("button", { name: /Devolver 1 producto/ });
  await expect(devolver).toBeEnabled();
  await devolver.click();

  // El dinero sale: la devolución tiene que quedar registrada con su propio
  // folio, no basta con que la pantalla cambie.
  await expect(page.getByText("Devolución registrada")).toBeVisible();
  await expect(page.getByText(/^Folio /)).toBeVisible();
});

test("una promoción activa se aplica sola al cobrar", async ({ page }) => {
  const buscador = page.getByPlaceholder("Buscar producto o escanear código…");
  await buscador.fill(AZUCAR.codigo);
  await buscador.press("Enter");
  await expect(page.getByText(AZUCAR.nombre).first()).toBeVisible();

  await page.getByRole("button", { name: /Cobrar/ }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("heading", { name: "Verificar cobro en efectivo" })).toBeVisible();

  // El azúcar es de 36.50 y trae 20% de promoción: la venta registrada tiene
  // que quedar por debajo del precio de lista, sin que el cajero haga nada.
  const linea = (await page.getByRole("status").textContent()) ?? "";
  const cobrado = Number((linea.match(/\$\s?([\d.]+)/) ?? [])[1]);
  expect(cobrado, `la venta dice: ${linea}`).toBeGreaterThan(0);
  expect(cobrado).toBeLessThan(Number(AZUCAR.precio));
});
