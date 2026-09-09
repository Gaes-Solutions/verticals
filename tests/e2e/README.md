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

## Lo que falta

Devoluciones, corte Z, promoción aplicada en venta, y el recorrido del cliente en la tienda.
Van en la siguiente tanda.

### Por qué el corte no se ejecuta en la prueba

Intenté verificar la aritmética del corte haciendo dos lecturas X seguidas con conteos que
difieren en cien pesos. Al hacerlo apareció un comportamiento a revisar: **la segunda lectura no
confirma y deja la caja bloqueada**, con el aviso "Hay un corte X sin confirmar, no repitas el
envío" y el botón deshabilitado.

El X es de lectura y no cierra nada, así que dejar la caja atorada es un modo de falla más duro
del que amerita. Queda pendiente entender si es una carrera entre las dos lecturas o algo del
mecanismo de intentos durables.

Mientras tanto la prueba solo abre el modal y comprueba el conteo. Una prueba que ensucia el
estado compartido de la caja no sirve: la deja rota para las siguientes corridas.

## Un hallazgo del camino

Los campos del alta de producto usaban `<div>` en vez de `<label>`, así que no tenían etiqueta
asociada: un lector de pantalla no los anunciaba y tocar el texto no enfocaba el campo. Se
corrigió al escribir estas pruebas, que es justo para lo que sirven.
