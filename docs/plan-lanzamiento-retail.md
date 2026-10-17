# Plan de lanzamiento comercial de GaesSoft Retail

Objetivo: comenzar a vender la vertical de tienda lo antes posible sin poner en riesgo los datos ni la operación de los primeros comercios.

## Alcance del primer lanzamiento

- Alta de tenant y usuario administrador.
- Catálogo, imágenes, precios, inventario y publicación.
- Tienda web con subdominio y dominio propio verificado.
- Carrito, checkout y configuración de cobro disponible.
- Panel administrativo y POS/kiosko.
- Recuperación de contraseña y correo transaccional.
- Respaldos diarios y registro de incidentes.

Salud, marketplace y módulos no necesarios para Retail quedan fuera del primer piloto.

## Fase 0 — Preparar la plataforma

**Estado actual:** PostgreSQL y Redis de staging están creados en Railway. El API de staging está terminando su build.

Antes de probar usuarios reales:

1. API de staging en estado `SUCCESS` y `/health` responde 200.
2. Aplicar migraciones master y seed administrativo.
3. Crear un tenant de prueba y verificar que no usa producción.
4. Configurar los cinco frontends con sus Dockerfiles y `API_UPSTREAM`.
5. Confirmar que las imágenes de productos usan almacenamiento persistente.
6. Configurar `BREVO_API_KEY` y un `EMAIL_REMITENTE` verificado en staging; probar recuperación de contraseña.

**Criterio de salida:** una instalación limpia arranca desde cero sin intervención manual en la base de datos.

## Fase 1 — Pruebas de aceptación

| Flujo | Resultado esperado |
|---|---|
| Alta de tienda | Tenant, usuario y permisos creados; aislamiento verificado |
| Inicio de sesión | Login, refresh, cierre de sesión y recuperación funcionan |
| Producto | Alta, edición, imagen, precio, existencia y publicación |
| Dominio | Subdominio funciona; dominio propio requiere verificación DNS |
| Compra | Catálogo → carrito → checkout → pedido consistente |
| Pago no disponible | Mensaje claro; nunca pide tarjeta si no hay proveedor |
| Inventario | Venta descuenta existencia y evita cantidades imposibles |
| POS/kiosko | Escaneo, beep/vibración, cobro y sincronización |
| Incidente | Error queda registrado y llega aviso al correo configurado |
| Respaldo | Backup válido y restauración de ensayo comprobada |

**Criterio de salida:** cero errores críticos, ningún acceso cruzado entre tenants y todos los flujos documentados.

## Fase 2 — Piloto comercial

Elegir una tienda controlada, por ejemplo Gaesland, durante 3–7 días.

- Usar un dominio de prueba o subdominio dedicado.
- Cargar productos reales, evitando datos sensibles innecesarios.
- Registrar cada incidencia con pasos para reproducirla.
- Hacer un respaldo antes y después de cada cambio de esquema.
- Revisar diariamente errores, pedidos, inventario y tiempos de respuesta.

**Criterio de salida:** una semana sin pérdida de pedidos, cobros duplicados, errores de aislamiento ni caída que bloquee ventas.

## Fase 3 — Producción

1. Promover exactamente el commit aprobado en staging.
2. Configurar variables de producción con secretos distintos.
3. Ejecutar migraciones con respaldo previo.
4. Configurar dominio, TLS, correo y proveedor de cobro real.
5. Ejecutar smoke test inmediatamente después del despliegue.
6. Mantener rollback al tag SHA anterior durante la primera semana.

Producción no se declara lista mientras el build de `web-pos`, las migraciones y los smoke tests no estén en verde.

## Fase 4 — Comercialización

- Paquete de alta: tenant, dominio, catálogo inicial y capacitación.
- Lista de precios y condiciones de soporte.
- Manual corto para administrador y cajero.
- Formulario de alta y checklist de activación.
- Soporte y monitoreo de incidentes con responsable y horario.

## Puerta de lanzamiento

- [ ] Staging probado con la matriz de aceptación.
- [ ] Build de las cinco aplicaciones en verde.
- [ ] API y frontends desplegados en producción.
- [ ] Dominio y HTTPS comprobados.
- [ ] Correo de recuperación probado.
- [ ] Cobro real probado o deshabilitado con mensaje claro.
- [ ] Backup diario y restauración de ensayo comprobados.
- [ ] Rollback documentado.
- [ ] Tenant del cliente aislado y creado con datos mínimos.
