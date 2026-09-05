# Plan — Kiosko verificador de precios + modo comercial (estilo Walmart)

> Referencia: verificadores de precio de Walmart / Sam's / Costco (el cliente escanea un
> código y ve precio; cuando nadie lo usa, muestra publicidad de los productos de la tienda).
> Sigue la regla "no recortar scope": arquitectura completa, configurable por tenant.

## 1. Qué es

Un dispositivo montado en la tienda con **dos modos**:

1. **Verificador (activo):** el cliente escanea un código de barras → pantalla grande con
   **nombre, imagen, precio vigente (con promo aplicada), y ahorro si hay descuento**.
2. **Comercial / reposo (idle):** tras N segundos sin uso, pasa a **pantalla completa con
   anuncios** — carrusel de productos destacados, promociones activas y ofertas, como
   cartelería digital (digital signage). Al escanear vuelve al modo verificador.

## 2. Hardware (el cliente compra, nosotros recomendamos certificado)

- **Tablet Android** económica (10"), montable en pared/pedestal. Modo horizontal.
- **Escáner de código de barras**, dos opciones:
  - **Cámara de la tablet** (MVP, cero hardware extra) — `expo-camera`.
  - **Escáner fijo USB/Bluetooth HID** (como los de Walmart: imager fijo que lee al
    acercar el producto) — entra como "teclado", más rápido y robusto para kiosko.
- Soporte/gabinete anti-robo + alimentación (USB/PoE).
- Opcional: bocina para feedback sonoro del escaneo.

## 3. Software — app dedicada `apps/mobile-kiosko` (Expo/RN)

App SEPARADA (no mezclar con Negocio/Cliente): UX de kiosko, siempre encendida, sin login
de persona. Reusa `@gaespos/api-client`.

- **Modo kiosko / bloqueo:** `expo-keep-awake` (no dormir), orientación horizontal fija,
  Android **Lock Task Mode** (screen pinning) para que el cliente no salga de la app.
  Bloqueo total requiere provisionar el equipo como *device owner* (MDM) — Fase 3.
- **Verificador:** escaneo → `GET /t/productos/buscar/:codigo` (endpoint YA existe) →
  muestra precio con el **mismo motor de precios/promos que el POS** (consistencia total).
- **Modo comercial (idle):** carrusel a pantalla completa. Contenido de dos fuentes:
  - **Auto** (default, cero trabajo para la tienda): promociones activas + productos
    destacados/publicados, con su foto, precio y "antes/ahora".
  - **Personalizado:** slides/videos que la tienda sube (imagen/video + duración + horario).
- **Config del dispositivo:** cada kiosko se registra a un **tenant + sucursal** con un
  **token de dispositivo** (patrón "service account", sin credenciales de persona).
- **Offline-first:** cachear catálogo/precios en SQLite local → el verificador funciona aunque
  se caiga el WiFi (crítico en piso de venta). Sincroniza en segundo plano.
- **Feedback:** beep + animación al escanear; "producto no encontrado" claro.

## 4. Backend — cambios necesarios

- **Auth de dispositivo:** nuevo modelo `kiosko_device` (o reusar service accounts) —
  token por sucursal, revocable, con `last_seen`. Endpoint de canje de token para el kiosko.
- **Endpoint de consulta para kiosko:** variante de `/productos/buscar/:codigo` que acepte
  el token de dispositivo (no requiere login staff) y devuelva {nombre, imagen, precioVigente,
  precioAntes, promo, existenciaOpcional}.
- **Módulo "Cartelería / Anuncios de kiosko":** CRUD de slides (imagen/video, texto, duración,
  vigencia por horario/día), + flag "usar auto (promos+destacados)". Gestionable desde
  web-admin y desde la app Negocio (nuevo módulo).
- **Registro y gestión de kioskos:** alta/nombre, asignación a sucursal, config remota
  (timeout de reposo, qué contenido), estado online/último visto. Sección "Kioskos".
- **Analítica:** log de escaneos (qué productos consultan más, horas pico) — dato valioso
  para el negocio y para priorizar la publicidad.

## 5. Stack / decisiones

- **App:** Expo SDK 53 + React Native (mismo stack; reusa api-client, secure-store, kit UI).
- **Escaneo:** `expo-camera` (cámara) + captura de "wedge" HID (TextInput oculto) para
  escáner USB/BT.
- **Signage:** carrusel de imágenes + `expo-video`/`expo-av` para video.
- **Kiosko lockdown:** `expo-keep-awake`, `expo-screen-orientation`, Lock Task Mode
  (config plugin / device owner en Fase 3).
- **Build:** EAS (perfil `preview` APK / `production` AAB), igual que las otras apps.
- **Multi-tenant:** token de dispositivo por tenant/sucursal (aislamiento, como el resto).

## 6. Fases

**Fase 1 — MVP verificador (demoable):**
- App kiosko: escaneo por **cámara** → consulta precio (token de dispositivo) → pantalla de
  precio grande y clara. Reposo → carrusel **auto** (promos activas + destacados).
- Horizontal, keep-awake, pinning básico. Config: tenant + sucursal + token.
- Backend: token de dispositivo + endpoint de consulta por token.

**Fase 2 — Robustez y contenido:**
- Soporte **escáner USB/BT HID**. **Caché offline** de precios (SQLite).
- Módulo **Cartelería** (slides/videos personalizados + horarios) en web-admin + app Negocio.
- **Gestión de kioskos** (registro, estado, config remota). Analítica de escaneos.

**Fase 3 — Nivel retail:**
- **Lockdown total** (device owner / MDM), **video ads**, programación por franja horaria
  (daypart), panel multi-dispositivo, actualización remota de contenido (OTA).

## 7. Consideraciones

- **Consistencia de precio:** el verificador DEBE usar el mismo pricing/promos que el POS
  (nada de precios distintos entre caja y verificador — es un tema legal/PROFECO en MX).
- **Accesibilidad:** texto grande, alto contraste, feedback sonoro.
- **Privacidad:** no captura datos del cliente; solo lee códigos de producto.
- **Costo tienda:** tablet + escáner + soporte (recomendamos modelos certificados; nosotros
  no vendemos hardware, solo lo sugerimos — misma política que el resto del hardware).

## 8. Pendiente de decidir (antes de Fase 1)

1. ¿App **dedicada** `mobile-kiosko` (recomendado) o modo dentro de la app Negocio?
2. Escaneo Fase 1: ¿**cámara** (cero hardware) o ya arrancamos con soporte de escáner USB?
3. Contenido comercial: ¿**auto** (promos+destacados) es suficiente para el MVP, o el
   cliente ya quiere subir sus propios videos/slides desde el día 1?
4. ¿Cuántos kioskos por sucursal esperan? (afecta la gestión remota).

## 9. Hallazgo técnico (31-ago) — el backend necesita 2 piezas para Fase 1
Al revisar el código: `GET /t/productos/buscar/:codigo` YA existe pero:
- Requiere login de staff con permiso `PRODUCTOS_LEER` (no sirve tal cual para un kiosko sin persona).
- Devuelve solo `precioBase`, **NO el precio vigente con promo** (usaría el motor de pricing como el POS).

Por eso Fase 1 requiere construir en backend:
1. **Auth de dispositivo (kiosko token):** modelo `kiosko_device` (token por sucursal, revocable, `last_seen`)
   + decorator `authenticateKiosko` + endpoint de canje. Migración aditiva (tabla nueva).
2. **Endpoint `/kiosko/precio/:codigo`:** valida token de dispositivo → resuelve producto por
   código/sku/barcode → corre el **mismo motor de pricing/promos que el POS** → devuelve
   `{nombre, imagen, precioVigente, precioAntes?, promoLabel?}`. Consistencia POS↔kiosko garantizada.

Orden Fase 1: (1) backend token+endpoint (con migración + tests) → (2) app `mobile-kiosko`
(cámara → precio, idle → carrusel auto) → (3) build APK → (4) prueba en 1 dispositivo.
