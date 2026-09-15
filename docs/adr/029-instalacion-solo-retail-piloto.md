# ADR 029 — Instalación solo Retail para el piloto

- **Fecha:** 2026-09-15
- **Estado:** Aceptada (Gaby, 14-sep)

## Contexto

El proyecto atiende varios giros (Retail/Mayoreo, Abarrotes, Salud veterinaria y
humana, Despacho contable con partners). El piloto del 25-sep es solo Retail. Gaby
propuso clonar el código y dejar solo la tienda; el motivo es bajar el riesgo del
piloto.

Clonar ahora duplicaría cada corrección común (login, pagos, facturación,
inventario, seguridad) y movería el piloto a un código recién recortado, sin
probar en producción, a 10 días de la fecha.

## Decisión

Separar sin borrar.

1. **Respaldo** del proyecto completo en GitHub: etiqueta
   `respaldo-multivertical-2026-09-14` y rama `respaldo/multivertical-2026-09-14`.
2. **`VERTICALES_ACTIVAS`** en el API (lista separada por comas). Vacía = todos
   los giros, como hasta ahora. Con `retail_mayoreo`:
   - No se cargan los módulos de salud (pacientes, médicos, agenda, citas,
     consultas, recetas, mascotas, vacunas, camas, hospitalización, laboratorio,
     imagen, recordatorios de citas, portal de pacientes, expediente, marketplace
     de salud), de abarrotes (recargas) ni de partners.
   - No arranca el programador de recordatorios de citas y vacunas.
   - El registro público y "Crear cliente" del superadmin solo ofrecen y aceptan
     los giros activos (`GET /public/verticales`; 422 si llega otro).
   - Retail y mayoreo quedan completos: son un solo giro (`retail_mayoreo`) e
     incluyen vendedores de campo y portal B2B.
3. **Servicios de Railway** de otros giros se apagan (paso de Gaby).

Referencia: Shopify y Square mantienen varias líneas de producto en un mismo
código y activan por instalación lo que cada una ofrece.

## Pasos en producción (Gaby)

1. Railway → servicio **verticals** → Variables → `VERTICALES_ACTIVAS` =
   `retail_mayoreo` → Deploy.
2. Apagar los servicios que no son de Retail: **web-clinical**, **web-paciente**,
   **web-doctoralia**, **web-marketplace** y **web-partner** (en cada uno:
   Deployments → ⋮ del despliegue activo → Remove; y quitar su dominio en
   Settings → Networking).
3. Se quedan: **verticals** (API), **impartial-truth** (panel), **bountiful-victory**
   (POS), **endearing-vitality** (tienda web), **gracious-sparkle** (superadmin),
   **web-vendedor**, **web-b2b**, Postgres y Redis.

**Revertir:** borrar la variable (o poner todos los giros) y volver a desplegar
los servicios apagados. Nada se borró del código.

## Consecuencias

- Menos superficie expuesta y menos servicios pagados durante el piloto.
- Un negocio de salud creado antes seguiría existiendo, pero sus módulos no
  responden mientras salud esté apagado. Hoy no hay clientes de salud en producción.
- El clon limpio en repo aparte queda como opción después del piloto, partiendo
  del respaldo.
