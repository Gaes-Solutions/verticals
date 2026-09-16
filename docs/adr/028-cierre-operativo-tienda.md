# ADR 028 — Cierre operativo de tienda

Fecha: 14-sep-2026. Autorización: Gaby pidió terminar reembolsos online, tarjeta móvil, videos del kiosco y entrega nativa/impresión.

## Decisiones de implementación

- Reembolso bancario: persistir intención, cuenta/proveedor originales e importe antes de llamar al proveedor. Una respuesta perdida se conserva para conciliación; no se repite un cargo/reembolso ambiguo automáticamente. Solo la confirmación del proveedor permite declarar dinero reembolsado. Mantener devoluciones parciales y separar efectos de inventario de confirmación bancaria.
- Tarjeta móvil: integrar SDK de pago compatible con Expo 53; nunca almacenar PAN/CVC ni enviarlos al API GaesSoft. La confirmación del SDK no sustituye la confirmación de pedido del servidor. Persistir identidad de intento y permitir recuperar el mismo pago.
- Kiosco: continuar ADR 021 (carga acotada, inspección del archivo, publicación inmutable y reproducción revocable). No aceptar metadatos de verificación del cliente.
- Impresión: completar transporte ESC/POS y detectar errores reales. No devolver éxito por un log. Conservar configuración por equipo, origen y autorización; validar render y transporte con destino de prueba antes de equipos físicos.
- Instalación: generar artefactos verificables en plataformas disponibles. No afirmar pruebas físicas o firma de plataformas no disponibles.

## Fuentes de contrato

- https://docs.stripe.com/api/refunds
- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/connect/authentication
- https://developers.conekta.com/reference/orderrefund
- https://docs.expo.dev/versions/latest/sdk/stripe/ (la versión se resolverá con el SDK 53 instalado)
- https://docs.expo.dev/versions/latest/sdk/video/ (misma condición de versión)
