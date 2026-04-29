# ADR 010 — PHR centrado en paciente (master DB) sobre per-tenant

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

GaesSoft Salud (vet + humana) maneja expedientes médicos. NOM-024-SSA3-2010 obliga: expediente electrónico con firma médico, conservación 5 años, log auditoría. Pero el paciente real (humano o mascota) puede ser atendido por **múltiples doctores en distintos consultorios** (tenants distintos en GaesSoft):
- Pediatra en Clínica A → tiene un expediente
- Ortopedista en Clínica B → otro expediente
- Urgencia en Hospital C → otro más

Hoy en MX (sin GaesSoft) el paciente carga papeles físicos entre médicos. Doctoralia/portales similares no resuelven esto: cada médico ve solo su pedazo.

## Decisión

**PHR (Personal Health Record) centrado en paciente, almacenado en master DB cross-tenant**, con `patient_master` (humanos) y `pet_master` (mascotas) separados como tablas independientes en master schema. Cada `consultation_record` por tenant referencia al `patient_master.id`. El paciente es **dueño de su expediente** (ARCO/LFPDPPP) y puede:
- Ver historial unificado en portal paciente (Flujo 7)
- Compartir con cualquier médico GaesSoft autorizado
- QR emergencia para urgencias
- Exportar copia descargable

Datos médicos en formato **HL7 FHIR JSONB** (estándar internacional). Consents polimórficos por tenant + por escope.

## Alternativas consideradas

- **A) PHR per-tenant (cada clínica tiene su expediente del paciente)**
  - ✅ Aislamiento natural con multi-tenancy schema-per-tenant
  - ✅ Compliance simple (cada tenant responsable de sus datos)
  - ❌ Paciente ve su historial fragmentado por consultorio
  - ❌ Ortopedista no ve diabetes diagnosticada por endocrinólogo → diagnósticos repetidos, alergias ignoradas
  - ❌ Doctoralia no agrega valor real (mismo problema fragmentación)
  - ❌ Compite con feature: Eleventa et al. tienen exactamente esto, no diferencia

- **B) PHR centrado en paciente master DB cross-tenant** ← elegida
  - ✅ **Diferenciador #1 de GaesSoft Salud**: paciente con historial unificado
  - ✅ Médico en consultorio nuevo ve antecedentes, alergias, medicación actual de inmediato
  - ✅ Pediatra ve cartilla vacunación de cualquier consultorio previo
  - ✅ Compliance: paciente es dueño legal del expediente (ARCO completo)
  - ✅ FHIR JSONB → interoperabilidad futura con SSa, IMSS, hospitales
  - ✅ Tenant solo guarda lo que el paciente autoriza (consents granulares)
  - ⚠️ Master DB con PHI requiere encriptación a nivel reposo + logs auditoría (4.4)
  - ⚠️ Cross-tenant queries de PHR requieren autorización paciente (consents)
  - ⚠️ Compliance USA HIPAA si expandimos: BAA con Anthropic+OpenAI ya cubre (Análisis 7)

- **C) Híbrido: copia local en tenant + maestra en master**
  - ✅ Performance lectura
  - ❌ Doble fuente verdad → bugs de sync
  - ❌ Más complejo sin valor real

## Consecuencias

- ✅ Diferenciador competitivo real vs Eleventa, ContPaq, Doctoralia
- ✅ Paciente fideliza con plataforma (no con médico individual) → network effect
- ✅ Cumplimiento ARCO/LFPDPPP por diseño (paciente es dueño)
- ✅ Anti-no-show con reputation score cross-tenant (paciente que falta en una clínica suma rep mala global)
- ⚠️ Master DB necesita controles HIPAA-grade (encriptación reposo, audit logs, BAA Anthropic+OpenAI)
- ⚠️ Multi-tenancy schema-per-tenant convive con master DB → CLI `gaes-migrate` maneja ambos
- ⚠️ Clínicas tradicionales pueden objetar "perder al paciente" — mitigación: marketing con narrativa "tu paciente vuelve más informado"
- 🔁 No reversible sin perder feature core de Salud — pero no hay caso para reversar; PHR centrado en paciente es la apuesta

## Referencias

- Análisis 4.3 — PHR
- Análisis 4.17 — Portal Doctoralia (consume PHR)
- Análisis 4.15-4.16 — Salud (consume PHR para consultas)
- Flujo 7 — Paciente portal
- ADR-001 (Multi-tenancy schema-per-tenant; PHR es excepción justificada en master DB)
- ADR-011 (NO IA clínica decisional — restringe lo que se puede hacer con PHR)
- Memoria: `project_gaes_pos_phr.md`, `project_gaes_pos_modelo_4_3_phr.md`
