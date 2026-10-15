# Validación del panel de plataforma — 15 de octubre de 2026

Ambiente: staging. Alcance: `apps/web-superadmin`; no incluye la tienda, POS, administración del negocio ni APK.

## Pantallas

Dashboard, Clientes, Roles predefinidos, Uso en vivo, Cobranza, Facturas, Suscripciones, Partners (partners/comisiones/payouts), Planes y cupones, Observabilidad, Soporte, Marketplace, Auditoría y Equipo.

- Superadministrador: 14 pantallas. Soporte predeterminado: Clientes y Soporte. Cobranza predeterminado: Clientes, Cobranza, Facturas y Suscripciones.
- Recorrido de las pantallas permitidas a 1280 y 320 px, pestañas, filtros y ausencia de errores de JavaScript o desbordamiento de la página.
- Cada una de las 14 pantallas recibe un fallo HTTP 503 sintético, muestra un error y recupera la consulta con Reintentar: 54 comprobaciones de pantalla en total.
- Formularios de alta de cliente, rol predefinido, plan, cupón, partner, payout y administrador: apertura, tamaño visible, desplazamiento y cancelación a ambas anchuras. Abrir un formulario no confirma su escritura.
- Soporte: creación de un ticket desechable, apertura desde su asunto, respuesta, cierre y comprobación de persistencia desde la interfaz móvil. La limpieza elimina exclusivamente ese ticket y sus mensajes.
- Concesiones adicionales: una sesión temporal de Soporte recibió los ocho permisos extra de consulta, pudo abrir 12 pantallas, conservó los controles de escritura bloqueados y recibió 403 al intentar cinco rutas de escritura. Se retiraron las concesiones al terminar.
- Recuperación: sin conexión, respuesta JSON inválida y espera de 30 segundos agotada. Cancelar el rechazo de un perfil no envía la validación; ese caso usa un perfil y endpoint de escritura simulados en el navegador.

## Correcciones

Una consulta fallida ya no se presenta como una lista vacía ni queda indefinidamente en Cargando. Cada pantalla dispone de recuperación y límite de espera. El contenedor también ofrece recuperación si falla su renderizado. Las respuestas antiguas de una pantalla cerrada no activan el error en la siguiente. Un 401 elimina la sesión aunque el proxy devuelva HTML.

El asunto del ticket abre su detalle, los mensajes largos ajustan sus líneas y los botones se acomodan en celular. El encabezado de Clientes admite varias filas y su texto vacío respeta los permisos. Cancelar un rechazo de Marketplace no aplica el rechazo ni inventa un motivo.

## Repetir las pruebas

Usar tres sesiones desechables con los roles predeterminados, sin concesiones adicionales. Guardarlas en un archivo privado con permisos 600: un arreglo JSON de objetos con `role` y `token`. No registrar contraseñas, tokens, secretos TOTP ni códigos de respaldo en los resultados.

```sh
PLATFORM_QA_ACCOUNTS=/ruta/privada/sesiones.json node scripts/staging/check-platform-screens.cjs
PLATFORM_QA_ACCOUNTS=/ruta/privada/sesiones.json node scripts/staging/check-platform-recovery.cjs
```

`PLATFORM_TEST_URL` permite apuntar a localhost con proxy hacia staging. Los scripts rechazan dominios de producción. Los scripts versionados no realizan cambios en datos de negocio; el flujo de creación y cierre de ticket se validó por separado con limpieza específica. Ejecutar los recorridos en secuencia para respetar el límite de peticiones de staging. Al terminar, eliminar las cuentas desechables, el ticket de prueba y los archivos privados de sesión.

No se ejecutaron cobros, anulaciones reales, transferencias a partners, cancelaciones de clientes ni jobs globales. Esas operaciones requieren una prueba separada con proveedores de pago en modo de prueba y datos aislados. Este recorrido no certifica todos los flujos del producto.
