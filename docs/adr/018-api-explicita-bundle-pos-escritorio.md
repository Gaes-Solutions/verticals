# ADR 018 — API explícita y CSP derivada para el POS de escritorio

Fecha: 2026-09-08. Estado: aceptada para preparación de empaquetado; instalación nativa pendiente de certificación.

El POS web usa `/api` por defecto con el proxy de su host. Un bundle Tauri carga recursos locales y no tiene ese proxy. El destino de API de una distribución de escritorio debe ser una decisión explícita de quien la construye, sin inferir dominios del equipo de desarrollo.

Los scripts oficiales de build de `pos-desktop` exigen `GAESPOS_API_BASE`: URL absoluta HTTPS, sin credenciales, query ni fragmento. El valor normalizado se entrega a Vite como `VITE_POS_API_BASE`. El POS web mantiene su comportamiento relativo por defecto; el cliente web implementa y valida esa opción en su propio cambio.

El script deriva `connect-src 'self' <origen HTTPS exacto>` y conserva las otras directivas de CSP. No conserva otros dominios de API, localhost ni comodines para el build de distribución. La sobreescritura se escribe en un directorio temporal del sistema, fuera del repositorio, se pasa como un argumento separado `--config` a Tauri y se elimina al finalizar. No se interpolan URL ni rutas en un shell.

Desarrollo continúa con el proxy localhost existente; no necesita esta variable de distribución. La configuración base del repositorio no se transforma en una excepción de seguridad amplia. No se cambian aquí CORS del servidor, permisos nativos, almacenamiento de credenciales ni SQLite.

Un origen HTTPS explícito no prueba por sí mismo propiedad, disponibilidad o compatibilidad de la API. Antes de entregar se debe comprobar el endpoint elegido, los orígenes de Tauri admitidos por CORS, login, ventas, periféricos, firma y actualización en cada sistema. Sin Rust/WebKitGTK solo se verifican configuración, validaciones y composición de argumentos; no se certifica un instalador.
