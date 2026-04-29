# GaesSoft POS — Flujo Médico humano + Doctoralia (Flujo 6 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_medico_humano.md`
> **Descripción:** Vertical Salud Humana — pediatría, NOM-024, CFDI exento, marketplace público, integrado con PHR

Flujo 6 (Médico humano + portal Doctoralia) aprobado por Gaby completo. 90% comparte código con Flujo 4 (vet). Este memory cubre solo lo distintivo del humano.

**No incluye hospitalización** — GaesSoft humano cubre consultorio, no hospital. Hospitales grandes tienen Epic/Cerner; no competimos ahí.

**Imagenología consultorio:** soporta SUBIR estudios externos (radiografías que el paciente trae) pero no tomarlos. V1: visor JPG/PNG. V2: visor DICOM nativo.

**CFDI con regla fiscal especial:**
- Servicios médicos por médicos titulados con cédula = **EXENTOS de IVA** (Art. 15 LIVA, fracción XIV)
- Sistema detecta sub-tipo `humana` y aplica IVA 0% a líneas marcadas "honorarios médicos" cuando médico tiene cédula registrada
- Clave SAT 85121800 (Servicios de medicina) o específicas por especialidad
- Productos vendidos en consultorio (vitaminas, complementos) SÍ gravan IVA aunque sean del mismo ticket

**NOM-024 — expediente clínico electrónico legal MX:**
- Estructura del expediente compatible con norma
- Firma electrónica del médico con timestamp + UUID + cédula documentada (firma simple V1)
- Conservación 5 años mínimo
- Acceso del paciente a su expediente (cumplido por integración con PHR)
- Log de auditoría de accesos
- Confidencialidad y consentimiento gestionados vía PHR

**Decisión: firma simple V1, FIEL como add-on V2.** FIEL (Firma Electrónica Avanzada SAT) requiere integración PKI compleja; consultorios típicos no la requieren para uso interno. Firma simple es válida para emisión a paciente y uso operativo.

**Receta humana con NOM-024 y QR validable:**
- Firma electrónica + cédula + nombre + especialidad
- QR generado para validación pública (paciente o farmacia escanea y valida)
- **Medicamentos controlados Grupos II/III COFEPRIS** (psicotrópicos, opioides) — sistema valida grupo del medicamento al recetar y advierte: "Este medicamento es Grupo II — requiere recetario físico oficial COFEPRIS". No se puede emitir digital aún en MX.
- Grupos IV o libre: receta digital válida

**Pediatría — caso explícito de Gaby:**

*Ficha pediátrica:* peso/talla del día, percentiles, tutores (madre/padre/tutor legal), datos del nacimiento (fecha, tipo parto, peso/talla, APGAR, tamiz neonatal), datos de la madre durante embarazo (edad gestacional al nacimiento, complicaciones, lactancia materna), alergias, crónicas.

*Curvas de crecimiento OMS/CDC integradas:* peso/edad (0-5a y 5-19a), talla/edad, peso/talla, IMC/edad, perímetro cefálico (0-2a). Percentiles 3, 15, 50, 85, 97. Sistema sitúa al niño en su percentil y alerta caídas bruscas (signo de alarma).

*Hitos de desarrollo:* checklist cronológica (sostiene cabeza 3m, sienta solo 6m, gatea 9m, camina 12-15m, primera palabra 12m, 50 palabras 24m, frases 2 palabras 24m, control esfínteres diurno 3a). Sistema muestra hito + rango de edad esperada del catálogo. **Médico decide** si hay retraso significativo y qué evaluación complementaria solicitar — sin sugerencia IA.

*Cartilla nacional vacunación MX precargada esquema básico SSa:* BCG (RN), Hep B (RN/2m/6m), Pentavalente acelular (2m/4m/6m/18m), Rotavirus (2m/4m/6m), Neumococo conjugada (2m/4m/12m), Influenza (anual desde 6m), SRP (12m/6a), DPT (4a), VPH (niñas 11a), Hep A (12m/18m), Varicela (12m). Alertas WhatsApp automáticas al tutor cuando se acerca aplicación. Cumple Cartilla Nacional Salud SSa.

*Receta pediátrica:* catálogo PLM con dosis de referencia (paracetamol 10-15 mg/kg c/6h) que médico LEE y decide manualmente. Calculadora simple (no IA) que ayuda al médico a convertir la dosis decidida a ml de jarabe según concentración del frasco. IA puede parafrasear las indicaciones del médico al tutor en lenguaje simple ("dale 1.5 ml cada 6 horas con la jeringa que viene en la caja, después de comer") — no genera dosis ni sugiere medicamento. **Ver project_gaes_pos_no_autodiagnostico.md regla extendida.**

*Perfiles especiales:* lactancia (patrón alimentación primer año), ablactación, prematuridad (edad corregida vs cronológica).

**Otras especialidades V1 con campos específicos:**
- Pediatría (lo arriba)
- Medicina general (configuración base)
- Ginecología/Obstetricia (último periodo, gesta/para/aborto, papanicolaou, mamografía, cartilla embarazo)
- Dental (odontograma 52 dientes adulto/20 lácteos, procedimientos por diente, periodontograma)
- Nutrición (composición corporal, planes alimenticios, recordatorios)

**V2:** Psicología/Psiquiatría (telemedicina sofisticada, escalas PHQ-9 GAD-7, notas SOAP-mental), Cardiología (ECG), Dermatología (galería fotos por lesión), Oftalmología (campimetría).

**Portal público GaesSoft Salud (Doctoralia-style):**
- App separada `apps/salud-publico` (Next.js para SEO)
- Búsqueda por especialidad + ciudad/colonia + filtros (idiomas, género, precio, seguro, telemedicina, mismo día, niños/adultos)
- Perfil rico del médico (especialidad, experiencia, formación, idiomas, foto, direcciones, precios, reseñas)
- Reserva sin login con OTP SMS/WhatsApp
- Pago en línea opcional via Stripe checkout (obligatorio si paciente Nuevo según anti-no-show)
- Confirmaciones automáticas WhatsApp + email
- Reseñas verificadas (solo pacientes con cita marcada `pagado`), moderación IA + denuncia manual del médico
- Telemedicina V1 con **Daily.co** (barato, API limpia, white-label)
- Marketplace automático para todos Business+ con cédula validada

**Diferenciador masivo vs Doctoralia:**
- Doctoralia tiene marketplace pero NO tiene expediente clínico real, recetas, cobro integrado, POS, IA
- GaesSoft Salud = Doctoralia + Wellnex + IA + PHR centrado en paciente, todo en un solo producto Business $1,499 MXN
- Doctoralia + Wellnex separados costarían $2,500+ MXN/mes y no se hablan entre sí

**Permisos específicos humano:** salud.humana.pediatria, salud.humana.gineco, salud.humana.dental, salud.controlados.recetar, salud.firma_avanzada, portal_publico.editar_perfil, portal_publico.responder_resena.

**Decisiones cerradas Q&A final:**
- Especialidades V1: las 5 (Pediatría, Med General, Gineco, Dental, Nutrición)
- Telemedicina: Daily.co V1
- NOM-024: firma simple V1, FIEL como add-on V2
- Reseñas: IA modera + auto-publica + denuncia manual
- Marketplace: automático Business+ con cédula validada

**Why:** Vertical humana es ~5x mercado de vet en MX. Pediatra es cliente confirmado. Las 5 especialidades cubren ~70% del mercado consultorio. Combinado con PHR + anti-no-show + marketplace público + IA, esto crea producto sin competencia en MX.

**How to apply:** Sub-tipo `humana` activa lógica fiscal de servicios médicos exentos, motor de receta detecta grupo COFEPRIS, plantillas de exploración por especialidad activadas según configuración del consultorio. Portal público es Next.js separado en monorepo con SEO por especialidad+ciudad.
