# ADR 012 — Biome sobre ESLint + Prettier

**Fecha:** 2026-04-27
**Estado:** Aceptada
**Autor:** Gaby (decisión) + Claude (redacción)

## Contexto

Monorepo Turborepo con ~13 apps + 12 packages + 4 services en TypeScript. Necesita:
- Linter con reglas TS strictas
- Formatter consistente
- Performance buena (lint completo en pre-commit + CI sin frustrar dev)
- Configuración minimal (1 archivo idealmente, no 5 + plugins)
- Soporte JSX, TS, JSON

## Decisión

**Biome** (un solo binario Rust) para linting + formatting en todo el monorepo. Configuración en `biome.json` raíz con overrides por app/package si se requiere.

## Alternativas consideradas

- **A) ESLint + Prettier (defacto Node)**
  - ✅ Ecosistema masivo, plugins para todo
  - ✅ Reglas extensibles (typescript-eslint, react, jsx-a11y, etc.)
  - ❌ Performance: lint completo monorepo Turborepo grande tarda 30s-2min
  - ❌ Configuración compleja: `.eslintrc`, `.prettierrc`, `.prettierignore`, package deps de 10+ plugins
  - ❌ Conflictos ESLint vs Prettier (require eslint-config-prettier)
  - ❌ Mantenimiento: actualizar plugin compatibilities cada upgrade

- **B) Biome** ← elegida
  - ✅ ~10-25x más rápido que ESLint+Prettier (Rust nativo)
  - ✅ Un solo `biome.json` para lint + format
  - ✅ Un solo binario instalado (no 10 deps)
  - ✅ Reglas TS strict, JSX, accesibility, complexity, suspicious code
  - ✅ Format determinístico (idéntico a Prettier en 95% casos)
  - ✅ Madurez 2025+: v1.9+ estable, casos producción Vercel, Stripe internos
  - ⚠️ Reglas no son 1:1 con ESLint (algunos plugins ESLint-only no tienen equivalente)
  - ⚠️ Comunidad menor (mitigado: docs sólidos + GitHub issues activos)

- **C) dprint + tsc strict + custom checks**
  - ✅ Performance excelente
  - ❌ Cobertura de reglas menor
  - ❌ Más DIY

## Consecuencias

- ✅ Lint + format completo en pre-commit <2s incluso con monorepo grande
- ✅ CI workflow más rápido (lint check ~5s vs ~60s con ESLint)
- ✅ Onboarding nuevos developers más simple (1 archivo config)
- ✅ Menos deps en `package.json` raíz (3 vs 15+)
- ⚠️ Si necesitamos regla ESLint-only crítica, fallback es agregar tsc check específico o script custom
- ⚠️ Algunas integraciones IDE menos pulidas que ESLint (mitigado: VSCode plugin oficial bueno)
- 🔁 Reversible a ESLint+Prettier en horas si Biome bloquea (config conversion straightforward)

## Configuración inicial propuesta

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": { "noExcessiveCognitiveComplexity": "warn" },
      "correctness": { "noUnusedVariables": "error" },
      "suspicious": { "noConsoleLog": "warn" },
      "style": { "useConst": "error", "useTemplate": "error" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always" }
  }
}
```

## Referencias

- Análisis 9 — Arquitectura, sección Convenciones código
- Memoria: `project_gaes_pos_analisis_9_arquitectura.md`
- Pattern referenciado: Vercel (uso interno Biome), Astro framework (Biome desde 2024)
