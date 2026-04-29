# Análisis 5 — Reglas de negocio mexicanas

> **Estado:** ✅ Cerrado · **Fecha cierre:** 2026-04-27
> **Memoria persistente:** `project_gaes_pos_analisis_5_reglas_negocio_mx.md`

NO es modelo de datos — son reglas de comportamiento. Define qué activar/desactivar el motor según vertical.

## 5.1 Fiscales CFDI 4.0

### IVA
- **General 16%** todo MX
- **Frontera norte/sur 8%** — catálogo CPs SAT precargado + auto-detección por sucursal según CP emisor del CFDI, override manual
- **Tasa 0%** — canasta básica DOF, leche, libros, exportaciones (acreditable)
- **Exento** — Art. 15 LIVA: servicios médicos cédula validada, educación, transporte público (no acreditable)

### IEPS por categoría (precargado catálogo)
- Alcohol: 26.5%/30%/53% por graduación
- Tabaco: 160% + cuota fija
- Bebidas saborizadas con azúcar: $1.5994/L (actualizable anualmente)
- Comida chatarra >275 kcal/100g: 8%
- Plaguicidas: 6%/7%/9% por toxicidad
- Combustibles: cuota fija/L
- Telecomunicaciones: 3%
- **Auto-aplicación por clave SAT del producto**

### Retenciones automáticas (regla en `reglas_fiscales_especiales` 4.19)
- PM paga PF servicios profesionales/médicos: 10% ISR + 10.6667% IVA
- PM paga PF arrendamiento: 10% ISR
- Intermediarios DAS según tipo

### Cancelación CFDI
- 4 motivos (01 con folio sustituto, 02-04 sin)
- ≤72h: emisor libre
- >72h: aceptación receptor (3 días silencio = aceptado)

### CFDI globales
- Receptor genérico XAXX010101000, uso S01
- Periodicidad configurable tenant (diaria/semanal/quincenal/mensual)

### Redondeo IVA
- ±$0.01 por línea estándar SAT
- Sistema reporta diferencias de redondeo en CFDI
- 2 decimales por línea, redondeo matemático

### Catálogos SAT — actualización
- Cron mensual contra fuentes oficiales SAT
- Flag `schema_cfdi_version` para soportar transiciones (3.3 → 4.0 → futuro)
- Cron alerta admin GaesSoft si cambian claves o catálogos

## 5.2 Regulatorias por vertical

### Salud humana
- **NOM-024-SSA3-2010**: expediente electrónico, firma médico, conservación 5 años, log auditoría
- **COFEPRIS Grupos II/III**: receta física obligatoria (no digital), Grupo IV+ digital permitido
- **LFPDPPP datos sensibles**: consentimiento expreso
- **IVA exento Art. 15 LIVA fracc XIV**: solo si médico tiene cédula activa
- **Cédula SSa**: validación manual admin GaesSoft + revalidación anual (API SSa inestable)
- **Receta digital con QR** validable

### Salud veterinaria
- **SAGARPA/SENASICA** medicamentos
- **NOM-241-SSA1-2018** buenas prácticas farmacia vet
- **CFDI con IVA 16%** (NO exento, distinto a humana)
- **Cartilla rabia** obligatoria SAGARPA

### Abarrotes/Retail
- **NOM-051**: sellos octagonales (alto azúcares/sodio/grasas/calorías) — GaesSoft precarga catálogo productos comunes (Coca-Cola, Sabritas, Bimbo) por código barras, tenant override
- **IEPS auto** por catálogo SAT
- **IVA 0% canasta básica** lista DOF
- **Frontera 8%** por CP sucursal

### Recargas y servicios
- **Comisión recarga NO causa IVA** (intermediación)
- **Servicios CFE/SIAPA**: comisión por servicio sin IVA

### Mayoreo B2B
- **CFDI tipo_relacion 07** anticipos
- **Crédito empresarial**: V1 manual, V2 Buró de Crédito

### Profesional/Contadores
- **CSD vigencia 4 años**: alerta vencimiento 60 días antes a contacto principal tenant + admin GaesSoft
- **DIOT mensual** PM
- **Declaración anual ISR** (sistema genera reportes auxiliares)

## 5.3 Operativas

### Cortes caja
- X parcial sin cierre, Z definitivo con denominaciones, motivo obligatorio diferencias
- Default ON corte Z diario obligatorio (4.20)

### Redondeo
- Pesos: matemático 2 decimales por línea
- Efectivo (config tenant): peso superior, .50, .90 más cercano

### Propinas
- Default OFF (no común MX)
- Restaurantes V2: sugerida no obligatoria, aclarar voluntaria (NOM PROFECO)

### Devoluciones
- Cancelación <72h libre, >72h aceptación receptor
- Nota crédito alternativa
- Reintegro mismo método pago (CNBV)
- Garantía 30d defectos fábrica PROFECO

### LFPDPPP/ARCO
- Aviso privacidad obligatorio sitio + POS
- Plantilla GaesSoft con variables auto-llenadas (razón social, contacto), tenant edita/reemplaza
- ARCO: Acceso/Rectificación/Cancelación/Oposición
- INAI autoridad

### Comprobantes
- **Ticket POS NO es CFDI**
- **Autofacturación V1**: ticket con QR/folio, página `/factura/{folio_ticket}` donde cliente captura RFC y emite CFDI dentro del mes
- CFDI global consolida ventas sin RFC

### Multidivisa
- Tipo cambio DOF Banxico día anterior
- Operaciones USD registran tipo_cambio del día

### Trabajo
- Comisiones vendedores parte salario (LFT)
- Pago quincenal/mensual obligatorio
- **GaesSoft NO calcula nómina V1** (V2 módulo RH)

## 5.4 NOMs aplicables

- NOM-247 (CFDI 4.0) — fiscal
- NOM-024-SSA3 — expediente clínico humano
- NOM-241-SSA1 — farmacia vet
- NOM-051-SCFI/SSA1 — etiquetado frontal alimentos
- NOM-007-SSA2 — atención embarazo (módulo gineco)
- NOM-035-STPS — riesgo psicosocial (info módulo RH V2)

## 5.5 Activación de motor por vertical

```
salud_humana:
  ON: IVA exento honorarios + cédula, NOM-024 firma+QR,
      COFEPRIS controlados, marketplace Doctoralia
  OFF: IEPS bebidas

salud_vet:
  ON: IVA 16% normal, COFEPRIS+SAGARPA, cartilla rabia
  OFF: NOM-024, exento IVA

abarrotes:
  ON: IEPS bebidas/chatarra auto, NOM-051 sellos, recargas TAE,
      fiados, balanza granel, IVA 0% canasta básica
  OFF: NOM-024, COFEPRIS

retail_general:
  ON: IVA 16%/8% frontera por sucursal, garantía 30d PROFECO

mayoreo_b2b:
  ON: tipo_relacion 07 anticipos, listas precio mayoreo, crédito,
      multi-direcciones envío
```

## Why
Sin estas reglas el sistema no es legalmente operable en MX. Verticales activan/desactivan reglas porque cada uno tiene compliance distinto (vet ≠ humana ≠ abarrotes). Catálogos SAT actualizados mensualmente evitan multas por usar claves obsoletas. Autofacturación V1 cubre gap común MX donde cliente decide facturar después.

## How to apply
Reglas viven en `services/rules/` con motor de activación según `tenant.verticales_activos`. Catálogos SAT en master DB con cron mensual. Validación cédula SSa = workflow admin GaesSoft con revalidación anual. Alerta CSD 60d via job scheduler. Autofacturación = página pública Next.js con captura RFC + flow CFDI. NOM-051 sellos via campo en `productos.sellos_nom051` con override tenant. Cron alerta cambio catálogo SAT a slack admin GaesSoft.
