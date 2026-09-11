# ADR 026 — Acceso de la tienda web con llave de plataforma

- **Fecha:** 2026-09-10
- **Estado:** Aceptada (Gaby, 10-sep)

## Contexto

La tienda web (`web-tienda`, Next.js) es un BFF: habla con el API en nombre del
comprador. Para eso entraba a cada negocio con una **cuenta de servicio**: correo
y contraseña guardados en variables de Railway (`TIENDA_USER_*` y, para varias
tiendas, `TIENDA_SERVICE_ACCOUNTS`).

En producción eso significaba:

- Solo la tienda por defecto tenía credenciales, y eran las del **dueño**
  (permiso `*`). Un fallo en el BFF equivalía a poder de dueño.
- Cada negocio nuevo (registro público o "Crear cliente") quedaba con su tienda
  rota — "No se pudo cargar el catálogo" — hasta que alguien capturara a mano su
  contraseña en Railway. No escala y es inseguro.

Además, cuatro rutas del comprador exigían permisos de administración
(`categorias`, `checkout/intentos/:key`, `checkout/tienda/iniciar`,
`checkout/confirmar-mock`), y las ventas exigen un usuario real que las firme
(FK `ventas.usuario_id`).

## Decisión

Referencia: el Storefront API de Shopify (un token de tienda que solo sirve para
lo que hace un comprador).

1. **Llave de plataforma** `STOREFRONT_SERVICE_KEY`, compartida solo entre el API
   y la tienda web (variable compartida de Railway).
2. `POST /public/storefront/token` recibe la llave (header `x-storefront-key`,
   comparación en tiempo constante) y un `tenantSlug`; devuelve un JWT de 15 min
   `kind: "tienda_web"`.
3. **Usuario de sistema por negocio** "Tienda en línea"
   (`tienda-en-linea@sistema.gaessoft.invalid`): se crea solo la primera vez, sin
   roles y con contraseña aleatoria que nadie conoce. Firma las ventas en línea
   (atiende el hallazgo M3: ya no se firman a nombre del dueño). No se lista ni se
   puede editar desde Usuarios.
4. **Permiso de sistema** `ecommerce.tienda_web`: el contexto de tenant se lo da
   al token de tienda y **solo ese**, tenga el usuario los roles que tenga. No
   aparece en el editor de roles y la API rechaza asignarlo. Las cuatro rutas del
   comprador aceptan su permiso de siempre **o** este.
5. Un token `tienda_web` que apunte a una persona se rechaza (401).

## Consecuencias

- Todo negocio nuevo tiene tienda funcionando sin pasos manuales.
- Si la llave se filtra, quien la tenga puede hacer lo que un comprador en
  cualquier tienda (ver catálogo, abrir carritos y checkouts), no administrar.
  Se rota cambiando la variable compartida.
- Se eliminan `TIENDA_USER_EMAIL`, `TIENDA_USER_PASSWORD` y
  `TIENDA_SERVICE_ACCOUNTS`. Conviene cambiar la contraseña del dueño de Tienda
  Demo, que estuvo guardada en Railway.
- Despliegue: la variable debe existir en **ambos** servicios antes de desplegar
  este código; sin ella el API responde 503 y ninguna tienda carga.
