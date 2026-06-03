# Hito 4 — Digital y marketing

> **Estado:** 🎉 **HITO 4 COMPLETO** (2026-05-27) · 4.1 Ecommerce ✅ · 4.2 Marketing ✅ · 4.3 Doctoralia ✅ · 4.4 Portal paciente PHR ✅ · 4.5 Demo ✅ · 476 tests verde
> **Análisis:** [4.21 Ecommerce](../analisis/04-modelo-datos/4.21-ecommerce.md) · [4.18 Promociones/Marketing](../analisis/04-modelo-datos/4.18-promociones-marketing.md) · [4.17 Portal Doctoralia](../analisis/04-modelo-datos/4.17-portal-doctoralia.md) · [Flujo 7 Paciente portal](../analisis/03-flujos/07-paciente-portal.md) · [Análisis 7 Integraciones](../analisis/07-integraciones.md)

## Objetivo del Hito 4

Capa digital de cara al cliente final: tienda online, marketing multicanal y portal público de salud. Es el primer hito con **frontend real** (Next.js) además del backend.

Cierre del Hito 4 = tienda online operativa + campañas WhatsApp/email + Doctoralia funcional.

## Decisiones de arranque (confirmadas con Gaby 2026-05-26)

- **Orden**: Ecommerce primero (4.1), luego Marketing (4.2), luego Doctoralia (4.3), luego Portal paciente (4.4).
- **Frontend**: la tienda se construye como **Next.js real** (`apps/web-tienda`) — primer frontend del proyecto.
- **Integraciones externas**: **mock adapters V1** (mismo patrón que `@gaespos/fiscal`/`recargas`/`ai`): interface + MockProvider determinista + cliente real stub. Aplica a WhatsApp Cloud, Twilio SMS, Daily.co, pagos (Stripe/Conekta).
- **Email**: **Resend** (transaccional + campañas) con React Email para plantillas.

## Orden sub-hitos

| Sub-hito | Pieza | Modelo | Razón orden |
|----------|-------|--------|-------------|
| **4.1** | Ecommerce + tienda Next.js | 4.21 | Lo más tangible, reusa productos/inventario/precios. Primer frontend. |
| 4.2 | Marketing (promos + RFM + campañas) | 4.18 | Backend, reusa clientes/ventas. Alimenta recovery de carrito abandonado de 4.1. |
| 4.3 | Doctoralia + telemedicina | 4.17 | Portal público médicos cross-tenant + Daily.co + reseñas portables. |
| 4.4 | Portal paciente | Flujo 7 | PHR unificado + marketplace + telemedicina + gestión familiar. |
| 4.5 | Demo Hito 4 | — | Tienda online + Doctoralia + campañas WhatsApp end-to-end. |

---

## 4.1 Ecommerce (Modelo 4.21)

**Decisión clave del análisis**: `pedidos_ecommerce` ≠ `ventas`. Al confirmar pago, el pedido ecommerce genera una `Venta` (canal=ecommerce) con vínculo bidireccional. Ciclo de vida ecom (recibido→pago_confirmado→preparando→enviado→en_camino→entregado/recogido) no contamina el modelo de ventas POS.

### 4.1.a Schema ecommerce tenant + migration
- [x] `ConfigTiendaEcommerce` singleton — activa, subdominio, nombre/lema/SEO, idiomas, branding override, monedas, paisesEnvio, políticas HTML, whatsappWidget, tags GA4/Meta, modo [b2c|b2b_only] V1, mostrarInventarioPublico+buffer, guestCheckout, requiereAprobacionClienteNuevo
- [x] `ProductoPublicado` — subset de Producto (4.7) con tituloPublico/slugSeo, descripciones markdown, meta SEO, fotosArray, videoUrl, precioPublicoOverride+precioPromocion+vigencia, atributosPublicos JSONB, tags, rankingScore, destacadoHome, nuevo (auto <30d), agotado auto, relacionados/cross-sell
- [x] `CategoriaPublica` — árbol distinto del POS interno + slug SEO
- [x] `ProductoTraduccion` schema desde V1 (UI editor V2)
- [x] `CarritoEcommerce` — sessionIdAnonimo (cookie) + clienteId nullable + emailAnonimo + canal [web|mobile|whatsapp] + items JSONB con precioSnapshot + totales + cupones/promos + dirección + métodoEnvío+costo + métodoPago + status [activo|abandonado|convertido|expirado] + abandonadoAt + recordatorio24h/72h + recoveryCodigo (cupón auto) + convertidoAPedidoId + ip/UA/referrer/utm
- [x] `PedidoEcommerce` — folioPublico GP-NNNNNNNN + carritoOrigenId + totales+moneda+TC + cupones snapshot + direccionEnvio/factura snapshot JSONB + requiereFactura+datosFactura + statusPago + paymentIntentId + methodEnvio [paqueteria|click_collect|envio_local] + sucursalPickupId + paqueteria+guiaTracking+costoEnvioReal + statusPedido [recibido|pago_confirmado|preparando|enviado|en_camino|entregado|recogido|cancelado] + ventaIdGenerada + facturaCfdiId + timestamps por estado
- [x] `PedidoEcommerceEvento` — timeline con visibleCliente bool para tracking público
- [x] `ZonaEnvio` (cps/estados incluidos) + `TarifaEnvio` (paqueteria, tipoCalculo [fija|por_peso|por_monto] V1 fija, escalonPeso, montoMinimoEnvioGratis) + `EnvioPedido` (guiaTracking, etiquetaUrl, costoReal vs cobrado, statusExterno, eventosExternos, evidenciaEntrega)
- [x] `ProductoResena` — verificación obligatoria por pedidoId (solo entregado/recogido), rating 1-5, título, comentario, imágenes, moderación IA V1 (reusa `@gaespos/ai`), respuestaTienda, verificadaPorCompra
- [x] `Wishlist` + `WishlistItem` — V1 default "Mi lista", publica bool + slug compartible
- [x] `ConfigPickupSucursal` + `PickupPedido` — click&collect V1 (horario, tiempoPreparacion, requiereId, notificacionListo)
- [x] `SeoConfiguracionTienda` — robots, sitemap, redirects 301, structured_data, verifications, canonical
- [x] Permisos ecommerce: ECOMMERCE_CONFIGURAR, PRODUCTOS_PUBLICAR, PEDIDOS_ECOMMERCE_LEER/GESTIONAR, RESENAS_MODERAR, ENVIOS_GESTIONAR
- [x] Migration `add_ecommerce` cross-tenant

### 4.1.b Backend: catálogo publicado + carrito + checkout + tracking
- [x] `apps/api/.../ecommerce-config/` — PUT config tienda, gestión productos publicados/categorías públicas/SEO
- [x] `apps/api/.../carrito/` — crear/actualizar carrito (anónimo por sessionId o cliente), recalcular totales (reusa motor pricing), aplicar cupón
- [x] `apps/api/.../checkout/` — iniciar checkout → crear PaymentIntent (provider) → webhook confirma → `PedidoEcommerce` pago_confirmado → genera `Venta` canal=ecommerce + descuenta stock + CFDI si requiereFactura → eventos timeline
- [x] `apps/api/.../pedidos-ecommerce/` — listado tenant (gestión), transiciones estado (preparando→enviado→...), tracking público `GET /seguimiento/{folio}?email=` sin auth
- [x] `apps/api/.../resenas/` — crear (valida pedido entregado), moderar IA, responder
- [x] `apps/api/.../wishlists/` — CRUD simple
- [x] Endpoint catálogo público (sin auth, resuelve tenant por subdominio/header): productos publicados paginados + filtros + detalle por slug

### 4.1.c Paquetes adapters: pagos + email
- [x] **`@gaespos/pagos`** — `PaymentProvider` interface (createIntent, confirm, refund, webhook verify) + `MockPaymentProvider` determinista + `StripeClient` stub + `ConektaClient` stub (OXXO Pay/SPEI). Plugin Fastify factory.
- [x] **`@gaespos/email`** — `EmailProvider` interface (send, sendTemplate) + `MockEmailProvider` (captura en memoria para tests) + `ResendClient` stub. Plantillas base (confirmación pedido, envío, recovery carrito).

### 4.1.d Frontend `apps/web-tienda` (Next.js — primer frontend)
- [x] Scaffold Next.js 15 (App Router) + TanStack Query + Tailwind + shadcn/ui, multi-tenant runtime (resuelve subdominio), ISR catálogo 5min
- [x] Páginas V1: home/catálogo (grid), producto (galería+reseñas), carrito (localStorage), checkout (dirección+pago mock), confirmación+seguimiento público. Carrito en localStorage + persiste en DB al checkout.
- [x] **Catálogo navegable** (2026-05-28): búsqueda (`q`) + filtros por categoría (chips) + sección destacados en home. Smoke verde (q/categoría/destacado filtran).
- [ ] Diferido (requiere auth cliente B2C nuevo): cuenta cliente (pedidos+wishlist UI) + login/registro cliente

### 4.1.e Tests integración + e2e
- [x] Backend: config tienda, publicar producto, carrito anónimo→cliente, checkout mock pago→pedido→venta+stock+CFDI, tracking público por folio+email, reseña solo si pedido entregado, wishlist, click&collect, RBAC (14 tests verde)
- [ ] Frontend e2e Playwright del flujo comprar — diferido (frontend verificado por build + arranque live + curl al catálogo/producto/carrito en sesión 2026-05-26)

### 4.1.f Diferidos V1.5+
- Cotización automática paqueterías (FedEx/Paquete Express) + generación de guías + label ZPL (V1 = tarifas fijas)
- Reservas inventario al carrito (V1 = buffer + valida al pago)
- Productos digitales, dominio propio, multi-idioma editor UI, modo mixto b2c+b2b

---

## 4.2 Marketing (Modelo 4.18)

**Decisiones (confirmadas 2026-05-26)**: las 5 piezas completas V1 · worker de envíos in-process (patrón alarmas medicación, V1.5 → BullMQ) · plantillas dual-scope (catálogo global master pre-aprobado Meta + plantillas propias del tenant). Mensajería WhatsApp/SMS = mock adapters; email = `@gaespos/email` (Resend).

### 4.2.a Schema marketing tenant + master + migration
- [x] `Promocion` (tipo [2x1/3xn/mxn/compra_x_lleva_y/descuento_pct/descuento_monto/precio_especial/regalo/escalonado_volumen/happy_hour], condiciones+acciones JSONB, vigencia, horarios happy hour, canales [pos/ecommerce/b2b/todos], stackeable, prioridad, límites uso total/cliente, requiereCodigo+codigo, status) + `PromocionProducto` (rol incluido/excluido/regalo/comprado/requerido) + `PromocionAplicacion` (trazabilidad por venta, revocada_at)
- [x] `SegmentoCliente` (tipo [estatico/dinamico_rfm/dinamico_query], definicion JSONB thresholds RFM, count denormalizado) + `SegmentoClienteMiembro` (snapshot métricas) + `ClienteMetricasRfm` (score R/F/M 1-5, segmento_rfm_calculado [champion/leal/en_riesgo/perdido/nuevo/hibernando], refresh nightly)
- [x] `Campana` (objetivo, canal [whatsapp/email/sms/push/multi], segmentoId, plantillaId, tipoDisparo [inmediato/programado/recurrente/trigger_event], ventana horario, status, stats JSONB, presupuesto_max_creditos) + `CampanaEnvio` (cola: clienteId, canal, status [pendiente/enviado/entregado/abierto/click/convertido/opt_out/bounce], creditos) + `CampanaTrigger` (evento + frecuencia max/cliente/30d)
- [x] `PlantillaMensaje` **dual-scope**: master DB catálogo global pre-aprobado Meta (transaccional/utility) + tenant `plantillas_mensajes` (promocional, aprobacion_meta_status, handlebars, scope [gaessoft_global/tenant_propia])
- [x] `ClienteOptOut` (canal + tipo [promocional/todo]; transaccional siempre permitido LFPDPPP)
- [x] `LoyaltyProgram` (tipo [puntos_por_peso/visita/tiers/mixto], regla_acumulacion JSONB, valor_punto_redimible, caducidad_meses, tiers JSONB modelados V1 off) + `ClienteLoyalty` (puntos_actuales, lifetime, tier) + `LoyaltyMovimiento` (tipo [acumulacion/canje/expiracion/ajuste/reverso], saldo snapshot, caduca_at FIFO)
- [x] Permisos: PROMOCIONES_GESTIONAR, SEGMENTOS_GESTIONAR, CAMPANAS_GESTIONAR/ENVIAR, LEALTAD_GESTIONAR, PLANTILLAS_GESTIONAR
- [x] Migration `add_marketing` (tenant) + `add_plantillas_globales` (master)

### 4.2.b Paquete `@gaespos/mensajeria` (WhatsApp + SMS mock adapters)
- [x] `MessagingProvider` interface (enviarPlantilla, enviarTexto, estadoEnvio) + `MockWhatsappProvider` + `MockSmsProvider` deterministas + `WhatsappCloudClient`/`TwilioClient` stubs. Render handlebars. Plugin Fastify factory por canal.

### 4.2.c Motor de promociones (integra a pricing)
- [x] Extender motor pricing (`@gaespos/pricing` o capa en venta) con promociones automáticas como capa de descuento con `prioridad`, respetando stackeable/canales/vigencia/horarios. `aplicarPromociones(ticket, contexto)` → PromocionAplicacion. Tipos V1: 2x1, descuento_pct, descuento_monto, mxn, precio_especial, happy_hour.
- [x] Integración en `crearVenta` (POS + ecommerce): registra PromocionAplicacion, revoca al cancelar venta.

### 4.2.d Segmentación RFM
- [x] Service `recalcularRfm(client)` nightly: computa R/F/M por cliente desde ventas, asigna segmento. Segmentos predefinidos V1 (champion/leal/en_riesgo/perdido/nuevo/hibernando) + filtros simples. Endpoints CRUD segmentos + listar miembros.

### 4.2.e Campañas + worker envíos in-process + triggers
- [x] Service campañas: crear, programar, encolar envíos por segmento. `procesarColaEnvios(client, providers)` in-process (como `escanearKardex`): toma CampanaEnvio pendientes respetando ventana horario + opt-outs + presupuesto → envía via mock provider → actualiza status + stats. `evaluarTriggers(client, evento)` (post-venta/post-cita/carrito abandonado 24h) encola campañas trigger.
- [x] Atribución conversión: al cerrar venta, cruza CampanaEnvio del cliente (click ≤7d directa, envío ≤48h asistida).

### 4.2.f Lealtad (puntos lineales V1)
- [x] Service: inscripción (con consentimiento LFPDPPP), acumular al cobrar venta (regla puntos×peso), canjear (valida saldo, FIFO caducidad), movimientos audit. Tiers modelados pero off V1.

### 4.2.g Tests integración
- [x] Promos (2x1, happy hour por horario, stackeable, límite por cliente), RFM (cálculo champion vs perdido), campaña→cola→worker envía via mock→stats, opt-out bloquea promocional pero no transaccional, trigger carrito abandonado, lealtad acumula+canjea+caducidad, atribución conversión.

### 4.2.h Diferidos V1.5+
- Constructor visual de segmentos (V2), referidos C2C (V2), tiers de lealtad activos (V2), BullMQ real para envíos, WhatsApp/SMS reales (cuando Gaby contrate Meta/Twilio).

---

## 4.3 Portal Doctoralia (Modelo 4.17, master DB)

**Decisiones (confirmadas 2026-05-27)**: núcleo V1 = perfiles cross-tenant + búsqueda + reseñas portables (reservas portal→tenant y telemedicina Daily.co → 4.3 fase 2) · `PacienteMaster` mínimo en master DB (cimiento del PHR para 4.4) · búsqueda FTS + filtros ciudad/estado/especialidad (PostGIS geoespacial → V1.5) · solo API V1 (frontend portal → demo 4.5).

**Por qué master DB**: la búsqueda y las reseñas son cross-tenant (un paciente busca médicos de cualquier consultorio). Reseñas portables siguen al médico (`PublicProfessional`), no al tenant → si cambia de consultorio, sus reseñas viajan con él. Es el efecto Doctoralia.

### 4.3.a Schema master Doctoralia + migration ✅
- [x] `PacienteMaster` mínimo — id, nombre, apellidos, email único, teléfono, otpVerificadoAt, soft delete. Cimiento PHR (4.4 lo expande con FHIR).
- [x] `PublicProfessional` — tenantIdPrincipal + tenantIdsAdicionales JSONB + **medicoIdLocal** (link al `Medico` del tenant, `@@unique(tenantId, medicoIdLocal)`), tipo [medico_humano/veterinario/dentista/nutriologo/psicologo], nombrePublico, slugSeo único auto, cédula+especialidad, validadaSsaAt/validadaPorAdminAt, foto, bio corta/larga, añosExperiencia, idiomas, atiendeNiños/Adultos, aceptaTelemedicina/mismoDia, status [borrador/en_revision/publicado/suspendido/desactivado], scorePromedio+totalReseñas denormalizado, feePlataformaPct (default 5%), soft delete
- [x] `PublicProfessionalLocation` — professionalId, tenantId, nombreLugar, direccion, lat/lng (Decimal V1, PostGIS V1.5), ciudad/estado/colonia/cp, teléfono, horario JSONB, esPrincipal, activa
- [x] `PublicReview` — professionalId, bookingId opcional V1 (verificación por pacienteMasterId verificado + flag verificada si hay booking), pacienteMasterId, ratingGeneral 1-5 + subratings, comentario, moderacionStatus [pendiente/auto_aprobado_ia/revision_humana/publicado/rechazado/denunciado_medico], moderacionIaScore JSONB, arcoAnonymizedAt (campo listo; endpoint ARCO → 4.4), respuestaMedico, helpful/reportada count. **Portables al médico.**
- [x] `PublicProfessionalSearchIndex` (tabla denormalizada) — professionalId, searchText (nombre+especialidades+ciudad+estado normalizado), ciudad/estado, scoreRanking (score × boost log(reseñas)), aceptaTelemedicina/mismoDia, idiomas/niños/adultos. Refresh al publicar/actualizar/recalcular score; se borra si no está publicado.
- [x] 6 permisos: DOCTORALIA_PERFIL_GESTIONAR/PUBLICAR + RESENAS_LEER/RESPONDER/DENUNCIAR (rol `medico` preset) + ADMIN_VALIDAR. Médico edita su perfil via JWT tenant; admin GaesSoft valida via auth admin.
- [x] Migrations `add_doctoralia` + `add_doctoralia_medico_link` (master)

### 4.3.b Servicios + endpoints públicos ✅
- [x] `apps/api/.../doctoralia/` 3 plugins: **tenant** (bajo `/t`, médico gestiona su perfil/ubicaciones/reseñas vía `medicoIdLocal`), **admin** (`authenticateAdmin`: cola pendientes, validar cédula+publicar, suspender, moderar reseñas), **público** (sin auth).
- [x] Búsqueda pública `GET /doctoralia/buscar` — FTS por searchText (contains insensitive V1) + filtros ciudad/estado/tipo/aceptaTelemedicina/niños + orden scoreRanking. Detalle por slug `GET /doctoralia/profesionales/:slug` (solo publicados).
- [x] Reseñas: crear (verifica `PacienteMaster.otpVerificadoAt`, **moderación heurística determinística** — spam/ofensivo/contacto → revision_humana, limpio → publicado; reemplazable por IA sin tocar callers), responder/denunciar (médico), moderar (admin). Recalcula scorePromedio+totalReseñas. Anti-duplicado por paciente.
- [x] Auth dual: paciente por registro+confirmación (OTP real → 4.4) para reseñas; médico por JWT tenant + permisos; admin GaesSoft para validar/moderar/suspender.

### 4.3.c Tests integración ✅
- [x] **28 tests** (`doctoralia.test.ts`): funciones puras (slugify, moderación); perfil borrador→en_revision→admin publica→aparece en búsqueda; no aparece en borrador; búsqueda por ciudad/telemedicina; reseña verificada limpia auto-publica+recalcula score; reseña ofensiva→revision_humana sin afectar score; duplicado→409; médico responde/denuncia (baja conteo); admin modera escalada; admin suspende→sale de búsqueda; RBAC (recepción sin permiso→403, admin sin token→401).

### 4.3.d Diferidos a 4.3 fase 2 / V1.5
- Reservas portal→tenant (`public_bookings` + sincronización webhook master↔tenant + anti-no-show + slots caché)
- Telemedicina Daily.co (`telemedicine_sessions` + salas + tokens efímeros + grabación)
- PostGIS búsqueda geoespacial por radio
- Validación cédula vs SSa API real
- Frontend portal `apps/web-doctoralia`

## 4.4 Portal paciente — PHR unificado (Flujo 7, Modelo 4.3, master DB)

**Decisiones (confirmadas 2026-05-27)**:
- **Núcleo V1 = PHR unificado lado lectura** (el moat: primer PHR bien hecho de LATAM). Incluye expediente cross-tenant + consentimientos + gestión familiar + audit log LFPDPPP + QR emergencia + puente clínica→PHR. **Difiere** booking/anti-no-show/telemedicina (→ 4.4 fase 2), wearables, storage extra, export FHIR real, pet PHR.
- **Identidad phone_e164** (E.164, WhatsApp) con **login OTP sin contraseña** (ref. Apple Health/Doctoralia). `PacienteMaster` migra a phone-primary; email pasa a opcional (sigue sirviendo a reseñas Doctoralia). OTP vía `@gaespos/mensajeria` mock V1. Recordar dispositivo 30d.
- **Cifrado at-rest pgcrypto DIFERIDO** a un hito de hardening pre-producción. V1 protege con auth + consent + audit log. (Decisión registrada; no es recorte de scope, es secuenciación.)
- **PHR vive en master DB** (no per-tenant) — es el moat cross-tenant. La clínica (tenant) **publica** eventos clínicos al PHR vía puente con consent; el portal del paciente lee cross-tenant.
- **REGLA DURA**: NO asistente de síntomas / auto-diagnóstico / triage. Ver `project_gaes_pos_no_autodiagnostico`.

### 4.4.a Schema master PHR + migration + permisos ✅
- [x] `PacienteMaster` expandido — phoneE164 único (identidad), email opcional único, legalName/preferredName, birthDate, sexAtBirth, genderIdentity, rfc/curp opcional, country, address JSONB, bloodType, languagePreferred, weight/height + timestamps, metadata JSONB, deletedAt (ARCO soft delete). Conserva nombre/apellidos (compat reseñas Doctoralia).
- [x] `PatientLogin` — device sessions (fingerprint, deviceName, trustedUntil 30d, lastOtp method/at, lastLogin, revokedAt)
- [x] `PatientAuthChallenge` — reto OTP (phoneE164, codeHash, method, expiresAt, consumedAt, attempts) para verificación real
- [x] `PatientFamily` — dependiente↔tutor (relationshipType, permissionScope [full/view_only/agendar_only/custom], permissionDetails JSONB, consentStatus, consentRequiredFromDependent, validUntil)
- [x] `PatientConsent` — polimórfico subjectType [patient|pet] + subjectId + tenantId, scope [full_phr/appointments_only/prescriptions_only/vaccines_only], grantedAt/revokedAt, revocable, termsVersion, ipAtGrant. Máx 1 activo por (subjectType, subjectId, tenantId).
- [x] `PatientRecord` — evento clínico cross-tenant: patientId, tenantId, createdByUserId, resourceType FHIR [Encounter/Observation/Condition/AllergyIntolerance/Immunization/MedicationRequest/DiagnosticReport/Procedure/CarePlan], resourceSubtype, effectiveDate, status [draft/final/amended/cancelled], data JSONB FHIR R4, summaryText, isCritical, isVisibleToPatient, parentRecordId. (pgvector embeddings → diferido)
- [x] `PatientEmergencyQr` — qrToken único, isActive, visibleFields JSONB opt-in (bloodType/allergies/chronic/meds/contacto), regeneratedAt (ref. Apple Health Medical ID)
- [x] `PatientAuditLog` — append-only: patientId, subjectType/subjectId, tenantId, actorType [patient|tenant_user|system], userId, action [viewed_summary/viewed_record/created_record/modified_record/shared_record/exported_data], resourceType/resourceId, reason, ip, userAgent
- [x] Permisos tenant (clínica↔PHR): PHR_PUBLICAR_REGISTRO, PHR_SOLICITAR_CONSENT, PHR_LEER_CONSENTIDO. (Autorización del paciente = por ownership + scope familiar, no RBAC de tenant.)
- [x] Migration `add_phr` (master)

### 4.4.b Auth paciente OTP + servicios + endpoints portal ✅
- [x] Auth paciente: token kind `patient` + `authenticatePatient` decorator + `PatientPrincipal`. `/auth/patient/request-otp` (phone→reto, envía vía mock) y `/auth/patient/verify-otp` (code→JWT paciente + device trust opcional 30d).
- [x] Portal `apps/api/.../patient-portal/` (authenticatePatient): GET /me, GET /expediente (unificado cross-tenant propio + dependientes según scope, filtra isVisibleToPatient, **registra audit**), GET /criticos, consents (listar/otorgar/revocar), familia (CRUD + scope), emergency-qr (generar/ver), GET /audit, GET /export (ARCO JSON).
- [x] Público (sin auth): GET /emergency/:qrToken → solo visibleFields opt-in.
- [x] Puente clínica→PHR `apps/api/.../t/phr/` (authenticateTenant + perms): POST /registros (publica evento clínico, **exige consent activo** del tenant sobre el paciente), POST /consent-solicitudes (solicita consentimiento), GET /pacientes/:id/expediente (lee PHR consentido + **audit**).
- [x] Capa de consentimiento + audit: toda lectura cross-tenant valida consent (paciente/tutor accede directo siempre; tenant solo con consent.scope que cubre el resourceType) y escribe `PatientAuditLog`.

### 4.4.c Tests integración ✅
- [x] OTP request→verify→JWT; expediente unificado lee de varios tenants; **consent gating** (sin consent la clínica no lee, paciente sí); dependiente accede según permissionScope; clínica publica registro solo con consent; QR emergencia público muestra solo opt-in; audit log registra cada lectura; export ARCO completo; revocar consent bloquea lectura tenant pero NO borra registros.

### 4.4.d Diferidos a 4.4 fase 2 / V1.5
- Booking cross-tenant portal→tenant + anti-no-show (`patient_appointments` + `patient_reputation`) + telemedicina Daily.co + fee 5%
- Pet PHR (`pet_master` + `pet_records` separados, tutor_patient_id)
- Wearables (`patient_external_data_links` Apple Health/Google Health Connect lectura)
- Cifrado at-rest pgcrypto AES-256 + KMS (hito hardening)
- Embeddings pgvector búsqueda semántica + resumen/explicación IA al paciente (anonimización pre-LLM)
- Export HL7 FHIR real, storage 10GB extra, particionado pg_partman
- Frontend `apps/salud-paciente`

## 4.5 Demo Hito 4 — end-to-end ✅

Script `apps/api/scripts/demo-digital.ts` (`pnpm --filter @gaespos/api demo:digital`) contra API live con adapters mock. 4 actos verificados en verde:

- [x] **Acto 1 — Tienda (4.1)**: provisiona tenant retail + producto/stock → config tienda → publica producto → catálogo público → carrito anónimo ($598) → checkout pago mock (`/checkout/confirmar-mock`) → pedido GP-00000001 → venta generada + stock 100→98.
- [x] **Acto 2 — Marketing (4.2)**: promo `descuento_pct` 20% aplicada en venta POS ($299→$239.20, IVA recalculado) · lealtad inscribir/acumular 500 pts/canjear 200 → saldo 300 ($20) · campaña WhatsApp segmento RFM → encolar → worker procesa vía mock.
- [x] **Acto 3 — Doctoralia (4.3)**: médico crea perfil → ubicación → enviar a revisión → admin valida cédula SSa + publica → búsqueda pública "house" en Guadalajara → reseña 5★ verificada auto-publicada.
- [x] **Acto 4 — Portal paciente PHR (4.4)**: login OTP sin contraseña → clínica registra consent full_phr + publica Encounter → expediente unificado cross-tenant → QR emergencia público (solo opt-in: tipo sangre) → export ARCO + audit log.

**Cierre Hito 4**: 4.1 ✅ · 4.2 ✅ · 4.3 ✅ · 4.4 ✅ · 4.5 ✅. Suite apps/api **476 tests verde**.

## Performance budgets
- Catálogo público (ISR): TTFB <200ms
- Recalcular carrito: <150ms P95
- Checkout completo (sin pago externo): <800ms P95
