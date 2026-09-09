# Happy paths en navegador (Playwright)

Cubren los caminos que un negocio real recorre todos los días: el cajero cobrando y el dueño
administrando su catálogo. Complementan a las 1010 pruebas de API, que verifican el backend pero
no que los botones existan y hagan lo que dicen.

## Correrlas

```bash
set -a && . .env && set +a
pnpm e2e                    # todo
pnpm e2e --project=pos      # solo el punto de venta
pnpm e2e --project=panel    # solo el panel
pnpm e2e --ui               # modo interactivo, para depurar
```

Playwright levanta solo la API, el panel y el punto de venta. Siempre contra la base **local**;
nunca apuntar a producción, porque crea ventas de verdad.

## Preparar la máquina, una sola vez

```bash
npx playwright install chromium

pnpm --filter @gaespos/db migrate tenant onboard e2e-retail \
  -n "E2E Retail" -e dueno@e2e.local -P "E2ePruebas!2026"
```

El catálogo y las existencias se siembran solos antes de cada corrida (`siembra.ts`).

## Qué cubren hoy

| Camino | Qué verifica |
|---|---|
| Cobrar en efectivo | Escanear, armar ticket, cobrar, y que la venta quede con folio y estado cobrada |
| Abrir caja | Que el punto de venta no deje vender sin caja abierta con su fondo |
| Buscar producto | Por nombre y por código de barras |
| Código inexistente | Que no agregue nada al ticket |
| Catálogo | Que el dueño vea sus productos |
| Alta de producto | Que pida las claves del SAT, con la unidad propuesta en pieza |
| Carga masiva | Que la plantilla traiga las columnas fiscales |

## Lo que falta

Devoluciones, corte X y Z, promoción aplicada en venta, y el recorrido del cliente en la tienda.
Van en la siguiente tanda.

## Un hallazgo del camino

Los campos del alta de producto usaban `<div>` en vez de `<label>`, así que no tenían etiqueta
asociada: un lector de pantalla no los anunciaba y tocar el texto no enfocaba el campo. Se
corrigió al escribir estas pruebas, que es justo para lo que sirven.
