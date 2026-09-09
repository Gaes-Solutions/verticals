# Pruebas de carga y rendimiento

Validan los **presupuestos no negociables** de `CLAUDE.md`. Hay dos herramientas porque miden
cosas distintas y ninguna sustituye a la otra.

## 1. Medición local (sin instalar nada) — corre hoy

Levanta la API en proceso, siembra un tenant con **500 productos** y mide la latencia real de
los caminos críticos con 200 muestras por caso, más 20 de calentamiento.

```bash
cd apps/api
set -a && . ../../.env && set +a
pnpm vitest run --config test/carga.config.ts
```

Falla con código distinto de cero si algún P95 se sale del presupuesto, así que sirve en CI.
No está en la batería normal: tarda y depende de la máquina.

### Resultados medidos (2026-09-09, equipo de desarrollo)

| Caso | P50 | P95 | Máx | Presupuesto | Resultado |
|---|---|---|---|---|---|
| Búsqueda producto POS | 6.9 ms | 7.9 ms | 10.4 ms | < 100 ms | cumple |
| Agregar línea a venta | 8.9 ms | 10.4 ms | 11.8 ms | < 50 ms | cumple |
| Checkout completo sin CFDI | 5.6 ms | 6.5 ms | 9.7 ms | < 500 ms | cumple |

Los tres pasan con holgura: el más ajustado usa una quinta parte de su presupuesto.

**Cómo leer estos números.** Miden el trabajo del servidor sin red ni concurrencia, contra una
base local. Producción añade latencia de red y contención entre usuarios, así que el número real
será mayor. Por eso existe la segunda herramienta.

## 2. k6 (concurrencia y red) — requiere instalación

Mide con 10 usuarios simultáneos durante 30 segundos, sobre HTTP real.

```bash
# Instalar k6 una sola vez (requiere sudo):
#   https://k6.io/docs/get-started/installation/

BASE_URL=http://localhost:3000 TOKEN=<jwt> SUCURSAL_ID=<id> CAJA_ID=<id> \
VARIANTE_ID=<id> CODIGO=<barras> k6 run tests/carga/k6/presupuestos.js
```

Los umbrales están declarados en el script: si un P95 se pasa, k6 sale con error.

**Nunca apuntes k6 a producción.** Crea ventas reales.

## Pendiente

- Presupuesto de **sync push de 100 operaciones < 1s P95**: aún sin medir.
- Presupuesto de **timbrado CFDI < 3s P95**: depende del proveedor externo, hay que medirlo
  contra el sandbox de Facturama cuando haya llave configurada.
- Carga inicial de la app POS < 2s TTI: se mide en el navegador, no aquí.
