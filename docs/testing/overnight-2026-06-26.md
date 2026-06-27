# Barrido nocturno autónomo — Vertical de Ventas — 2026-06-26

Modo: testing por navegador real (Claude in Chrome) como cada rol, sin intervención de Gaby.
Reglas: decidir con defaults, arreglar bugs claros, registrar todo. Lo ambiguo/destructivo → `BLOQUEADO`.

Tenant de prueba: **globoland** (10,001 productos seed). Contraseñas de prueba fijadas con `dev.sh setpass` = `Demo!2026`.
Rama de trabajo: **`autonomo/ventas-veterinaria`** (NO main). Cada fix → commit + push a esa rama.

---

## 🏁 RESUMEN FINAL (leer esto primero)

**Vertical de Ventas barrida de punta a punta. 6 bugs reales arreglados + 1 feature construida, todo commiteado y pusheado a `autonomo/ventas-veterinaria`.**

### 🐛 Bugs arreglados (pusheados)
- **#1** `fix(web-pos)` Devolución y recibo mostraban `$NaN` y nombre vacío → tipos alineados al API (`totalLinea`, `snapshotProducto.nombreProducto`, `ivaTotal`, `cambioDado`).
- **#2** `fix(web-admin)` El sidebar mostraba TODOS los módulos sin importar el rol → gating por permiso de lectura + redirección a la primera sección visible.
- **#3** `fix(web-admin)` ProductosPage mostraba Nuevo/Editar/Archivar a rol de solo lectura → gating por `productos.crear/actualizar/archivar`.
- **#4** `fix(web-admin)` UsuariosRolesPage: 6 acciones de escritura sin gatear → gating por `usuarios.*`/`roles.*`.
- **#5** `fix(web-pos)` Venta con descuento 100% ($0) estaba ROTA (fallaba en silencio, mensaje falso de monedero) → mensaje "Venta sin costo" + se completa con pago $0.
- **#6** `fix(api)` Mensaje de stock insuficiente filtraba IDs internos al cajero → mensaje amigable, IDs solo en el `extra`.

### 🆕 Features construidas
- **UI de Apartados** (`web-pos`): el backend existía sin frontend. Modal completo (crear/abonar/liquidar/cancelar) con gating `apartados.*`, verificado E2E.
- **UI de Cuentas por Cobrar / CxC** (`web-admin`): el backend existía sin frontend. Nueva página (gating `cxc.*`) con resumen Por cobrar/Vencido, alta manual, detalle con abonos, registrar abono, condonar/incobrable. Verificado E2E (creé CXC-SUC-PRINCIPAL-000001 $1500 → abono $500 → saldo $1000). Commit `461157e`.
- **UI de Promociones** (`web-admin`): el backend existía sin UI de gestión. Nueva página (gating `promociones.gestionar`) con lista (tipo/vigencia/usos/estado), activar/pausar, y alta de **descuento %** sobre todo el catálogo. Verificado E2E: promo 10% creada+activada se aplica sola en la venta ($2399 → $2159.10). Commit `86bd7fe`.

### ✅ Probado y PASA
8/8 flujos de venta (cajero) · Dashboard/Ventas/Reportes (dueño) · Superadmin con 2FA · RBAC negativo (API 403 + UI gateada) · B2B cotización→pedido (48 tests) · Cobros/Links · Monedero/Gift cards · Responsive móvil · Venta sin stock bloquea bien · CxC backend (23 tests) · Promociones motor (11 tests).

### ✅ Pedidos por Gaby (2026-06-26 noche) — en curso
- **#1 POS previsualiza promo antes de cobrar — HECHO** (`e348b6b`): nuevo `POST /t/ventas/preview` + el POS muestra "Promoción −$X" y el total real antes de cobrar. Verificado: ticket Power Bank ahora muestra Total $2159.10 (no $2399).
- **#2 Implementar tipos de promo faltantes + selector** — en curso por el loop.
- **#3 Gating de escritura web-pos/web-b2b** — en curso por el loop.
- **#4/#5/#6** (descuento 100% / devoluciones netas / multi-pago) — aplicar defaults, en curso.

### 🧱 DECISIONES ORIGINALES (referencia)
2. **Tipos de promo no implementados en el motor**: `evaluarPromo` solo aplica `descuento_pct`, `happy_hour`, `precio_especial`, `dos_x_uno`. Están en el schema pero el motor NO los aplica: `descuento_monto`, `tres_x_n`, `compra_x_lleva_y`, `regalo_con_compra`, `escalonado_volumen`, `mxn`. Por eso la UI de alta se acotó a `descuento_pct`. ¿Implementar los demás en el motor?
3. **Descuento 100% / venta gratis**: hoy se permite. ¿Tope de descuento o aprobación de gerente (estilo Square)?
4. **Devoluciones no netean en reportes**: ¿"Ventas de hoy"/"más vendidos" deben ser brutos o netos de devoluciones?
5. **Multi-pago en POS**: el cobro acepta un solo método; el modelo soporta split. ¿Exponer pago dividido?
6. **Seed B2B**: para probar el portal web-b2b por navegador falta crear empresa+usuario B2B demo.
7. **Gating de escritura en web-pos/web-b2b**: audité y cerré web-admin; falta el mismo barrido en las otras 2 apps.

### ✅ UIs faltantes — YA CONSTRUIDAS
Apartados (web-pos), CxC (web-admin) y Promociones (web-admin): los 3 motores que tenían backend sin frontend ahora tienen pantalla, gateadas por permiso y verificadas E2E.

---

## ✅ Flujos PASA

| # | Rol | Flujo | Resultado |
|---|-----|-------|-----------|
| 1 | Cajero (POS :5173) | Venta completa: buscar → ticket → cantidad → descuento 10% → cobro → cambio → folio | PASA. Math OK ($4798 −10% = $4318.20, cambio $81.80). Folio SUC-PRINCIPAL-000003 |
| 2 | Cajero (POS) | Devolución por folio → 1u → reembolso efectivo | PASA **tras fix bug #1**. Folio DV-SUC-PRINCIPAL-000001 |
| 3 | Cajero (POS) | Corte X (lectura) + Corte Z (cierre con denominaciones) | PASA. Suma denominaciones OK; deslogueo tras cierre |
| 5 | Dueño (admin :5174) | Dashboard Resumen + página Ventas + Reportes | PASA. Venta del POS visible ($4318.20 cobrada), filtros canal/estado, reportes cuadran |
| 8 | Superadmin (:5176) | Login 2FA + Dashboard SaaS + Clientes | PASA. Globoland visible (Enterprise/trial). Login 2FA por navegador resuelto (ver Notas) |
| 7 | Cajero (API + admin) | RBAC negativo: 403 en acciones de dueño + gating de UI | PASA **tras fix bug #2 y #3**. Backend 403 correcto; sidebar y acciones ahora gateados |
| 6 | B2B (suite de tests) | Cotización→pedido→venta + portal + clientes-b2b | PASA. 48 tests verdes (17 cotiz/pedido + 16 portal + 15 clientes). Portal por navegador BLOQUEADO (sin seed) |

## 🐛 Bugs encontrados y ARREGLADOS

### Bug #1 — Devolución y Recibo mostraban `$NaN` y nombre vacío
- **Causa:** el frontend (web-pos) leía campos inexistentes en el detalle de venta: `l.total`, `l.descripcion`, `venta.impuestos`, `venta.cambio`. El API devuelve `totalLinea`, `snapshotProducto.nombreProducto`, `ivaTotal`, `cambioDado`.
- **Fix:** `apps/web-pos/src/lib/types.ts` (tipos alineados al API), `DevolucionModal.tsx`, `Recibo.tsx`.
- **Verificado:** en navegador, ahora muestra "Power Bank Sony Pro 1001 · $4798.00". Typecheck limpio.
- **Estado:** sin commit (working tree), para revisión de Gaby.

### Bug #2 — Sidebar de web-admin NO gateaba por permiso (viola CLAUDE.md)
- **Causa:** `apps/web-admin/src/App.tsx` renderizaba TODO el `NAV` sin filtrar. Un cajero (solo `productos.leer`, `ventas.*`…) veía Reportes, Compras, Usuarios, Seguridad, Tienda, etc. Al entrar → "Permiso requerido: …" (backend negaba bien, pero la UI ofrecía lo prohibido).
- **Fix:** agregué `perm` a cada item de `NAV` (mapeado al permiso de lectura real de cada ruta), filtro `visibleNav = NAV.filter(n => puede(n.perm))`, y un `useEffect` que redirige la sección activa a la primera visible si la actual queda oculta.
- **Verificado:** cajero ahora ve solo Productos, Inventario, Etiquetas, Ventas, Cobros, Monedero, Devoluciones; aterriza en Productos (no en el Resumen oculto). Typecheck limpio.

### Bug #3 — Acciones de escritura sin gatear en ProductosPage (patrón general)
- **Causa:** `ProductosPage.tsx` mostraba "+ Nuevo producto", "Editar", "Archivar" a roles con solo `productos.leer` (escritura → 403).
- **Fix:** `puede("productos.crear|actualizar|archivar")` condiciona cada botón; fallback "—" si no hay acciones.
- **Verificado:** cajero ve la lista en solo-lectura, sin botones de escritura.
- **⚠️ Follow-up (BLOQUEADO — sweep grande):** este patrón (botones de escritura sin gatear) probablemente se repite en otras páginas de web-admin (Inventario, Cobros, Monedero, Ventas, etc.) y en web-pos/web-b2b. Falta auditar página por página con `puede()`. Lo dejo señalado para una pasada dedicada.

## ⚠️ Hallazgos de cobertura / producto

1. **Apartados sin UI** — el backend tiene módulo completo (`apartados/{routes,service,schemas}.ts`) pero NINGUNA app de frontend tiene pantalla. El cajero tiene permiso `apartados.*` sin dónde usarlo. → **Decisión de Gaby: construir la UI** (en progreso, task #4).
2. **CxC fuera del POS** — cajero tiene `cxc.cobrar` pero el POS no lo expone; `CobrosPage` (admin) es de links de pago, no CxC formal.
3. **Multi-pago single** — el cobro del POS acepta un solo método; el modelo soporta split.
4. **Devoluciones no netean en reportes** — confirmado en Dashboard ("Ventas de hoy" bruto) Y en Reportes ("Productos más vendidos" muestra 2u de Power Bank pese a devolver 1). Si el criterio es "ventas brutas" es por diseño; si debiera ser neto de devoluciones, es un gap. No confirmado con Gaby → BLOQUEADO (decisión de producto).

### Reportes (dueño) — detalle verificado
Ventas del periodo $5,324.20 = Mostrador POS $4,567.20 + Tienda online $757.00. IVA $800.55. Ticket promedio $1,774.73. Gráfica ventas/día, top productos, ventas por canal, toggles 7/30/90 días, Imprimir/PDF. Math consistente.

## 📱 Responsive móvil (fase profundización) — PASA

Probado redimensionando Chrome al tier móvil (innerWidth 563px; bajo `sm:640` y `md:768` de Tailwind → la app ya está en su layout base/móvil). Nota: Chrome desktop no baja de ~563px de viewport, así que el test exacto a 360px no es posible vía resize de ventana, pero el tier base se ejerce igual.

- **POS (:5173):** sin scroll horizontal de página; header con los 4 botones sin desbordar; layout apila (búsqueda arriba, ticket abajo); modales (Devolución, Corte, **Apartados** nuevo) caben con padding. ✓
- **Admin (:5174):** el sidebar **colapsa a drawer con hamburguesa** + overlay; tarjetas del dashboard se apilan; tabla de **Ventas** scrollea horizontalmente DENTRO de su wrapper `overflow-x-auto` sin desbordar la página. ✓
- **Medición JS:** `documentElement.scrollWidth == clientWidth` (sin overflow de página) en POS, dashboard admin y Ventas.
- **Resultado:** sin bugs de responsive en las pantallas de ventas. Pendiente (menor): test a 360px real requeriría device-emulation (no disponible vía estas tools) — BLOQUEADO parcial, no crítico.

## 🔒 Auditoría de gating de escritura (fase profundización)

Patrón del bug #3 auditado en TODAS las páginas de web-admin.

### Bug #4 — UsuariosRolesPage: 6 acciones de escritura sin gatear
- **Causa:** `+ Nuevo usuario`, `Roles` (asignar), `Contraseña` (reset), `Desactivar/Activar`, `+ Nuevo rol`, `Editar rol` se mostraban sin verificar permiso. Un rol con `usuarios.leer`/`roles.leer` pero sin permisos de escritura veía todos los botones.
- **Fix:** `apps/web-admin/src/pages/UsuariosRolesPage.tsx` — cada acción condicionada por `puede("usuarios.crear|asignar_rol|reset_password|archivar")` y `puede("roles.crear|actualizar")`. "Ver permisos" (rol preset, solo lectura) se mantiene visible. Typecheck limpio.
- **Verificación:** code-review + typecheck (el cajero no llega a esta página por el fix #2; verificación en navegador requiere un rol custom con `usuarios.leer` sin escritura — seed pendiente, no bloqueante).

### Conclusión de la auditoría
Tras el fix del sidebar (#2), una página solo tiene hueco real si su **permiso de lectura ≠ permiso de escritura**:
- **Huecos reales encontrados y arreglados:** ProductosPage (#3), UsuariosRolesPage (#4).
- **Ya gateaban correctamente:** InventarioPage (`inventario.ajustar`), ComprasPage (`puedeCrear`), CfdiPage (`cfdi.configurar`), PedidosPage (`ecommerce.pedidos_gestionar`).
- **Sin hueco (lectura==escritura → el sidebar las cubre):** CobrosPage, MonederoPage, EnviosPage, TiendaPage, AutomatizacionesPage, ImportadorPage.

→ Gating de escritura en web-admin: **cerrado**. Pendiente (menor): mismo barrido en web-pos y web-b2b.

## 🆕 Feature construida: UI de Apartados (web-pos)

El backend de apartados existía sin frontend. Construí la UI completa y la verifiqué end-to-end en navegador como cajero globoland.

- **Dónde:** `apps/web-pos/src/components/ApartadosModal.tsx` (nuevo), botón "Apartados" en el header del POS (gated por `apartados.leer`), wired en `PosScreen.tsx`. Tipos en `web-pos/src/lib/types.ts`.
- **Funcionalidad:** dos pestañas — **Nuevo apartado** (búsqueda de producto reusando `/t/productos`, líneas con +/−, búsqueda de cliente `/t/clientes`, vigencia, pena %, abono inicial) y **Activos** (lista con saldo → detalle con líneas/abonos/total/pagado/saldo → registrar abono, liquidar, cancelar).
- **Gating:** cada acción condicionada por `puede("apartados.crear|abonar|liquidar|cancelar")`.
- **Verificado en navegador:** creé AP-SUC-PRINCIPAL-000001 ($2399, abono inicial $1000 → saldo $1399), registré abono $1399 → saldo $0, liquidé → estado **Liquidado**. Math correcto, sin NaN (usa `snapshotProducto.nombreProducto` + `totalLinea`). Typecheck limpio.
- **Estado:** commiteado y pusheado a la rama `autonomo/ventas-veterinaria` (commit feat).

### Validación adicional de apartados (cancelar + gating)
- **Cancelar:** creado AP-SUC-PRINCIPAL-000002 ($2399 sin abono) → con motivo "Cliente desistió" → estado pasa a **Cancelado**; las acciones (abonar/liquidar/cancelar) desaparecen al no estar activo. El flujo de cancelar (código que no se había ejercitado) funciona sin bug.
- **Gating verificado en ambos sentidos:** la sección "Cancelar" NO aparece para el cajero (no tiene `apartados.cancelar`, solo leer/crear/abonar/liquidar) y SÍ aparece para el dueño (`*`). Las 4 acciones de apartados quedan verificadas end-to-end.

## 🧩 Submódulos de ventas (fase profundización)

| Submódulo | Resultado |
|-----------|-----------|
| Cobros / Links de pago (admin) | PASA. Creé cobro "Anticipo decoración fiesta" $500 → link público `localhost:3001/cobro/<token>` → aparece pendiente, total Pendiente $500 correcto, acciones Copiar/WhatsApp/Cancelar |
| Monedero / Gift cards (admin) | PASA. Emití tarjeta GR-897D7F1C $250 → activa, Emitido total $250 / Saldo vigente $250 correctos |
| Cobro insuficiente (POS) | OK por código: `Confirmar` se deshabilita con `insuficiente = recibido < restante` (CobroModal) |

Pendiente: Promociones, CxC, venta de producto sin stock.

## 🧪 Casos borde del POS (fase profundización)

### Bug #6 — Mensaje crudo de stock insuficiente filtra IDs internos al cajero
- **Causa:** al vender un producto sin stock, el backend (correctamente) bloquea con `InsufficientStockError`, pero `ventas/service.ts` reenviaba `err.message` tal cual: *"Stock insuficiente: variante=glb-v-000000 sucursal=cmqgxbf6v0009…pab actual=0 intentado=1"* — IDs internos visibles al cajero.
- **Fix:** en el catch de `crearVenta`, construir un mensaje amigable *"Stock insuficiente: hay N disponible(s) y se intentó vender M."*, conservando los IDs solo en el `extra` estructurado (debug). Typecheck limpio.
- **Verificado:** en el POS el mensaje ahora es legible. La validación de stock es incondicional (no permite negativo), lo cual es correcto.

### Bug #5 — Venta con descuento 100% ($0) rota + mensaje engañoso
- **Causa:** en `CobroModal.tsx`, `cubreTodoMonedero = restante <= 0.0001` era `true` con total $0 aunque no hubiera monedero (el $0 venía de un descuento 100%). Resultado: (a) mostraba el mensaje falso "El monedero cubre el total de la venta", y (b) `confirmar()` enviaba `pagos: []`, pero el backend exige `pagos.min(1)` → la venta **fallaba en silencio** (el modal se quedaba abierto, sin error visible).
- **Fix:** separar `esGratis = total <= 0.0001` de `cubreTodoMonedero = montoMonedero > 0 && restante <= 0.0001`; mensaje propio "Venta sin costo (descuento total aplicado)"; y para satisfacer el backend, registrar un pago de $0 en efectivo cuando no hay otro pago. Typecheck limpio.
- **Verificado:** descuento 100% → mensaje correcto → Confirmar → **Venta registrada Folio SUC-PRINCIPAL-000005 $0.00**. Antes no se podía completar.
- **⚠️ Decisión de producto (BLOQUEADO — necesita Gaby):** ¿se debe PERMITIR un descuento del 100% / venta gratis? Hoy queda permitido (el descuento ya está gateado por el permiso `ventas.aplicar_descuento`). Square/Shopify lo permiten pero suelen pedir aprobación de gerente para descuentos altos. ¿Quieres tope de descuento o aprobación para 100%?

## 🤖 Notas de automatización (no son bugs de producto)

- **Login 2FA superadmin por navegador:** el TOTP (ventana 30s) caducaba por la latencia bash→navegador; varios intentos dieron "Código incorrecto". Solución fiable: generar el código con node esperando internamente al **inicio de ventana** (`timeRemaining>=27`) → da ~30s de margen → enviar inmediato. Secret en `admin_users.mfa_secret` (otplib@12.0.1). Para un humano con app autenticadora esto NO es problema; es fricción solo de automatización.
- Otros tenants en superadmin → `QA Auto *` y `QA Codex Retail`: **Codex está corriendo pruebas en paralelo** creando tenants QA. Tenerlo en cuenta al leer métricas (45 trials inflados por QA).

## 🚧 Pendientes del barrido
- [x] #8 Superadmin (:5176) dashboard/billing — PASA
- [x] #7 RBAC negativo: cajero — PASA (fixes #2, #3)
- [x] #6 Cotización → pedido B2B — PASA (48 tests; portal navegador BLOQUEADO sin seed)
- [x] #4 Construir UI de apartados — HECHO y verificado end-to-end en navegador

### ✅ Barrido original (8/8) COMPLETO. Siguiente fase: profundización
- [ ] Auditar gating de botones de escritura en TODAS las páginas (patrón bug #3): web-admin (Inventario, Cobros, Monedero, Ventas, Compras, Usuarios…), web-pos, web-b2b
- [ ] Responsive móvil de cada pantalla (≥360px)
- [ ] Otras verticales: Salud (web-clinical), Abarrotes

## 🧱 BLOQUEADO — necesita Gaby
- **Seed B2B en globoland:** para probar el portal web-b2b por navegador hace falta crear empresa B2B + crédito + lista de precios + usuario portal. ¿Quieres que el seed cree un cliente B2B demo (p.ej. "Fiestas del Valle") con usuario `compras@fiestasdelvalle.mx`? Es dato semilla, no lo invento sin tu ok.
- **Devoluciones netean en reportes:** ¿"Ventas de hoy"/"más vendidos" deben ser brutos o netos de devoluciones? (ver hallazgo #4).
- **Apartados/CxC/multi-pago:** decisiones de dónde exponerlos (ver hallazgos 1-3).

## 🔧 Pedidos de Gaby — avance
- **#1 preview de promo en POS** — HECHO (`e348b6b`).
- **#2 tipos de promo en motor + selector UI** — HECHO (`e06e193`): descuento_monto/mxn, tres_x_n, compra_x_lleva_y, escalonado_volumen. Verificado API+navegador. `regalo_con_compra` pendiente (cross-producto).
- **#3 gating web-pos/web-b2b** — en curso.
- **#4/#5/#6** — en curso (defaults).

### #3 Gating de escritura web-pos / web-b2b — HECHO
- **web-pos:** el campo de Descuento no estaba gateado; ahora va envuelto en `puede("ventas.aplicar_descuento")` (un rol con `pos.usar` pero sin ese permiso ya no lo ve). Las demás acciones (Devolución/Apartados/Corte) ya estaban gateadas.
- **web-b2b:** NO aplica gating por rol — el backend del portal B2B (`b2b-portal/routes.ts`) no diferencia capacidades por el `rol` del usuario B2B; cualquier usuario logueado puede pedir/aceptar/rechazar cotizaciones. Gatear la UI sería inventar un contrato inexistente. Si en el futuro se definen roles B2B con capacidades distintas (ej. "consulta" sin pedir), se gatea entonces. (BLOQUEADO — decisión de modelo de roles B2B.)

### #4 / #5 — decisiones aplicadas (default) y #6 pendiente
- **#4 Descuento 100% / tope de descuento — DECISIÓN: mantener permitido por ahora.** El descuento ya está gateado por el permiso `ventas.aplicar_descuento` (solo roles autorizados lo aplican). Un tope duro o aprobación de gerente sería una feature de configuración por tenant (campo `descuentoMaxPct` en config + enforcement en `crearVenta`/preview). Recomendación: añadirlo como "default personalizable" cuando se priorice; no se implementa ahora para no inventar política. (Referencia Square: descuentos altos requieren permiso/aprobación — ya cubierto parcialmente por el permiso.)
- **#5 Reportes brutos vs netos de devoluciones — DECISIÓN: mantener BRUTO (estándar).** "Ventas de hoy" y "más vendidos" reflejan ventas brutas; las devoluciones se rastrean por separado (módulo Devoluciones). Es el comportamiento estándar de POS (las ventas no se "borran" al devolver; la devolución es su propio movimiento). Si se quiere una vista neta, sería una métrica adicional en Reportes, no un cambio al actual. Documentado; sin cambio de código.
- **#6 Multi-pago (pago dividido) en el POS — EN CURSO.** El backend (`validarPagos`) ya acepta varios pagos; falta exponer en `CobroModal` agregar varios métodos que sumen el total. Se implementa en el siguiente tramo.

---

## 🏁 RESUMEN — Pedidos de Gaby (#1–#6) TODOS COMPLETOS

| # | Pedido | Resultado | Commit |
|---|--------|-----------|--------|
| 1 | POS previsualiza promo antes de cobrar | ✅ Endpoint `/t/ventas/preview` + el ticket muestra "Promoción −$X" y el total real. Verificado ($2399→$2159.10). | e348b6b |
| 2 | Tipos de promo en motor + selector UI | ✅ descuento_monto/mxn, tres_x_n, compra_x_lleva_y, escalonado_volumen. UI con selector. Verificado API+navegador. `regalo_con_compra` pendiente (cross-producto). | e06e193 |
| 3 | Gating de escritura web-pos/web-b2b | ✅ web-pos: descuento gateado por `ventas.aplicar_descuento`. web-b2b: no aplica (backend no diferencia por rol). | eac3a55 |
| 4 | Descuento 100% | ✅ Decisión: mantener (ya gateado por permiso); tope configurable recomendado para después. | 4cb8a57 |
| 5 | Reportes bruto/neto devoluciones | ✅ Decisión: mantener bruto (estándar POS); documentado. | 4cb8a57 |
| 6 | Multi-pago (pago dividido) en POS | ✅ CobroModal con varias líneas método+monto. Verificado: venta $2399 = $1200 efectivo + $1199 débito (2 pagos en DB). | fe77669 |

**Rama `autonomo/ventas-veterinaria`: ~25 commits. Producción (`main`) intacta.**
Pendiente menor para Gaby: `regalo_con_compra` (promo cross-producto), tope de descuento configurable, seed B2B para probar el portal por navegador.
