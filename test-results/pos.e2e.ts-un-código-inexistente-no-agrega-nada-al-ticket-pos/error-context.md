# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos.e2e.ts >> un código inexistente no agrega nada al ticket
- Location: tests/e2e/pos.e2e.ts:64:5

# Error details

```
Test timeout of 60000ms exceeded while running "beforeEach" hook.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Entrar a vender' })

```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - heading "Prepara tu punto de venta" [level=1] [ref=e5]
    - paragraph [ref=e6]: Dueño · e2e-retail
    - paragraph [ref=e7]: Elige dónde vas a cobrar. La apertura debe reflejar el efectivo que hay en caja.
    - generic [ref=e8]:
      - generic [ref=e9]:
        - text: Sucursal
        - combobox "Sucursal" [ref=e10]:
          - option "Selecciona una sucursal"
          - option "Sucursal principal" [selected]
      - generic [ref=e11]:
        - text: Caja
        - combobox "Caja" [ref=e12]:
          - option "Selecciona una caja"
          - option "Caja 1" [selected]
      - button "Consultar estado de caja" [ref=e13] [cursor=pointer]
      - generic [ref=e14]:
        - status [ref=e15]: La caja está cerrada.
        - generic [ref=e16]:
          - generic [ref=e17]:
            - text: Fondo inicial (MXN)
            - textbox "Fondo inicial (MXN)" [ref=e18]:
              - /placeholder: Escribe el efectivo contado
          - button "Abrir caja con este fondo" [disabled] [ref=e19]
    - generic [ref=e20]:
      - button "Recargar configuración" [ref=e21] [cursor=pointer]
      - button "Cerrar sesión" [ref=e22] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { CATALOGO, CUENTA } from "./siembra.js";
  3  | 
  4  | /**
  5  |  * Camino crítico del cajero: entrar, buscar producto, armar ticket y cobrar en
  6  |  * efectivo. Es el flujo que más veces al día corre un negocio real, así que si
  7  |  * algo se rompe aquí no hay piloto.
  8  |  */
  9  | test.use({ baseURL: "http://127.0.0.1:5173" });
  10 | 
  11 | const CAFE = CATALOGO[0];
  12 | 
  13 | test.beforeEach(async ({ page }) => {
  14 |   await page.goto("/");
  15 |   await page.getByLabel("Negocio (slug)").fill(CUENTA.tenant);
  16 |   await page.getByLabel("Correo").fill(CUENTA.email);
  17 |   await page.getByLabel("Contraseña").fill(CUENTA.password);
  18 |   await page.getByRole("button", { name: "Entrar" }).click();
  19 | 
  20 |   // El POS no deja vender sin caja abierta: es la salvaguarda que hace que el
  21 |   // corte cuadre, así que la prueba pasa por el mismo trámite que el cajero.
  22 |   await expect(page.getByRole("heading", { name: "Prepara tu punto de venta" })).toBeVisible();
  23 |   await page.getByLabel("Sucursal").selectOption({ index: 1 });
  24 |   await expect(page.getByLabel("Caja")).toBeEnabled();
  25 |   await page.getByLabel("Caja").selectOption({ index: 1 });
  26 |   await page.getByRole("button", { name: "Consultar estado de caja" }).click();
  27 | 
  28 |   const abrir = page.getByRole("button", { name: "Abrir caja con este fondo" });
  29 |   if (await abrir.isVisible().catch(() => false)) {
  30 |     await page.getByPlaceholder("Escribe el efectivo contado").fill("1000");
  31 |     await abrir.click();
  32 |   }
> 33 |   await page.getByRole("button", { name: "Entrar a vender" }).click();
     |                                                               ^ Error: locator.click: Test timeout of 60000ms exceeded.
  34 |   await expect(page.getByPlaceholder("Buscar producto o escanear código…")).toBeVisible();
  35 | });
  36 | 
  37 | test("el cajero cobra una venta en efectivo y el ticket queda limpio", async ({ page }) => {
  38 |   const buscador = page.getByPlaceholder("Buscar producto o escanear código…");
  39 | 
  40 |   // Escanear = teclear el código de barras y confirmar, que es lo que hace la
  41 |   // pistola física.
  42 |   await buscador.fill(CAFE.codigo);
  43 |   await buscador.press("Enter");
  44 | 
  45 |   await expect(page.getByText(CAFE.nombre).first()).toBeVisible();
  46 | 
  47 |   const cobrar = page.getByRole("button", { name: /Cobrar/ });
  48 |   await expect(cobrar).toBeEnabled();
  49 |   await cobrar.click();
  50 | 
  51 |   // El modal propone el importe exacto como recibido; se confirma tal cual.
  52 |   await page.getByRole("button", { name: "Confirmar" }).click();
  53 | 
  54 |   // Cobrada la venta, el ticket vuelve a cero y el botón de cobrar se apaga.
  55 |   await expect(page.getByRole("button", { name: /Cobrar/ })).toBeDisabled();
  56 | });
  57 | 
  58 | test("buscar por nombre encuentra el producto sembrado", async ({ page }) => {
  59 |   const buscador = page.getByPlaceholder("Buscar producto o escanear código…");
  60 |   await buscador.fill("Café");
  61 |   await expect(page.getByText(CAFE.nombre).first()).toBeVisible();
  62 | });
  63 | 
  64 | test("un código inexistente no agrega nada al ticket", async ({ page }) => {
  65 |   const buscador = page.getByPlaceholder("Buscar producto o escanear código…");
  66 |   await buscador.fill("0000000000000");
  67 |   await buscador.press("Enter");
  68 |   await expect(page.getByRole("button", { name: /Cobrar/ })).toBeDisabled();
  69 | });
  70 | 
```