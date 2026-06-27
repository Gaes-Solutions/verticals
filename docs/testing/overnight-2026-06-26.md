# Barrido nocturno autónomo — Vertical de Ventas — 2026-06-26

Modo: testing por navegador real (Claude in Chrome) como cada rol, sin intervención de Gaby.
Reglas: decidir con defaults, arreglar bugs claros, registrar todo. Lo ambiguo/destructivo → `BLOQUEADO`.

Tenant de prueba: **globoland** (10,001 productos seed). Contraseñas de prueba fijadas con `dev.sh setpass` = `Demo!2026`.

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
- **Estado:** sin commit (working tree), para revisión de Gaby.

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
