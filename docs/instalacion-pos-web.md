# POS desde el navegador

El POS web tiene un manifiesto con nombre, iconos y apertura en ventana propia. Sigue necesitando conexión para verificar la sesión, consultar importes y registrar ventas. No se agregó caché de respuestas del API ni un modo de venta sin conexión.

## Para la entrega al cliente

1. Publicar la versión verificada del POS en su dirección HTTPS y aplicar antes las migraciones/API requeridas. La dirección local de pruebas no es una entrega comercial.
2. Abrir esa dirección en un navegador compatible y usar su opción de instalar la aplicación o agregarla al inicio/escritorio.
3. Iniciar sesión, elegir sucursal y caja, confirmar apertura y completar el ensayo operativo del dispositivo antes de entregar.

La opción exacta de instalación varía por navegador y sistema. Tener manifiesto no certifica todas las plataformas, impresión, lectores ni uso sin red. La documentación de [MDN sobre instalación](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) explica requisitos y compatibilidad. Un service worker no es requisito universal de instalación; aquí no se utiliza para conservar datos de ventas.

## Verificado localmente

El navegador leyó y analizó `manifest.webmanifest` sin errores, incluyendo alcance, inicio, nombre y ambos iconos. La interfaz local no expuso la comprobación completa de instalabilidad. La instalación real en Windows/macOS/Linux/Android/iOS sigue pendiente; no se creó ningún acceso instalado con datos de prueba en el sistema del usuario.

Esto complementa el contenedor Tauri de `apps/pos-desktop`; no sustituye sus pruebas de impresión, SQLite y empaquetado nativo.
