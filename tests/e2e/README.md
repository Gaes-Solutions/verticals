# Happy paths en navegador (Playwright)

Cubren los caminos que un negocio real recorre todos los días: el cajero cobrando y el dueño
administrando su catálogo. Complementan las pruebas de API, que verifican el backend pero
no que los botones existan y hagan lo que dicen.

## Correrlas

```bash
pnpm exec dotenv -e .env -- node scripts/testing/run-platform-workflows.cjs --retail-e2e
```

El runner crea una base PostgreSQL **local y desechable**, siembra el negocio de
prueba y levanta la API, el panel y el POS. Al terminar elimina la base y los
servidores. El panel entra como dueño y los recorridos del POS como cajero,
con sus permisos reales. Rechaza bases remotas y puertos ocupados; no reutiliza un servidor desconocido.
No necesita preparar manualmente un tenant ni modificar datos de desarrollo.

## Modo manual de desarrollo (opcional)

```bash
npx playwright install chromium

pnpm --filter @gaespos/db migrate tenant onboard e2e-retail \
  -n "E2E Retail" -e dueno@e2e.local -P "E2ePruebas!2026"
```

El catálogo y las existencias se siembran solos antes de cada corrida (`siembra.ts`).
El modo manual usa `pnpm e2e` contra su base configurada; para la auditoría se usa
el runner desechable de arriba.

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
| Devolución | Devolver una pieza de una venta cobrada y que quede con folio propio |
| Promoción | Que un 20% activo se aplique solo, sin que el cajero haga nada |

## Lo que falta

Corte Z y el recorrido del cliente en la tienda.

## Dos cosas que salieron al escribirlas

**El cajero no ve la promoción hasta que cobra.** El botón de cobrar muestra el total de lista;
el descuento aparece hasta el modal de cobro, porque es el servidor quien calcula el precio real.
Funciona, pero conviene revisar si el ticket debería mostrarlo antes.

**El límite de peticiones ahoga a las pruebas.** Cada prueba entra de cero y el login permite 20
por minuto. Ese límite protege al sistema real, así que se afloja solo para el servidor que
levanta Playwright, nunca en el código.

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
