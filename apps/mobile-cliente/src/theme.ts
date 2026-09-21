import { lightPalette } from "./palette";

export type { Palette } from "./palette";

/**
 * Tokens de marca GaesSoft para móvil. Acento app Cliente = teal B2C (#0f766e).
 * El tema se fija en CLARO de forma explícita: los estilos de cada pantalla se
 * resuelven con StyleSheet.create al importar el módulo, así que un cambio de
 * esquema del sistema en caliente no se reflejaría sin un refactor a hook de
 * tema (useTheme + contexto que re-renderice). La paleta oscura queda guardada
 * en palette.ts para ese refactor; no leer Appearance aquí.
 */
export const isDark = false;
export const colors = lightPalette;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const font = {
  h1: { fontSize: 24, fontWeight: "800" as const, color: colors.ink },
  h2: { fontSize: 18, fontWeight: "700" as const, color: colors.ink },
  title: { fontSize: 16, fontWeight: "700" as const, color: colors.ink },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.text },
  label: { fontSize: 13, fontWeight: "600" as const, color: colors.text },
  small: { fontSize: 12, fontWeight: "500" as const, color: colors.muted },
} as const;

export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOpacity: isDark ? 0.25 : 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
} as const;
