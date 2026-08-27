# Apps móviles (Negocio + Cliente) → main

Integra `mobile/apps` (28 commits, FF limpio sobre main, cero conflictos).

## Qué trae
- **@gaespos/api-client**: cliente HTTP seguro compartido por las apps.
- **App Negocio** (Expo/RN): paridad con el panel web (31 módulos) — POS/cobro, inventario,
  reportes, pedidos, clientes, CxC, B2B, devoluciones, compras, precios, promociones, monedero,
  comisiones, CFDI, contabilidad, usuarios/roles, 2FA, configuración, reseñas, preguntas, envíos,
  tienda, insights, automatizaciones, suscripción, dominio B2B, importador, guía. Íconos, diseño de
  marca, navegación por Menú, **modo oscuro**, **login con huella**, **importador CSV funcional**.
- **App Cliente** (Expo/RN): portal del comprador (pedidos + timeline, favoritos, direcciones, perfil).
- Docs: plan de kiosko y plan de liberación 25-sep.

## Riesgo
- **BAJO.** No modifica el backend ni la base de datos. **No requiere migraciones.**
- ⚠️ Cambia `.npmrc` a `shamefully-hoist=true` + un override de `@types/react` (necesario para
  bundlear las apps con Metro/pnpm). Afecta el `pnpm install` del monorepo. Verificado:
  `turbo typecheck` 29/29 verde y los builds web siguen OK. **Revisar que el deploy de Railway
  (API/web) pase tras el merge.**

## Verificación
- typecheck 29/29 · bundles Metro OK (Negocio ~1128 módulos, Cliente ~1093) · biome limpio.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
