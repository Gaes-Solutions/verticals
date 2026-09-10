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
| Corte de caja | Que el modal abra con el conteo por denominación listo |
| Lectura X fallida | Que se pueda reintentar en vez de dejar la caja trabada |

## Lo que falta

Devoluciones, corte Z, promoción aplicada en venta, y el recorrido del cliente en la tienda.
Van en la siguiente tanda.

### El corte X: qué se encontró y qué se corrigió

Al escribir estas pruebas apareció un aviso de "corte X sin confirmar" que dejaba la caja
trabada. La primera lectura del síntoma fue equivocada: **no es que un segundo corte X falle**.
Se comprobó de los dos lados. En la API, dos lecturas X seguidas responden 201 y la diferencia
cambia exactamente lo que cambia el conteo (`tenant-cortes.test.ts`). En el navegador, dos
lecturas seguidas también salen bien.

Lo que sí había era un modo de falla desproporcionado: **cuando el envío de una lectura X no se
confirmaba** (un corte de red, una petición abortada), el punto de venta mostraba "no lo vuelvas
a enviar" y no ofrecía ninguna salida. El cajero quedaba trabado hasta recargar la página.

Esa advertencia es correcta para el corte Z, que cierra el turno y no debe duplicarse. Para el X
no: solo consulta, no mueve dinero, no toca inventario y no cierra la apertura, así que repetirlo
es inofensivo. Ahora el X ofrece "Volver a intentar la lectura" y el Z conserva la advertencia
estricta con su consulta al servidor.

La prueba de arriba corta la red a propósito para verificarlo.

## Un hallazgo del camino

Los campos del alta de producto usaban `<div>` en vez de `<label>`, así que no tenían etiqueta
asociada: un lector de pantalla no los anunciaba y tocar el texto no enfocaba el campo. Se
corrigió al escribir estas pruebas, que es justo para lo que sirven.
