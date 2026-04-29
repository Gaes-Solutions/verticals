# ADR 008 — WhatsApp Cloud API Meta directo sobre Twilio

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

GaesSoft POS usa WhatsApp como canal principal de comunicación con clientes finales:
- Confirmaciones de cita (vet/humana, Análisis 4.18, Flujo 5)
- Recovery codes carrito abandonado (4.21 ecommerce)
- CFDI link al cliente al timbrar
- Campañas marketing (4.18) — RFM segmentado
- Tracking paquetería public (4.21)
- Notificaciones de cobro / vencimiento CxC (4.9)

Volumen estimado V1: ~10K-50K mensajes/mes. Crece con número de tenants y campañas.

## Decisión

**WhatsApp Cloud API directa con Meta** (Business Platform). GaesSoft tiene Business Account + Meta phone number ID por tenant verificado. **Twilio queda solo para SMS** V1; voz V2 si se justifica.

## Alternativas consideradas

- **A) Twilio WhatsApp Business API**
  - ✅ DX excelente, 1 SDK para WhatsApp + SMS + Voz
  - ✅ Twilio se encarga del onboarding Meta + numero verificado
  - ❌ Costo ~$0.08-0.10 USD/conversación + Twilio fee ~$0.005 → ~2x más caro
  - ❌ Layer adicional → más latencia + más superficie de fallo
  - ❌ Plantillas de mensaje requieren ir Twilio → Meta (proceso doble)

- **B) WhatsApp Cloud API directo Meta** ← elegida
  - ✅ ~$0.04 USD/conversación (~50% más barato que Twilio)
  - ✅ Plantillas se aprueban directo en Meta Business Manager
  - ✅ Webhook entrante directo Meta → GaesSoft (delivered, read, clicked, replied, inbound)
  - ✅ 1000 conversaciones/mes free tier en algunos países
  - ✅ Acceso completo a features Cloud API (botones, listas, productos catalog, flows)
  - ⚠️ Onboarding inicial Meta Business: verificación negocio, número, etc. (1-2 semanas)
  - ⚠️ GaesSoft maneja la integración directa (más superficie de mantenimiento)

- **C) MessageBird / Vonage / proveedores BSP**
  - ✅ Algunos con buenos precios
  - ❌ Otra capa entre GaesSoft y Meta
  - ❌ Lock-in con BSP que cambie términos

## Consecuencias

- ✅ Costo WhatsApp ~50% menor → permite incluir mensajes en plan tier (4.1) sin sangrar margen
- ✅ Webhooks entrantes directo Meta → menos latencia (delivery confirmations en segundos)
- ✅ Plantillas Meta dual-scope (4.18): GaesSoft globales + tenant custom
- ✅ Botones interactivos, flows, productos catalog disponibles para Hito 4 marketing
- ⚠️ Onboarding tenant requiere verificación Meta Business (proceso 1-2 semanas la primera vez)
- ⚠️ Si Meta cambia precios o políticas, mitigación es re-evaluar Twilio como fallback (refactor moderado)
- 🔁 SMS sigue en Twilio (mejor cobertura MX SMS que Meta no ofrece)
- 🔁 V2: voz Twilio si feature de llamadas se justifica

## Referencias

- Análisis 7 — Integraciones, sección WhatsApp Cloud
- Análisis 4.18 — Promociones y Marketing
- Memoria: `project_gaes_pos_analisis_7_integraciones.md`
