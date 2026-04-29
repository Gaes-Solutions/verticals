# GaesSoft POS — Flujo Veterinario en consulta (Flujo 4 cerrado)

> **Estado:** Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_flujo_veterinario.md`
> **Descripción:** Vertical Salud Vet Nivel 3 — expediente, recetas IA, hospitalización, laboratorio, imagenología, cartilla

Flujo 4 (Veterinario en consulta) aprobado por Gaby completo. Vertical Salud Vet Nivel 3 — diferenciador masivo del producto vs VetCloud/MyVet/Provet a precio MX.

**Pantalla principal:** calendario del día con citas (tipo Doctoralia: lista vertical de pacientes pendientes), vistas día/semana/mes/cola, sección hospitalizados, KPI producción del día.

**Apertura de expediente al recibir paciente:** datos clave de mascota (especie/raza/edad/peso/microchip), tutor, **resumen IA de últimas N visitas** (game changer — médico no lee 30 visitas, lee 4 líneas relevantes), banderas críticas (alergias, crónicas, vacunas próximas a vencer).

**Captura de consulta — formato SOAP estándar veterinario:**
- **Subjetivo**: motivo, síntomas en chips seleccionables + texto libre, tiempo evolución, tratamientos previos
- **Objetivo**: signos vitales (peso, T°, FC, FR, TLC, presión, mucosas) con flag IA fuera de rango por especie/raza/edad, exploración por aparatos, hallazgos
- **Análisis**: diagnóstico principal + diferenciales (médico tipea; sistema solo busca en catálogo CIE-10 vet con autocomplete — NO sugerencia IA de diagnóstico), pronóstico
- **Plan**: receta, estudios, hospitalización, próximo control

**Receta electrónica:**
- **Catálogo PLM/vademecum vet** con dosis de referencia estática (`mg/kg`, frecuencia, vía) — médico LEE y decide manualmente la dosis. NO IA calcula.
- **Validación rule-based de interacciones medicamentosas** (motor determinista sobre BD farmacológica, NO IA)
- **Alertas rule-based de alergias documentadas** del paciente
- IA puede **resumir indicaciones al tutor en lenguaje simple** parafraseando lo que el médico escribió (no genera juicio clínico)
- Entrega: imprimir + WhatsApp con PDF + portal del tutor (Doctoralia)
- Si medicamento se vende en clínica → genera venta vinculada automática
- **REGLA**: ver project_gaes_pos_no_autodiagnostico.md — IA NO calcula dosis ni sugiere medicamento, solo asiste en lectura/resumen

**Laboratorio (Nivel 3):**
- Solicitud estructurada (hematología/química/orina/heces) con catálogo
- Laboratorio interno (clínica con micro-lab) o externo IDEXX/otros
- V1: upload PDF de resultados externos. V2: integración API IDEXX VetConnect/Antech
- IA extrae valores estructurados del PDF
- Alertas de valores fuera de rango referencial
- Gráficas de evolución entre estudios

**Imagenología (Nivel 3):**
- V1: soporta DICOM/JPG/PNG/MP4, visor JPG/PNG con zoom/brillo/anotaciones, DICOM se almacena pero no se visualiza nativo (descarga a software externo)
- V2: visor DICOM nativo + IA detección hallazgos en radiografías (validar con radiólogos antes)
- Comparación lado a lado con estudios previos

**Hospitalización (Nivel 3) — el más complejo:**
- Camas virtuales configurables (chica/mediana/grande, vacía/ocupada/aseo/mantenimiento)
- Medicación programada con alarmas push al asistente de hospitalización a la hora exacta, marca aplicada con firma + nota, kardex
- Signos vitales por turno (cada N horas configurable), gráfica 24h
- Cargos automáticos a cuenta del tutor: cama/día, cada medicación, sueroterapia/ml, honorarios médicos por visita, laboratorios, procedimientos
- Al alta: ticket compilado para cobro

**Cartilla de vacunación digital:** vacunas con lote y caducidad del frasco (rastreabilidad para retiros del mercado), vía, reacción adversa, firma electrónica del médico, próxima fecha calculada, recordatorio WhatsApp 7 días antes al tutor.

**Cierre de consulta:** resumen IA al tutor en lenguaje simple por WhatsApp/email, cargos a cuenta, próxima cita sugerida, tiempo total para análisis productividad.

**Decisiones cerradas en Q&A final:**
- Catálogo precargado de 500 medicamentos veterinarios MX más usados (ICA, Pet's Pharma, Bayer Animal Health, MSD) + cada clínica agrega los suyos
- Plantillas estructuradas de exploración para 6 especies más comunes (perro, gato, conejo, aves, hurón, reptiles) + texto libre para exóticos
- CIE-10 veterinario precargado + diagnósticos custom por clínica
- Imagenología V1: subir DICOM y JPG/PNG, visor JPG/PNG. V2: visor DICOM nativo
- Receta electrónica con QR validable desde V1 (formato profesional, confianza a tutores)

**Permisos:** salud.consulta.create, salud.expediente.read/write, salud.recetar, salud.lab.solicitar/capturar_resultados, salud.imagen.subir, salud.hospitalizar, salud.cama.asignar, salud.medicacion.programar, salud.vacuna.aplicar, salud.cartilla.read.

**Integraciones críticas:** IDEXX VetConnect (V2), Antech, PIMS (microchips), Vetstoria (alterna a Doctoralia), futuro Rover/Pet Cloud.

**Diferenciador masivo vs VetCloud:** resumen IA al abrir, sugerencia diagnóstico diferencial IA, receta con dosis calculada IA + alertas, resumen al tutor lenguaje simple IA, portal Doctoralia integrado, multi-vertical en una sola plataforma.

**Why:** Vertical Salud Nivel 3 es donde GaesSoft salta 5 años delante del mercado MX. VetCloud cobra $80 USD/mes por menos de esto. La veterinaria de Gaby es uno de los 5 clientes esperando y este flujo lo cierra completo.

**How to apply:** En backend, modelar mascotas como entidad propia bajo cliente-tutor, expediente clínico con visitas estructuradas SOAP, hospitalización con kardex, vacunación con cartilla, integración con módulo POS para vender medicamentos. En frontend, app dedicada del médico (no el POS) con calendario, expediente y captura SOAP.
