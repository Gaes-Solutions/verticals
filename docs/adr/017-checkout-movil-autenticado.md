# ADR 017 — Checkout móvil autenticado y recuperación de intentos

Fecha: 2026-09-08. Estado: aceptada para OXXO/SPEI mediante Conekta.

La fachada de comercio deriva tenant, cliente y correo del JWT validado y del perfil servidor. Solo recibe carrito propio `mobile`, forma de entrega y un UUID preparado por el servidor. Ese UUID se deriva de tenant/cliente/carrito, por lo que un cambio de clave no crea otro intento para el mismo carrito. Su conocimiento no autoriza consultas: se comprueba propietario `cliente:<id>` en el schema del tenant.

Se reutilizan el claim durable, bloqueo de carrito, snapshot comercial, cálculo de tarifa/cupón y consulta autoritativa del checkout existente. GET de intento y recuperación del último nunca inician un cobro. POST repetido recupera el intento existente antes de consultar proveedor. PROCESSING/UNCERTAIN no habilitan otra clave ni un nuevo cobro. Preparar UUID no inicia pago.

La cotización toma el subtotal del carrito servidor. Envío requiere tarifa aplicable y domicilio validado; recogida requiere sucursal habilitada. No se aceptan precios, tenant, cliente, proveedor ni datos fiscales en el cuerpo.

Solo se anuncian OXXO/SPEI cuando Conekta está configurado. No hay fallback mock móvil ni capacidades Stripe anunciadas. Tarjeta requiere una integración posterior con tokenización segura/checkout alojado; el proveedor actual no expone URL alojada. Las referencias son texto, nunca navegación automática. Pago pendiente no vacía carrito ni se anuncia confirmado.

Para asentar una confirmación síncrona se selecciona antes de iniciar el pago el primer usuario de negocio activo (createdAt/id asc), alineado al webhook Conekta existente. La identidad de comprador queda separada en clienteId y requestedBy. Este actor operativo no representa una acción manual del empleado; una identidad de sistema dedicada es mejora de auditoría pendiente. Sin usuario activo se rechaza antes de contactar proveedor.

## Auditoría de cierre y disponibilidad

Los nuevos intentos públicos (móvil y BFF web mediante `/t/checkout/tienda/iniciar`) fuerzan una política interna `requirePublicStore`, nunca una opción del comprador. Dentro de la transacción del snapshot se bloquean en lectura compartida configuración, publicación, producto y variante y se comprueba tienda activa y artículos públicos comprables. El punto de aceptación es el snapshot confirmado; cerrar la tienda después no cancela retroactivamente pagos ya aceptados. La recuperación y el replay existentes siguen funcionando al cerrar la tienda. La ruta interna de checkout conserva su contrato para usos fuera de la tienda pública.

El POST móvil tiene cuota de 30 solicitudes por minuto por tenant y cliente autenticado, adicional al límite general. El catálogo conserva precios informativos; el importe congelado del carrito y su snapshot es el contrato del intento existente. No se regeneran intentos ambiguos para cambiar disponibilidad o precios.
