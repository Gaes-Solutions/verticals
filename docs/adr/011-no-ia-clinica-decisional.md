# ADR 011 — NO IA clínica decisional (regla extendida)

**Fecha:** 2026-04-27
**Estado:** Aceptada · LÍNEA ROJA
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

GaesSoft POS incluye 10 features de IA en V1 (Análisis 4.5) usando Anthropic Claude + OpenAI GPT-4o + Whisper. Vertical Salud (humana + vet) tiene flujos donde la IA podría tentar a:
- Sugerir dosis de medicamento basado en peso del paciente
- Recomendar diagnóstico diferencial al médico
- Auto-completar receta con interacciones medicamentosas
- Triage paciente desde portal ("síntomas? ¿qué tienes?")
- Sugerir tratamientos al médico durante consulta

México (LFPDPPP, NOM-024) y USA (FDA, HIPAA) tienen marcos regulatorios donde "software médico que diagnostica/trata" puede ser clasificado como **dispositivo médico** (FDA SaMD, COFEPRIS dispositivo). Eso requiere certificación, ensayos clínicos, responsabilidad civil distinta.

GaesSoft NO es una empresa con esa estructura ni quiere serlo V1.

## Decisión

**NO IA clínica decisional.** La IA puede:
- ✅ Transcribir consulta (Whisper) y estructurar SOAP
- ✅ Resumir expediente histórico (texto narrativo)
- ✅ Buscar en catálogo PLM (medicamentos) por nombre/principio activo
- ✅ Generar borrador de receta con datos que el médico capturó
- ✅ Validación rule-based (alergias capturadas, dosis máximas catálogo)
- ✅ Recordar al médico revisar interacciones (no recomendarlas)
- ✅ Asistir con redacción de notas, recetas, indicaciones (estilo, ortografía)

La IA NO puede:
- ❌ Sugerir diagnósticos al médico
- ❌ Recomendar tratamientos o medicamentos no capturados
- ❌ Calcular dosis (catálogo PLM provee dosis, IA solo busca)
- ❌ Triage del lado paciente ("¿qué tengo?")
- ❌ Auto-diagnóstico paciente
- ❌ Sustituir juicio clínico en ningún flujo

**Aplica del lado paciente Y del lado médico** (regla EXTENDIDA, decisión Gaby).

## Alternativas consideradas

- **A) IA decisional plena** (sugerencias activas)
  - ✅ Diferenciador "wow" demos
  - ❌ Riesgo regulatorio MX/US (SaMD, COFEPRIS)
  - ❌ Riesgo de litigio civil si IA sugiere algo dañino
  - ❌ Cliente médico desconfía (médicos NO quieren IA que les dice qué hacer)
  - ❌ Necesita ensayos clínicos para defender legalmente

- **B) IA decisional solo médico (no paciente)**
  - ⚠️ Aún cae en SaMD si hay claim de mejorar diagnóstico
  - ❌ Misma exposición legal
  - ❌ Decisión Gaby: NO

- **C) IA NO decisional (asistencia documental + búsqueda + transcripción)** ← elegida
  - ✅ Cero exposición SaMD / COFEPRIS dispositivo
  - ✅ Cero responsabilidad civil "IA causó daño"
  - ✅ Médicos cómodos: IA les ahorra escribir, NO les dice qué hacer
  - ✅ Pacientes seguros: portal NO da consejos, redirige a médico
  - ⚠️ Demos menos espectaculares que competidores que prometen "IA diagnóstica"
  - ✅ Posicionamiento honesto y defendible legalmente

## Consecuencias

- ✅ Salud humana y vet 100% legales en MX V1 sin certificación dispositivo
- ✅ Médicos confían más (asistente que NO opina sobre clínica)
- ✅ Paciente protegido (no auto-diagnóstico)
- ✅ Anthropic+OpenAI BAA cubre PHI sin problema (uso transcripción/resumen)
- ⚠️ Diferenciación de marketing distinta: NO "IA diagnóstica", sí "IA que ahorra tiempo administrativo"
- ⚠️ Catálogo PLM precargado es **clave** (la IA busca en él, no inventa)
- 🔁 V3+: si GaesSoft decide ser dispositivo médico certificado, esto cambia. Es decisión estratégica de empresa, no de producto V1.

## Cómo aplicar (operativo)

1. **Prompts de IA** explícitos: "NO sugieras diagnósticos, NO recomiendes tratamientos. Solo transcribe/resume/busca en catálogo."
2. **Code reviews** revisan prompts al modificar features IA Salud.
3. **Disclaimers UI** en módulos Salud: "Asistente de documentación. No reemplaza juicio clínico."
4. **Pruebas E2E** validan que IA NO genera contenido fuera de catálogo PLM.
5. **Auditoría** logs IA (4.4) para detectar drift hacia decisional.

## Referencias

- Análisis 4.5 — IA features (10 features V1)
- Análisis 4.15-4.16 — Salud (consultas, hospitalización)
- Análisis 7 — Integraciones (BAA Anthropic+OpenAI)
- Memoria: `project_gaes_pos_no_autodiagnostico.md`, `project_gaes_pos_ia.md`, `project_gaes_pos_modelo_4_15_salud_pacientes_consultas.md`
- Marco regulatorio: FDA SaMD (USA), COFEPRIS dispositivos (MX)
