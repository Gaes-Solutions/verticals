# Plan — Que la app del Cliente se sienta la app de esa tienda

> Gaby, 9-sep: *"pide tienda y no sé qué tanto ahí... debe ser como un Mercado Libre, que puedan
> ver los productos de esa tienda, es como si fuera la app de esa tienda, ese era el punto"*.

## El problema, medido

Hoy la app del Cliente hace dos cosas que ninguna app de tienda hace:

1. **Pregunta en qué tienda estás.** El comprador no sabe el slug de la tienda; ni siquiera sabe
   qué es un slug. Es el mismo estorbo que acabamos de quitar del login del staff.
2. **Exige cuenta antes de enseñar un solo producto.** `app/(app)/_layout.tsx` redirige al login
   si no hay sesión, y en el servidor `comercio-routes.ts` protege todo el catálogo con
   `authenticateCliente`. No se puede ni mirar.

Para comparar: **la tienda web ya funciona bien**. Entra cualquiera por el dominio de la tienda,
ve el catálogo completo y solo necesita cuenta al pagar. La app móvil hoy es peor que la web, que
es exactamente al revés de lo que debería ser.

## Las dos preguntas que hay que resolver

Son independientes y se pueden atacar por separado.

### A. ¿Cómo sabe la app en qué tienda está, sin preguntar?

**A1. Una app por tienda (marca blanca).** Cada cliente tiene su APK con su nombre, su icono, sus
colores y su tienda ya fija. Es literalmente la app de esa tienda: el comprador la busca por el
nombre del negocio. Es lo que pide la frase *"como si fuera la app de esa tienda"*.

- El código es el mismo; cambian variables de compilación por cliente.
- Cuesta un build por cliente, y si van a Google Play, una ficha por cliente.
- Es lo que hacen Shopify y Square para sus comercios grandes.

**A2. Una sola app que se casa con la tienda al primer uso.** La primera vez ofrece tres caminos:
escanear un código que la tienda tiene pegado en el mostrador, abrir el enlace que la tienda
comparte por WhatsApp, o buscar la tienda por nombre. A partir de ahí no vuelve a preguntar
nunca, y se puede cambiar desde ajustes.

- Un solo APK, una sola ficha en la tienda de apps.
- Sirve para el piloto ya, y sirve de respaldo cuando alguien instala la app genérica.

**A3. Enlace profundo.** La tienda comparte `tienda.angaes.com/su-tienda`; si el comprador tiene
la app, abre directamente en esa tienda; si no, cae en la tienda web. Es el puente entre las dos.

### B. ¿Cómo se ve el catálogo sin cuenta?

Hoy no se puede. Hay que abrir en el servidor los caminos de solo lectura: catálogo, categorías,
ficha de producto y configuración de la tienda. Ya existe el precedente: `/public/storefront/resolve`
resuelve la tienda por dominio sin sesión, y de ahí come la tienda web.

El carrito vive en el teléfono mientras no haya cuenta, y se sube al servidor en el momento de
crear la cuenta o entrar. La cuenta se pide **solo al pagar**, que es cuando de verdad hace falta
un correo y una dirección.

## Lo que propongo

Hacer **B primero y A2 después**, en ese orden, porque:

- B es lo que más cambia la sensación: abres la app y ves productos, punto.
- A1 (marca blanca) reusa todo lo de B y A2: el día que quieras la app de un cliente, es el mismo
  código con la tienda ya puesta. Nada de lo que se haga ahora se tira.
- A2 resuelve el piloto sin depender de que cada cliente tenga su ficha en Google Play.

### Orden de trabajo

1. **Catálogo público en el servidor.** Endpoints de solo lectura sin sesión, con la tienda
   resuelta por slug. Respeta lo que ya existe: solo productos publicados, precios vigentes, y
   nada de costos ni márgenes. Con límite de peticiones, como el resto de lo público.
2. **La app abre en el catálogo, no en el login.** Se quita la redirección; las pantallas de
   cuenta, pedidos y favoritos piden sesión solo al entrar a ellas.
3. **Carrito anónimo.** Vive en el teléfono; al crear cuenta o entrar, se sube.
4. **Cuenta solo al pagar.** El botón de pagar lleva a crear cuenta o entrar, y regresa al pago.
5. **Elegir tienda sin escribir.** Escaneo de código, enlace compartido y búsqueda por nombre.
   Se guarda y no se vuelve a preguntar.
6. **Marca blanca (cuando haya cliente que la pida).** Un build por tienda con su nombre, icono,
   color y tienda fija.

### Lo que hay que cuidar

- **Aislamiento.** Los endpoints públicos no pueden filtrar nada de otro tenant, ni costos, ni
  existencias si el negocio no quiere. Mismo criterio que se aplicó al kiosko.
- **Enumeración.** Un catálogo público permite que la competencia baje precios. Es inherente a
  tener tienda en línea, igual que la web. Se acota con límite de peticiones.
- **Precio consistente.** El precio que ve el comprador debe salir del mismo motor que el punto
  de venta, como ya hace el kiosko. Tema PROFECO.

## Recomendación (9-sep)

### El hallazgo que la cambia

**La tienda web ya es instalable.** Tiene `manifest.webmanifest` y service worker: un comprador
puede darle "agregar a pantalla de inicio" y le queda un icono como cualquier app, sin pasar por
Google Play.

Lo que falla es que el manifiesto está **fijo**: dice *"Tienda GaesSoft"* con un icono genérico.
Así que hoy al comprador le queda en su teléfono un icono que dice "Tienda", no el nombre del
negocio. Y eso es exactamente lo que Gaby quiere evitar.

Hacerlo por tienda es barato: Next.js puede generar el manifiesto según el dominio, con el
nombre, el logo y el color de ese negocio.

### El orden que recomiendo

**1. Catálogo sin cuenta.** Va primero pase lo que pase: lo necesitan los tres caminos.

**2. Manifiesto por tienda en la web.** Con esto, cada cliente tiene "su app" el mismo día: el
comprador entra por el enlace que la tienda le manda, le da agregar a inicio, y le queda el icono
del negocio con su nombre. Cero fricción de instalación, cero revisión de Google, y funciona en
iPhone y Android por igual. Para una tienda de barrio esto **es** la app de la tienda.

**3. Una sola app nativa, con la tienda elegida al primer uso.** La nativa aporta lo que la web
no: notificaciones push confiables, cámara para escanear, y trabajar sin señal. Va para el
piloto y para quien quiera app de verdad.

**4. Marca blanca por tienda, como nivel de pago.** Cuando un cliente la pida y esté dispuesto a
pagarla.

### Por qué NO arrancar con la marca blanca

- **Cuesta operación permanente.** Una ficha en Google Play por cliente, con su revisión, sus
  capturas, su aviso de privacidad. Y cada actualización se revisa por separado, en cada ficha.
  Con cinco clientes se aguanta; con cincuenta se vuelve un trabajo de tiempo completo.
- **Nadie busca una tienda de barrio en Google Play.** El comprador llega porque la tienda le
  mandó el enlace por WhatsApp o vio el código en el mostrador. Ese camino lo resuelven igual de
  bien el paso 2 y el 3, hoy y sin esperar revisiones.
- **Es un buen argumento de venta, no un requisito del piloto.** Guardarla como nivel superior le
  da valor. Regalarla desde el día uno la vuelve costo fijo.

Nada de esto se contradice: los cuatro pasos comparten el mismo código, y el cuarto es el
tercero con la tienda ya puesta.
