# Hito 3 — Verticales especializados

> **Estado:** 🎉 CERRADO al 100% (2026-05-26) · 5 verticales piloto cubiertos · 3.1✅ 3.2✅ 3.3✅ 3.4✅ 3.5✅ 3.6✅
> **Análisis:** [4.14 Abarrotes](../analisis/04-modelo-datos/4.14-abarrotes.md) · [4.15 Salud pacientes+consultas](../analisis/04-modelo-datos/4.15-salud-pacientes-consultas.md) · [4.16 Salud N3](../analisis/04-modelo-datos/4.16-salud-n3.md) · [4.2 Partners](../analisis/04-modelo-datos/4.2-partners.md) · [4.12 Compras/CFDIs recibidos](../analisis/04-modelo-datos/4.12-compras-cfdis-recibidos.md) · [Flujo 2 Cajero abarrotes](../analisis/03-flujos/02-cajero-abarrotes.md) · [Flujo 4 Veterinario](../analisis/03-flujos/04-veterinario.md) · [Flujo 9 Partner Contador](../analisis/03-flujos/09-partner-contador.md)

## Objetivo del Hito 3

Habilitar los 3 verticales que cubren los 5 clientes piloto restantes:
- **Abarrotes** (recargas + servicios + IEPS + balanza)
- **Salud Vet/Humana** (consultas + SOAP + recetas + PHR + N3 hospitalización)
- **Despacho Contable + Partners** (CFDIs recibidos + DIOT + comisiones partner)

Cierre del Hito 3 = 5 clientes piloto operativos.

## Orden sub-hitos

| Sub-hito | Vertical | Cliente piloto target | Razón orden |
|----------|----------|----------------------|-------------|
| **3.1** | Abarrotes | 1 cliente abarrotes esperando | Menor compliance, alta tracción (40% tráfico = recargas) |
| 3.2 | Salud Humana base | 1 médico esperando | Diferenciación máxima vs ContPaq/Eleventa, NOM-024 ya analizada |
| 3.3 | Salud Vet | 1 vet esperando | Reutiliza Salud Humana + SOAP veterinario |
| 3.4 | Salud N3 hospitalización | parte del cliente Vet | Cama virtual + medicación programada |
| 3.5 | Partners + Despacho | 1 contador esperando | CFDIs recibidos automatizados, DIOT, comisiones lifetime |
| 3.6 | Demo Hito 3 | — | Extender demos: abarrotes (recargas+IEPS) + clínica vet completa |

---

## 3.1 Abarrotes (recargas + servicios + IEPS) ✅ CERRADO (2026-05-21)

### 3.1.a Recargas tiempo aire — backend core ✅
**Schema tenant** (`packages/db/prisma/tenant/schema.prisma`):
- [ ] `RecargaProveedorConfig` — tenant elige proveedor (RecargaKi/MTSCellular/PymeYa enum), `apiKeyEncrypted`, `webhookSecretEncrypted`, `isPrimario`, `isActive`, `saldoPrefondeado`, `saldoAlertaMinimo`, `lastRechargeAt`, `totalConsumidoLifetime`, `comisionProveedorPct` (lo que el agregador cobra al tenant)
- [ ] `Recarga` — folio `RC-{CODIGO}-NNNNNN` único per-sucursal, `compañiaCodigo` (telcel|movistar|att|bait|unefon|virgin|maz|spentel|freedom_pop V1), `numeroTelefonico` 10 dígitos, `montoSolicitado`, `montoCobradoCliente` (con margen tenant), `comisionTenant` (margen), `comisionProveedor`, `costoRealTenant`, `proveedorUsadoCodigo`, `folioProveedor` (referencia agregador para reclamos), `respuestaProveedor` JSONB raw, `estado` enum [pendiente|exitosa|fallida|reembolsada|disputada], `motivoFalla`, `usuarioId`, `cajaAperturaId`, `ventaId @unique` opcional (si forma parte de venta combinada)
- [ ] `RecargaReintento` append-only — `recargaId`, `intentoNumero`, `respuesta` JSONB, `createdAt`
- [ ] `RecargaFolioCounter` atómico per-sucursal

**Catálogo hardcoded** en `@gaespos/recargas`:
- 9 compañías V1: telcel/movistar/att/bait/unefon/virgin_mobile/maz/spentel/freedom_pop con montos válidos + logo URL + permite_monto_custom + monto_min/max
- 3 proveedores agregadores: recargaki/mtscellular/pymeya como enum + descriptions

**Permisos nuevos**: `RECARGAS_LEER`, `RECARGAS_VENDER`, `RECARGAS_REEMBOLSAR`, `RECARGAS_CONFIGURAR`

### 3.1.b Paquete `@gaespos/recargas` — provider adapter pattern
- [ ] Interface `RechargeProvider` con `recargar(input)` → `RecargaResult` y `consultarEstado(folioProveedor)` → estado actualizado
- [ ] `MockRecargaProvider` para dev/tests con respuestas deterministas (folio fake + delay simulado)
- [ ] `RecargaKiClient` stub V1 con URL placeholder (cuando Gaby contrate cuenta real, se completa)
- [ ] Tipos compartidos `RecargaInput`, `RecargaResult`, `RecargaProvider`, `RecargaCompaniaCodigo`, `RecargaProveedorCodigo`, `RecargaError`

### 3.1.c Service recargas + endpoints + tests
- [ ] `apps/api/src/modules/tenant/recargas/service.ts`:
  - `consultarSaldo(tenantId, proveedor)` → consulta saldo y alerta
  - `procesarRecarga(input)` → atomic: valida saldo suficiente, descuenta saldo prefondeado, llama provider, persiste resultado, retry 1x si falla
  - `reembolsarRecarga(recargaId, motivo)` → solo si fallida o disputada, devuelve saldo
  - `marcarDisputada(recargaId, motivo)` → flag para investigación con agregador
- [ ] Endpoints `/t/recargas/*`:
  - `POST /t/recargas` procesa recarga (online obligatorio, 409 si offline)
  - `GET /t/recargas` lista con filtros estado/compañia/proveedor/desde/hasta
  - `GET /t/recargas/:id` detalle
  - `POST /t/recargas/:id/reembolsar` (gate RECARGAS_REEMBOLSAR)
  - `POST /t/recargas/:id/marcar-disputada`
  - `GET /t/recargas/proveedores/saldos` → estado de saldo prefondeado por proveedor
  - `PUT /t/recargas/proveedores/:codigo/config` → configura api_key + saldo alerta
- [ ] Tests integración: procesa recarga exitosa descuenta saldo, recarga fallida retry 1x luego falla sin cobrar, recarga validación número 10 dígitos, recarga con venta combinada se enlaza, reembolso solo en fallida/disputada, saldo bajo emite warning, permisos diferenciados

### 3.1.d IEPS — verificar y completar
- [ ] Verificar que `Producto.aplicaIeps` + `tasaIeps` JSONB + `requireRecipe` se respetan en `crearVenta` (computar `iepsTotal` por línea correctamente)
- [ ] Verificar que CFDI 4.0 emite nodo `Impuestos > Traslados` con IEPS desglosado de IVA cuando aplique
- [ ] Tests: venta con cigarro (IEPS 160%), cerveza alta graduación (53%), refresco azucarado ($1.5375/L)
- [ ] Si motor cascada NO computa IEPS — completar (ahora retorna 0)

### 3.1.e Bait pago (único servicio V1)
- [ ] Reutiliza modelo `Recarga` con `compañiaCodigo='bait'` + `tipoVenta='pago_servicio'` flag, o crear modelo separado `ServicioCobrado` (decisión: **reutilizar Recarga con flag** — minimiza overhead). Folio formato igual.
- [ ] Endpoint POST `/t/recargas` ya cubre Bait porque está en la lista de compañías; no requiere modelo nuevo si tratamos bait_pospago como "compañía" más.

### 3.1.f Decisiones a confirmar con Gaby
- **D3.1-01**: ¿Las recargas marcan `producto sin código` en el catálogo o son entidad propia? Spec dice entidad propia (`Recarga`), confirmar.
- **D3.1-02**: ¿Aplican comisiones del POS sobre recargas (afectan venta total → ticket)? Spec: sí, cobrado con margen.
- **D3.1-03**: Saldo prefondeado en `RecargaProveedorConfig` o como wallet aparte (escalable a múltiples wallets V1.5)?
- **D3.1-04**: Mock provider en dev → ¿default ON o requiere env `RECARGA_PROVIDER=mock`?
- **D3.1-05**: Folio del proveedor cuando está vacío (mock o fallido sin folio): ¿`null` o `pending-{ulid}`?

---

## 3.2 Salud Humana base (Modelo 4.15) ✅ CERRADO (2026-05-22)
**Scope V1** (PHR cross-tenant + vacunas + pediatría diferidos):
- [x] Paciente local con datos demográficos + alergias/antecedentes JSONB + tutorClienteId opcional + clasificacionRiesgo
- [x] Medico extensión 1:1 Usuario con cédula+especialidades+firma+telemedicina
- [x] Agenda recurrente (diaSemana) y específica (fecha) + bloqueos por tipo
- [x] Cita con state machine validada `programada→confirmada→checkin→en_consulta→completada/cancelada/no_asistio` + signos vitales recepción + tiempoEspera computado
- [x] Consulta SOAP **inmutable post-firma (NOM-024)** + enmiendas (clona consulta vinculada via consultaOriginalId)
- [x] DiagnosticoCatalogo CIE-10 (seed 30 dx top humanos)
- [x] MedicamentoCatalogo con clasificacionCofepris + dosis recomendada de REFERENCIA (NO IA calcula)
- [x] Receta con QR token validación pública + esGrupoControlado + numeroRecetarioOficial COFEPRIS automático para G_II/III
- [x] 3 roles preset clínicos: medico, enfermera, recepcion
- [x] 18 permisos nuevos PACIENTES_* / MEDICOS_* / AGENDA_* / CITAS_* / CONSULTAS_* / RECETAS_*
- [x] Migration 549 SQL cross-tenant aplicada
- [x] Seed integrado en seedTenantDefaults (CIE-10 + PLM + motivos cita)
- [x] 27 tests integración: catálogos + CRUD + flujo full agenda→receta + G_II/III recetario + enmienda + RBAC
- [x] **309 tests suite verde**

**Diferidos a 3.2.b / V1.5+:**
- PHR cross-tenant master DB con FHIR + sync via job publish-to-phr
- Vacunas (Vacuna/Vacunacion/CartillaPaciente) + cartilla SS MX obligatoria
- Pediatría (curvas crecimiento OMS + hitos desarrollo)
- Motor reglas interacciones automático que cruza alergias paciente vs medicamento receta
- Vector embeddings búsqueda semántica
- Validación cédula profesional vs SSa API real
- Doctoralia perfil público + telemedicina Daily.co (→ Hito 4)

## 3.3 Salud Vet ✅ CERRADO (2026-05-22)

### 3.3.a Schema vet + polimorfismo XOR ✅
- [x] `Mascota` — numeroExpediente MAS-NNNNNN único + especie enum 9 valores + raza + sexo + esEsterilizado + fechaNacimiento (flag aproximada) + color + microchip + pesoActualKg + tutorClienteId FK opcional Cliente B2C + medicoAsignadoId + alergias/antecedentes/medicamentosCronicos JSONB + fechaDefuncion + causaDefuncion + archivable
- [x] `VacunaCatalogo` — nombre comercial + principio activo + tipo + aplicaHumano/Vet flags + especiesAplicables JSONB + esquemaDefault{Humano,Vet} JSONB + viaAplicacion + **intervaloRefuerzosDias** (clave para cartilla determinista) + isObligatoriaCartillaNacional flag SSa MX
- [x] `Vacunacion` — paciente XOR mascota + vacunaCatalogoId + medicoAplicador + **numeroLote + caducidadLote obligatorios para rastreabilidad ante retiros del mercado** + marcaSnapshot + viaAdministracion + dosisAplicada + reaccionAdversaObservada + proximaAplicacionFecha calculada
- [x] Polimorfismo XOR en `Cita`, `Consulta`, `Receta`, `ConsultaSignoVital` (pacienteId nullable + nuevo mascotaId nullable + relaciones inversas). Validación en capa Zod `.refine()` + checks explícitos en routes (NO constraint DB porque Prisma no lo soporta nativo)
- [x] Índices vet `@@index([mascotaId, fechaConsulta])` etc. para performance queries vet
- [x] Enums nuevos: `MascotaEspecie` (9), `MascotaSexo`, `CartillaTipo` (preparado para `CartillaPaciente` model en 3.4)
- [x] 7 permisos nuevos MASCOTAS_LEER/CREAR/ACTUALIZAR/ARCHIVAR + VACUNAS_LEER/APLICAR/GESTIONAR_CARTILLA distribuidos a presets (dueño/gerente/medico/enfermera/recepcion)
- [x] Migration `add_salud_vet` (189 SQL) vía CLI shadow-database aplicada cross-tenant

### 3.3.b Seed catálogos vet + servicios ✅
- [x] **25 CIE-10 vet** (V-001 a V-025: parvovirosis canina, moquillo, calicivirus felino, rinotraqueítis, dermatitis atópica, sarna sarcóptica, otitis, IRC, diabetes felina, hipertiroidismo, atropello, cuerpo extraño GI, etc.)
- [x] **12 medicamentos vet PLM** (Drontal Plus, Bravecto, NexGard, Synulox, Marbofloxacina, Meloxicam Vet, Rimadyl, Cerenia, Frontline Plus, Caninsulin, Apoquel, Acepromacina) con `dosisRecomendadaVet` JSONB por especie con mg/kg + frecuencia de REFERENCIA (NO IA calcula)
- [x] **12 vacunas catálogo** (humanas SSa: BCG, HepB, Pentavalente, SRP, Influenza, Td, VPH + vet: Vanguard Plus 5/CV-L, Antirrábica canina, Bordetella, Triple felina FVRCP, Leucemia felina FeLV) con esquemasDefault JSONB + intervaloRefuerzosDias
- [x] Refactor `seedClinicalCatalogs` con helpers `seedDiagnostico`/`seedMedicamento`/`seedVacuna` reusables
- [x] Módulo `apps/api/.../mascotas/` CRUD con búsqueda multi-criterio (nombre/expediente/microchip/raza), filtro por especie/tutor/médico, archivar, generador MAS-NNNNNN, defunción via PATCH
- [x] Módulo `apps/api/.../vacunaciones/` con `procesarAplicacion` validando XOR + vacunaCatalogoId existente, próxima fecha calculada determinista de `intervaloRefuerzosDias`
- [x] Endpoint `GET /vacunaciones/cartilla?pacienteId=` XOR `?mascotaId=` retorna sujeto + vacunaciones aplicadas con estado [vigente|proxima(≤30d)|vencida] + lista `proximasDosis` ordenada con diasFaltantes (computed on-the-fly, sin tabla CartillaPaciente)
- [x] `consultas/diagnosticos/catalogo` extendido con query `?vertical=humano|vet|todos` (default todos)
- [x] Citas/Consultas/Recetas routes con validación XOR explícita (400 si ambos o ninguno) + includes mascota select { id, nombre, especie, numeroExpediente }

### 3.3.c Tests integración ✅
- [x] **19 tests** (`tenant-salud-vet.test.ts`):
  - Catálogos vet sembrados (CIE V-007 parvovirosis, Bravecto vet, Antirrábica canina + Triple felina con `aplicaVet=true`)
  - CRUD mascota con búsqueda por microchip + filtro por especie + PATCH peso
  - **Flujo full** cita mascota (sin pacienteId) → checkin → consulta SOAP vet con dx parvovirosis firmada → receta vet con Meloxicam (QR muestra "Firulais (perro)" sin paciente) → vacuna Antirrábica con lote+caducidad + próxima dosis +365 días determinista
  - Cobertura XOR (cita 400 si paciente+mascota juntos, 400 si ninguno; consulta 400 mismo; vacunación 400 mismo)
  - Cartilla con vigente+vencida+proximasDosis ordenadas
  - Permisos recepción aplica vacuna OK (tiene VACUNAS_APLICAR) pero NO DELETE registro cartilla 403 (sin VACUNAS_GESTIONAR_CARTILLA)
- [x] Suite total **328 tests verde** en 102s. Lint sin errores.

### Diferidos a 3.4 / V1.5+
- Hospitalización N3: `Cama` virtual + `AsignacionHospital` + `MedicacionProgramada` + `KardexAplicacion` + alarmas push BullMQ + `SignosHospital` + `CargosHospital`
- Laboratorio: `EstudioLaboratorio` + integración IDEXX
- Imagenología: DICOM viewer + JPG + IA hallazgos
- Pediatría vet (curvas crecimiento por raza)
- `CartillaPaciente` model cacheado (V1 computed on-the-fly via query)
- Resumen IA visitas al abrir expediente (→ Hito 4 IA features)
- Doctoralia perfil vet público (→ Hito 4)

## 3.4 Salud N3 hospitalización (Modelo 4.16) ✅ CERRADO (2026-05-25)

**Aplica a vet + humano N3** (polimorfismo XOR ya existente desde 3.3 — paciente XOR mascota en Hospitalizacion/SignoVitalHospital).

### 3.4.a Schema hospitalización + camas ✅
- [x] `Cama` virtual numerada per-sucursal, tipo [general|cuidados_intensivos|aislamiento|cirugia_recuperacion], estado [libre|ocupada|limpieza|mantenimiento], tarifaPorNoche, isActive
- [x] `Hospitalizacion` con paciente XOR mascota + camaId + fechaIngreso/Egreso + medicoResponsableId + motivoIngreso + diagnosticoIngresoId (CIE-10) + estado [activa|alta|fallecimiento|fuga|traslado_externo] + notasIngreso + folio HOSP-{CODIGO}-NNNNNN
- [x] `MedicacionProgramada` — hospitalizacion + medicamentoCatalogoId + dosis (capturada por médico) + vía + frecuenciaHoras + horaInicio + duracionDias + indicacionMedicaFirmadaId (FK a Receta o snapshot) + estado [activa|suspendida|completada] + motivoSuspension. **NO IA decide dosis** — médico captura, sistema solo programa.
- [x] `KardexAplicacion` append-only — medicacionProgramadaId + horaProgramada + horaAplicada (nullable) + enfermeraAplicadorId (nullable) + estado [pendiente|aplicada|omitida|reprogramada] + motivoOmision + notas + reaccionAdversaObservada
- [x] `SignoVitalHospital` granular — hospitalizacionId + hora + T°/FC/FR/SatO2/PA sistólica/diastólica/glucosa/dolor escala + enfermeraId + observaciones (separado de `ConsultaSignoVital` que es del consultorio)
- [x] `CargoHospital` append-only — hospitalizacionId + tipo [estancia_diaria|medicamento|procedimiento|laboratorio|imagenologia|consumible|otro] + monto + descripcion + cantidad + facturadoEnVentaId nullable (cuando se genera Venta al alta)
- [x] **8 permisos nuevos**: HOSPITALIZACION_LEER/CREAR/ALTA + KARDEX_LEER/APLICAR/REPROGRAMAR + CAMAS_GESTIONAR + MEDICACION_PROGRAMAR. Médico programa medicación; enfermera aplica/omite kardex y captura signos; recepción ALTA y gestiona camas.
- [x] Migration `add_salud_hospitalizacion` vía CLI shadow-database cross-tenant
- [x] Enums: `CamaTipo`, `CamaEstado`, `HospitalizacionEstado`, `KardexEstado`, `MedicacionEstado`, `CargoHospitalTipo`

### 3.4.b Servicios + endpoints + auto-Venta al alta ✅
- [x] `apps/api/.../camas/` CRUD básico + búsqueda por sucursal/tipo/estado
- [x] `apps/api/.../hospitalizaciones/service.ts`:
  - `ingresarPaciente(input)` — atomic: valida cama libre + valida sujeto XOR + abre Hospitalizacion + cambia cama → ocupada + crea CargoHospital tipo=estancia_diaria. Genera kardex base si MedicacionProgramada precargada.
  - `programarMedicacion(input)` — médico captura dosis/frecuencia/duración + firma. Servicio **explota** N entradas `KardexAplicacion` según frecuenciaHoras + duracionDias (ej: cada 8h x 5d = 15 aplicaciones). Cada una con horaProgramada precalculada.
  - `aplicarKardex(id, {aplicada|omitida|reprogramada, motivoOmision?, notas?, reaccionAdversaObservada?})` — enfermera registra. Append-only, no se edita.
  - `capturarSignoVital(input)` — append. Computa alertas si T°>39 o FC>180 etc. (rules-based, NO IA).
  - `darAlta({hospitalizacionId, motivoAlta, observaciones?})` — atomic: cierra Hosp (estado=alta) + libera cama (→limpieza, gerente marca →libre) + suspende MedicacionProgramada activa → **crea Venta borrador** con todos CargosHospital `facturadoEnVentaId IS NULL` como líneas + retorna Venta para que recepción cobre (puede emitir CFDI desde flujo normal de 1.5).
- [x] **Worker BullMQ `services/workers/medicacion-alarmas/`** (V1):
  - Cron job cada 5 min escanea `KardexAplicacion` estado=pendiente con horaProgramada en ventana próxima
  - Envía push notification a enfermeras del turno (canal WebSocket o expo-push si tenant tiene app móvil). MVP V1: notificación in-app via canal Server-Sent-Events, expo-push diferido a Hito 5 multi-plataforma.
  - Marca kardex `alertaEnviadaAt` para no re-spam
- [x] Endpoints `/t/camas`, `/t/hospitalizaciones`, `/t/hospitalizaciones/:id/{programar-medicacion,aplicar-kardex,signos,alta}`, `/t/kardex` con filtros (turno, paciente, pendientes)

### 3.4.c Tests integración ✅
- [x] **~18 tests**:
  - CRUD camas + cambios estado libre→ocupada→limpieza→libre
  - Ingreso paciente humano + ingreso mascota vet (cubre polimorfismo XOR)
  - Cama ya ocupada → 409
  - Programar medicación expande kardex correcto (cada 8h x 5d = 15 entradas)
  - Enfermera aplica kardex (estado→aplicada) y omite (motivoOmision obligatorio)
  - PATCH a kardex aplicada → 409 (append-only)
  - Signos vitales hospital append + alerta T°>39 marca flag
  - Cargos acumulados (estancia_diaria automática + medicamentos manual)
  - **Dar alta** libera cama + suspende medicación + crea Venta borrador con líneas de CargosHospital → `facturadoEnVentaId` se popula
  - Alta sin hospitalización activa → 409
  - Worker alarmas detecta kardex próximo y emite (mock channel)
  - RBAC: enfermera sin MEDICACION_PROGRAMAR → 403; médico sin KARDEX_APLICAR → 403; recepción ALTA OK

### 3.4.d Decisiones diferidas a V1.5+
- Laboratorio (EstudioLaboratorio + integración IDEXX vet / referencia humano)
- Imagenología (DICOM viewer + JPG + IA hallazgos diferida por regla NO IA clínica decisional)
- Expo-push notifications a app móvil enfermería (→ Hito 5)
- Hoja de evolución diaria firmada (NOM-024 N3)
- Triaje hospitalario IA → NO (línea roja)

## 3.5 Partners + Despacho contable (Modelos 4.2 master + 4.12 tenant) ✅ CERRADO (2026-05-26)

**Verticales V1 (ambas)**: programa Partners (cross-tenant, master DB) + Despacho contable (intra-tenant). Cubre el cliente piloto contador y prepara el motor de referidos lifetime 25%.

### 3.5.a Schema master Partners (Modelo 4.2)
- [x] `Partner` — código único + razón social + RFC + email + teléfono + tipo [contador|integrador|consultor|otro] + nivel [bronze|silver|gold|diamond] derivado por tenants activos + comisionPct (25% default Bronze, 30% Silver, 35% Gold, 40% Diamond) + estado [activo|pausado|terminado] + onboarding payload + bankAccountConfig + termsAcceptedAt + isAcceptingNewReferrals
- [x] `PartnerBranding` — logo + colorPrimario + colorSecundario + dominioPartner opcional (white-label V1.5) + slugPublico para portal `/p/{slug}`
- [x] `PartnerLink` — partner + slug único + targetUrl (signup tenant con cookie attribution) + utm_source/medium/campaign + isActive + clicksTotal + signupsTotal + paidConversions
- [x] `Referral` — partner + linkId + tenantId (asignado al crear tenant) + estado [click|signup|trial|paying|churned] + firstClickAt + signupAt + trialStartAt + paidStartAt + churnedAt + atribucionExpiraEn (cookie 90d default)
- [x] `Commission` — partner + tenantId + referralId + periodoYYYYMM + montoBaseTenantPaid (subscription que pagó tenant) + porcentajeAplicado + montoComision + estado [pendiente|aprobada|pagada|rechazada|disputada] + invoiceId (factura partner→GaesSoft)
- [x] `Payout` — partner + periodoYYYYMM + commissionIds[] + montoTotal + metodoPago [spei|paypal|stripe_connect] + estado [pendiente|en_proceso|pagado|fallido] + folioBancario + fechaPago + retencionISR/IVA si requiere
- [x] `PartnerInvitacion` — link de onboarding inicial cuando GaesSoft invita partner: token único + expira + acceptedAt
- [x] 6 permisos master nuevos: PARTNERS_LEER/EDITAR + COMMISSIONS_LEER/APROBAR/RECHAZAR + PAYOUTS_GESTIONAR (solo superadmin GaesSoft + el partner mismo en su propio perfil via JWT discriminator)
- [x] Migration `add_partners` master DB
- [x] Enums: `PartnerNivel`, `PartnerEstado`, `PartnerTipo`, `ReferralEstado`, `CommissionEstado`, `PayoutEstado`, `PayoutMetodo`

### 3.5.b Schema tenant Despacho contable (Modelo 4.12)
- [x] `CfdiRecibido` — uuidSat unique + tipoComprobante [I|E|N|P|T] + serie + folio + emisorRfc + emisorRazonSocial + receptorRfc + fechaEmision + subtotal + descuento + ivaTrasladado + ivaRetenido + isrRetenido + iepsTrasladado + total + moneda + metodoPago [PUE|PPD] + formaPago + usoCfdi + version SAT + xmlRaw (text) + pdfUrl + estado [vigente|cancelado] + canceladoAt + origen [upload_manual|facturama_retrieve|webhook] + uploadedById + procesado flag
- [x] `CategoriaContable` — codigoContable (cuenta SAT 100-999) + nombre + tipo [activo|pasivo|capital|ingreso|gasto|costo] + esDeducibleSat + ivaAcreditable + isrRetenibleDefault + isPrecargadoGlobal + nivelJerarquico (padre/hijo) + colorUi
- [x] `CfdiRecibidoCategorizacion` — cfdiRecibidoId @unique + categoriaContableId + categorizadoPor [ia|regla_heuristica|manual] + iaModelo (claude-haiku-4-5) + iaConfianza 0-1 + iaJustificacion text + asignadoPorUsuarioId? + asignadoAt + override flag (true si humano corrigió IA)
- [x] `OrdenCompra` — folio OC-{CODIGO}-NNNNNN + proveedorRfc + proveedorRazonSocial + sucursalId + estado [borrador|enviada|recibida_parcial|recibida_total|cancelada] + fechaEsperada + observaciones + cfdiRecibidoId? opcional (cuando se vincula el CFDI a la OC) + total + autorizadoPorId
- [x] `OrdenCompraLinea` — productoId? opcional + descripcion + cantidad + precioUnitario + monto + cantidadRecibida
- [x] `DiotOperacion` — vista materializada/query helper: tipoOperacion [03|85] + tipoTercero [04|05|15] + rfcTercero + nombreTercero + ivaPagado16 + ivaPagado8 + iva0 + ivaExento + ivaRetenido + periodoYYYYMM + cfdiRecibidoIds[]
- [x] `ConciliacionBancaria` — placeholder V1.5 (no codear V1, dejar el campo `cfdiRecibido.movimientoBancarioId?` nullable para futuro)
- [x] **8 permisos tenant nuevos**: CFDIS_RECIBIDOS_LEER/UPLOAD/CATEGORIZAR/CANCELAR + COMPRAS_OC_LEER/CREAR/AUTORIZAR + DIOT_GENERAR. Distribuidos: contador_interno todos + dueño todos + almacen LEER+CREAR OC.
- [x] Migration `add_despacho_contable` cross-tenant
- [x] **Seed catálogo SAT**: claveProdServ→categoriaContable mapping inicial (top 50 más comunes), seed 30 categorías contables base MX

### 3.5.c Paquete `@gaespos/ai` + servicios IA categorización
- [x] **Nuevo paquete `@gaespos/ai`** wrappers Anthropic + OpenAI:
  - `AiProvider` interface con `categorize(input, opts)` + `summarize(text)` + `extractFields(text, schema)`
  - `AnthropicClient` con Claude Haiku 4.5 default (cost-effective categorización), prompt caching (críticos por costos)
  - `MockAiProvider` determinista para tests sin tokens
  - Sistema de **créditos por tenant** integrado con plan (Free=0, Starter=100/mes, Growth=1000/mes, Scale=10000/mes)
  - Audit log `AiUsage` master DB (tenantId + tool + tokenInput + tokenOutput + costoUsd + créditosConsumidos + cachedHit flag)
- [x] `apps/api/.../cfdis-recibidos/`:
  - service `categorizarCfdi(cfdi)`: 1) intenta IA Anthropic con prompt cached del catálogo SAT + categorías tenant; 2) fallback reglas RegEx por claveProdServ→categoría si no hay créditos o IA falla; 3) crea CfdiRecibidoCategorizacion
  - `procesarUpload(file)` parsea XML (libxml2) → valida CFDI 4.0 → extrae header → guarda raw → encola categorización async
  - `descargarMasivoSat(periodo)` cron mensual via Facturama API retrieve list + download each XML
- [x] `apps/api/.../ordenes-compra/`:
  - service `crearOC + autorizarOC + recibirParcial/total + vincularCfdiRecibido`
- [x] `apps/api/.../diot/`:
  - service `generarDiot(periodo)` agrega CfdisRecibidos categorizados deducibles del periodo → arma DiotOperacion → genera TXT formato SAT (separado por |, encoding UTF-8 sin BOM)
  - Endpoint `GET /t/diot/{YYYYMM}/export` retorna Content-Disposition attachment

### 3.5.d Partners service + Portal
- [x] `apps/api/.../partners/` (master, no tenant):
  - `partner.service.ts`: crearInvitacion + aceptarInvitacion (genera Partner activo) + crearLink + recalcularNivel (cron mensual o on-demand: cuenta tenants activos paying)
  - `referral.service.ts`: registrarClick (cookie 90d) + onTenantCreated (busca cookie + crea Referral asociado) + transicionEstado (signup→trial→paying al pagar primer subscription) + churn
  - `commission.service.ts`: cron mensual recalcula comisiones del periodo (suma subscription paid de tenants referrals "paying" del partner × pct nivel) + aprobar/rechazar
  - `payout.service.ts`: agrupa commissions aprobadas → genera Payout pendiente → marca pagado tras transferencia
- [x] Endpoints master `/partners/*` y `/p/{slug}/click?ref=xyz` redirect público
- [x] Portal partner web (frontend) **DIFERIDO a Hito 6** (lo expone con registro público SaaS). V1 backend completo + endpoint test simple HTML.

### 3.5.e Tests integración (~40 tests)
- [x] **Partners** (~15 tests): crear partner, invitación, aceptar invitación, crear link, registrar click (cookie attribution), tenant creado con cookie → referral creado, transición signup→trial→paying, recalcular nivel (Bronze→Silver al 10 tenants), comisión mensual calculada correctamente, aprobar/rechazar, payout agrupa commissions, RBAC partner solo ve sus datos
- [x] **CFDIs recibidos** (~12 tests): upload XML válido procesa OK, upload XML inválido 400, upload ZIP múltiples XMLs, descarga masiva Facturama retrieve (mock), categorización IA con mock provider, fallback reglas heurísticas cuando IA falla/sin créditos, override manual de categorización, cancelado vs vigente, listado paginado por periodo, vincular OC, RBAC contador_interno todos
- [x] **OC** (~6 tests): crear OC borrador, autorizar, recibir parcial, recibir total, cancelar OC enviada, vincular CFDI recibido
- [x] **DIOT** (~5 tests): generar TXT del periodo, formato correcto separado por |, tipo operación 03 (proveedor nacional), incluye solo deducibles del periodo, descarga endpoint con headers correctos
- [x] **Categorización IA** (~3 tests): mock devuelve categoría con confianza, créditos descontados del tenant, audit log creado

### 3.5.f Diferidos a V1.5+
- Portal partner frontend Vue/React (→ Hito 6 cuando registro público abierto)
- Conciliación bancaria automática (CFDIs recibidos vs estado de cuenta)
- White-label completo (dominioPartner custom)
- ISR/IVA retenido automático en payouts (manual V1)
- Predicción IA tasa churn / next-payout
- Webhook Facturama real-time recibidos (V1 = cron mensual)
- Dispersión SPEI automática vía API banca

## 3.6 Demo Hito 3 — verticales end-to-end ✅ CERRADO (2026-05-26)
- [x] `demo:clinica-vet` (`apps/api/scripts/demo-clinica-vet.ts`) — 15 pasos: tenant salud → equipo clínico → catálogos → paciente humano → consulta SOAP firmada → receta QR validada → mascota vet → vacuna + cartilla → camas → hospitalización (cama→ocupada + cargo auto) → medicación expande kardex → enfermera aplica dosis → signos vitales con alerta rule-based → alta con venta. **Corrida live verde.**
- [x] `demo:abarrotes` (`scripts/demo-abarrotes.ts`) — recarga Telcel con margen + Bait pospago + saldo prefondeado + producto IEPS 160% con desglose fiscal en venta. **Requiere `RECARGA_PROVIDER=mock`. Corrida live verde.**
- [x] `demo:despacho` (`scripts/demo-despacho.ts`) — CFDI XML upload → auto-categorización IA (G-606) → OC → recepción vincula CFDI → DIOT TXT formato SAT + programa partners (link → click cookie 90d → referral paying → comisión 25% → aprobar → payout SPEI). **Corrida live verde.**
- [x] Soporte `RECARGA_PROVIDER=mock` agregado a `server.ts` (mismo patrón que `FISCAL_PROVIDER=mock`); AI usa MockAiProvider automático sin `ANTHROPIC_API_KEY`
- [x] Scripts registrados: `pnpm --filter @gaespos/api demo:clinica-vet|demo:abarrotes|demo:despacho`
- [ ] Tag `hito-3-verticales-v1` (pendiente: requiere commit — esperar visto bueno de Gaby)

## Performance budgets
- Procesar recarga (incl. llamada provider): <2s P95
- Consulta saldo prefondeado: <100ms P95
- Búsqueda histórico recargas con 10K registros: <200ms P95
