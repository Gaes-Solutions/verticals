# GaesSoft POS — Flujo Paciente en portal Salud (Flujo 7 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_paciente_portal.md`
> **Descripción:** Portal del paciente con PHR unificado, marketplace, telemedicina, anti-no-show, QR emergencia, gestión familiar

Flujo 7 (Paciente en portal GaesSoft Salud) aprobado por Gaby completo. Combina PHR + anti-no-show + marketplace Doctoralia + telemedicina + gestión familiar. Es el producto más diferenciador de toda la plataforma.

**App separada:** `apps/salud-publico` y `apps/salud-paciente` (puede ser misma app o dos según deploy). Next.js para SEO. Accesible desde `salud.gaessoft.com` + embed en `clinica.gaessoft.com/portal` para cada Business+.

**Login OTP sin contraseña:**
- WhatsApp default, SMS alternativa
- Sin password (referencia Apple Health, Doctoralia)
- Recordar dispositivo opcional 30 días
- Login familiar: una cuenta gestiona dependientes (hijos, padres mayores, esposo/a con consentimiento)

**Pantalla principal "Mi expediente unificado":**
- Selector de perfiles familiares en top
- Próximas citas con estado de pago/confirmación
- Alertas inteligentes IA (vacunas próximas a vencer, recetas a renovar, controles crónicos)
- Tratamientos activos
- Datos críticos visibles (sangre, alergias, crónicas)
- Acciones rápidas: buscar médico, mis citas, recetas, vacunas, estudios, QR emergencia

**Tabs del expediente:** Resumen, Consultas (con resumen IA por consulta), Vacunas (cartilla visual), Recetas (activas/históricas con QR validable + botón renovar), Lab (resultados con valores referenciales y explicación IA en lenguaje simple), Estudios (PDFs/imágenes), Diagnósticos, Cirugías, Documentos (carga manual con extracción IA al PHR estructurado).

**Mi familia — gestión dependientes:**
- Tipos: Tutor legal (hijos menores, acceso total automático), Pareja con consentimiento (requiere confirmación del otro), Cuidador autorizado (papás mayores, permisos granulares otorgados por familiar)
- Granularidad: ver expediente / agendar citas / ver y cargar documentos / modificar datos / acceso de emergencia

**Buscar y agendar (marketplace Doctoralia integrado):**
- Filtros: especialidad, ciudad/colonia, idiomas, género, precio, seguro, telemedicina, mismo día, niños/adultos
- 💡 Recomendados IA basado en historial del paciente ("especialista en respiratorio infantil — relevante por el asma de Emiliano")
- Perfil del médico con cédula validada SSa, slots reales en vivo, reseñas verificadas
- Reserva con verificación anti-no-show: Verificado/Confiable sin anticipo, Nuevo con 50% (configurable), Bloqueado con 100% o bloqueo total
- Sistema explica al paciente nuevo por qué se le pide anticipo
- 🤖 IA prepara contexto al médico antes de la consulta si hay consentimiento PHR

**Telemedicina V1 — Daily.co:**
- Sala efímera, vínculo único de un solo uso
- Pre-consulta con preguntas estructuradas del médico
- Test de cámara/micro/conexión
- Grabación con consentimiento
- Compartir pantalla, chat, subir documentos
- Receta y resumen al PHR al cerrar
- Cobro al iniciar (Stripe). GaesSoft cobra **fee de plataforma 5%** sobre la consulta — monetiza el portal Doctoralia.

**Notificaciones unificadas:** recordatorios cita, vacunas próximas/vencidas, recetas a renovar, resultados lab listos, mensajes consultorio, pagos pendientes, controles crónicos. Configurable por canal (WhatsApp/SMS/email/push) y tipo.

**Compartir expediente:**
- Granularidad total: qué compartir + vigencia (24h / 7 días / hasta revocar)
- Modo QR temporal 24h
- Modo link único por WhatsApp
- Estándar HL7 FHIR para interoperabilidad

**Auditoría de actividad** del expediente (cumple LFPDPPP + ARCO):
- Lista de quién accedió, cuándo, motivo, qué escribió
- Reportar acceso indebido → bloqueo automático del consultorio + investigación + posible suspensión

**QR de emergencia** (referencia Apple Health Medical ID):
- Público sin login, solo muestra campos pre-aprobados por paciente (sangre, alergias críticas, crónicas, meds, contacto emergencia)
- Imprimir tarjeta de cartera, mostrar pantalla, wallpaper bloqueo

**IA aplicada al paciente:**
- Resumen del expediente en lenguaje simple
- Explicación de resultados de laboratorio
- Recordatorios inteligentes con timing óptimo
- Recomendación de médico personalizada
- Pre-consulta estructurada (preguntas del médico, no diagnóstico)
- Extracción de documentos subidos al PHR estructurado
- Traducción de resúmenes a lenguaje aún más simple

**REGLA DURA — NO incluido nunca:** asistente de síntomas, auto-diagnóstico, "checa tus síntomas", triage al paciente. Ver memory `project_gaes_pos_no_autodiagnostico.md`.

**Decisiones cerradas Q&A final:**
- Apple Health/Google Health Connect: V1 solo lectura (importar datos del wearable al PHR), V2 escritura
- QR emergencia: campos pre-aprobados por paciente, opt-in
- Asistente de síntomas: ❌ NUNCA (regla legal/compliance)
- Storage archivos: 2 GB gratis por paciente, $99 MXN/año por 10 GB extra (V2 cuando haya base)
- Telemedicina: consultorio cobra vía GaesSoft con fee de plataforma 5%

**Permisos del paciente sobre sus datos:** phr.read_propio, phr.compartir, phr.revocar_consentimiento, phr.familia_agregar, phr.familia_modificar_permisos, phr.exportar_datos (ARCO), phr.solicitar_borrado (ARCO), cita.agendar, cita.cancelar_propia, pago.realizar, resena.publicar.

**Why:** Esta es la pantalla "wow" que retiene pacientes y crea efecto de red. Sin esto GaesSoft Salud sería una Doctoralia más; con esto es el primer PHR de LATAM bien hecho. El portal del paciente convierte adquisición de pacientes en gancho para vender a más consultorios.

**How to apply:** En backend, endpoints `/api/patient-portal/*` separados de `/api/tenant/*`. Auth dual (paciente con OTP, tenant con JWT). Toda lectura cross-tenant del PHR pasa por capa de validación de consentimiento + log auditoría. En frontend, app(s) separadas con UI orientada a paciente (no a profesional).
