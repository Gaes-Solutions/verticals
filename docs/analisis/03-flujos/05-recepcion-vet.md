# GaesSoft POS — Flujo Recepción veterinaria (Flujo 5 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_recepcion_vet.md`
> **Descripción:** Recepción/asistente vet — agenda, check-in, cola virtual, cobro al alta, confirmaciones WhatsApp IA

Flujo 5 (Recepción/Asistente veterinaria) aprobado por Gaby completo. Es el rol que orquesta el flujo del paciente. Aplica idéntico a recepción médica humana (cambia "mascota"/"paciente"), recepción de estética vet/humana, recepción de hotel canino.

**Pantalla principal "Tablón del día":** sala de espera con timer de espera por paciente, en consulta con timer, hospitalizados con cargos pendientes y altas, citas próximas con estado de confirmación, KPI del día.

**Estados del paciente** (estilo Toast restaurante): agendado → confirmado → llegó → en_sala → en_consulta → en_estudios → hospitalizado → alta → pagado.

**Agendar cita:** buscar/crear tutor, seleccionar mascota, motivo (consulta/vacuna/control/cirugía/estética/urgencia con duración default por tipo), médico (específico o "cualquier disponible"), calendario con slots disponibles bloqueando ocupados/comidas/no laborales, override fuera de horario con permiso gerente, **pago anticipado opcional vía Stripe link WhatsApp** para reducir no-shows, confirmaciones WhatsApp 24h y 1h antes opcionales.

**Check-in:** marcar "llegó", peso del día (recepción puede pesar antes), foto opcional, notas del tutor, confirmar contacto. Sistema mueve a sala de espera virtual y notifica al médico.

**Llamar al siguiente:** botón en cada paciente, marca `en_consulta` con `medico_id` y timer, anuncio TTS bocina (V2), notificación push a médico.

**Cobro al alta — POS integrado:** trae automático los cargos del médico (consulta + vacunas + medicamentos vendidos + procedimientos) sin recapturar, desglose servicios + productos con IVA correcto (servicios salud humana exentos en MX, vet sí gravados), CFDI ahora opcional, programación de cita futura en mismo flujo, envío de receta + resumen WhatsApp en mismo paso. Si fue hospitalizado, ticket compila TODOS los cargos (cama/día, medicación aplicada, sueroterapia/ml, honorarios por turno, lab, procedimientos).

**Confirmaciones automáticas WhatsApp:** 24h antes (con SÍ/NO), 1h antes, post-consulta (resumen IA + receta PDF), 7 días después (seguimiento de tratamiento), cumpleaños del paciente con descuento.

**Plantillas WhatsApp precargadas (15 estándar editables por tenant):** confirmación, recordatorio, recordatorio vacuna, cumpleaños, seguimiento, alta, urgencia, cancelación, reagendamiento, etc. Generadas con IA con tono personalizado por cliente.

**Tareas pendientes:** llamadas a hacer, resultados de lab por entregar, saldos CxC por cobrar, cirugías por confirmar.

**Venta libre de productos en mostrador:** mismo POS retail (Flujo 1) con toggle "vinculado a paciente" opcional. Tutor habitual → asigna a su cliente; ocasional → "Público en general". Unifica inventario y caja.

**IA específica:** confirmaciones personalizadas WhatsApp, resumen IA al tutor, sugerencia de horario óptimo según historial cliente, detección de patrón no-show ("este cliente cancela 40% — sugerir pago anticipado"), re-engagement de inactivos (>12 meses), resumen de día para gerente.

**Decisiones cerradas:**
- Anuncio TTS por bocina: V2. V1 = notificación visual + push al médico
- Pago anticipado: configurable por tipo de cita. Default: opcional consulta, sugerido cirugía/estética
- Doble booking: bloqueado default, override con permiso gerente
- Plantillas WhatsApp: precargamos 15 estándar editables (ahorra hora onboarding)

**Permisos:** agenda.read/create/modify/cancelar, salud.checkin.realizar, salud.expediente.read_basico (NO clínico completo), pos.usar, ventas.create, pacientes.create/read, tutor.create/read/modify, whatsapp.enviar_plantilla, cobranza.cxc.cobrar, cita.cobrar_anticipo.

**NO puede hacer:** diagnósticos/exploración (solo médico), modificar receta firmada, ver expediente clínico completo, editar precios.

**Why:** Recepción es la cara de la clínica y orquesta todo. Una recepción organizada con cola virtual visible elimina caos típico de consultorios. Confirmaciones WhatsApp automáticas reducen no-shows 30-50% (data de la industria). Cobro integrado al alta sin recaptura ahorra 5 min por paciente.

**How to apply:** En backend, modelar agenda con conflict detection, estados de paciente como state machine, cargos automáticos del médico al cobro de recepción, plantillas WhatsApp como tabla por tenant editable. En frontend, app dedicada de recepción con tablón visual estilo restaurante (Toast UX).
