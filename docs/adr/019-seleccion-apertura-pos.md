# ADR 019 — Selección y apertura explícita en POS

## Decisión

Autenticar al cajero no abre una caja. Antes de vender se elige sucursal y caja activas y se consulta su apertura vigente. La identidad y permisos provienen de `/auth/tenant/me`; la preferencia local contiene exclusivamente IDs de sucursal/caja bajo una clave por tenant y usuario. Cada restauración vuelve a validar recursos y apertura en servidor.

La apertura exige permiso `caja.abrir`, una acción explícita y fondo inicial capturado por el cajero (cero es permitido solo si lo escribe). Un fallo o conflicto no implica éxito: se consulta nuevamente la apertura antes de habilitar venta. No se repite automáticamente una escritura. Los permisos de consulta también condicionan la UI, y el servidor conserva autoridad.

El selector usa componentes gx, controles táctiles y una columna a 360 px. Pruebas de servicio usan mocks; la verificación visual y de apertura se hace exclusivamente contra fixture aislado. No modifica caja real ni constituye certificación de hardware.

La creación de apertura se serializa bloqueando la fila de caja dentro de una transacción; todas las rutas actuales usan este servicio. La sucursal se bloquea en lectura compartida y se comprueba activa/no archivada. Dos aperturas simultáneas producen una sola apertura y conflicto409 para la restante. La UI añade un bloqueo síncrono para impedir dos envíos en el mismo ciclo. No requiere migración ni reemplaza una futura restricción estructural si aparecen escritores externos.
