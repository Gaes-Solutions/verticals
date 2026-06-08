# 🎨 Estándar visual GaesSoft (design system)

> Referencia única para construir UI consistente en las 4 apps. **Antes de crear
> cualquier pantalla nueva, leer esto y reusar las clases/componentes de aquí.**
> La regla está en CLAUDE.md: una vista que no sigue este estándar o no es
> responsive NO está terminada.

## Principio (cómo lo hacen las grandes)

Suites como Google Workspace, Zoho y Atlassian usan **un mismo lenguaje visual**
(tipografía, espaciado, neutros, componentes, estados idénticos) **+ un color de
acento por app** para que el usuario sepa en cuál está. GaesSoft hace lo mismo:

| App | Acento (`brand` / `marca`) | Quién la usa |
|-----|----------------------------|--------------|
| web-admin | **teal** `#0f766e` | dueño / gerente |
| web-pos | **teal** `#0f766e` | cajero |
| web-tienda | **teal** `#0f766e` (alias `marca`) | cliente B2C |
| web-b2b | **azul** `#1d4ed8` | cliente mayorista |

Todo lo demás (neutros, estados, radios, sombras, tipografía) es **idéntico** y
viene del preset compartido. Nunca metas un color nuevo a mano: usa los tokens.

## Tokens compartidos

Definidos en **`packages/ui/tailwind-preset.cjs`**, los heredan las 4 apps con
`presets: [require("@gaespos/ui/tailwind-preset")]`.

- **Acento**: `brand` (`brand-dark`, `brand-light`). En la tienda también `marca`.
- **Estados** (iguales en todas): `ok` (verde), `danger` (rojo), `warn` (ámbar),
  `info` (azul). Cada uno con su variante `-light` para fondos de badge.
- **Neutros**: paleta `slate` de Tailwind. Texto principal `slate-800`,
  secundario `slate-500`, bordes `slate-200/300`, fondo de página `slate-100`.
- **Radio**: `rounded-lg` (controles), `rounded-xl` (tarjetas/tablas).
- **Sombra**: `shadow-card` (tarjetas y tablas).
- **Tipografía**: `font-sans` (system-ui). Títulos `text-2xl font-bold`,
  secciones `text-lg font-bold`, cuerpo `text-sm`.

## Componentes (clases `gx-`)

Definidos en **`packages/ui/components.css`** (importado en el CSS de entrada de
cada app). Usar SIEMPRE estas clases en vez de reescribir Tailwind a mano:

| Clase | Uso |
|-------|-----|
| `gx-btn-primary` | acción principal (acento sólido) |
| `gx-btn-secondary` | acción secundaria (borde acento) |
| `gx-btn-ghost` | acción terciaria (sin borde) |
| `gx-btn-danger` | acción destructiva |
| `gx-input` | inputs y selects |
| `gx-label` | etiqueta de campo |
| `gx-card` | tarjeta blanca con padding y sombra |
| `gx-table-wrap` + `gx-table` | tabla con **scroll horizontal en móvil** |
| `gx-th` / `gx-td` | celdas de tabla |
| `gx-badge-ok / -warn / -danger / -info` | chips de estado |
| `gx-modal-overlay` + `gx-modal-panel` | modal centrado responsive |

Ejemplo de tabla (patrón estándar):

```tsx
<div className="gx-table-wrap">
  <table className="gx-table">
    <thead><tr><th className="gx-th">Folio</th>…</tr></thead>
    <tbody><tr><td className="gx-td">…</td></tr></tbody>
  </table>
</div>
```

Modal:

```tsx
<div className="gx-modal-overlay">
  <div className="gx-modal-panel">…</div>
</div>
```

## Reglas responsive (obligatorias)

Mobile-first: las clases base son para celular; `sm:` `md:` `lg:` agrandan.

1. **Sidebars** → drawer con hamburguesa en `<md`, fijo en `≥md` (ver `App.tsx`
   de web-admin / web-b2b como patrón canónico).
2. **Tablas** → siempre dentro de `gx-table-wrap` (scroll lateral, nunca aplastar).
3. **Grids** → con breakpoints: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
4. **Layouts en columnas** → apilar en móvil: `flex-col md:flex-row`, `w-full md:w-1/2`.
5. **Padding de página** → `p-4 md:p-6`.
6. **Targets táctiles** ≥ 40px de alto (`py-2.5` mínimo en botones de nav).
7. **Headers con muchos elementos** → `flex-wrap gap-2`.
8. **Ancho mínimo de viewport objetivo: 360px.** Sin scroll horizontal accidental.

## Checklist antes de cerrar una pantalla

- [ ] Probada a 360px de ancho sin scroll horizontal accidental
- [ ] Tablas con `gx-table-wrap`
- [ ] Botones/inputs usan clases `gx-`
- [ ] Colores solo desde tokens (acento `brand`, estados `ok/danger/warn/info`, neutros `slate`)
- [ ] Grids y columnas con breakpoints
- [ ] Estados vacíos y de carga contemplados
