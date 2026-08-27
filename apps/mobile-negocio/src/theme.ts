/**
 * Tokens de marca GaesSoft para móvil (mismos valores que packages/ui web).
 * Acento por app: Negocio = teal. Cada pantalla usa SOLO estos tokens.
 */
export const colors = {
  brand: "#0f766e",
  brandDark: "#115e59",
  brandLight: "#ccfbf1",
  ok: "#059669",
  okLight: "#d1fae5",
  danger: "#dc2626",
  dangerLight: "#fee2e2",
  warn: "#d97706",
  warnLight: "#fef3c7",
  info: "#2563eb",
  infoLight: "#dbeafe",
  // Neutros (slate)
  ink: "#0f172a",
  text: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  bg: "#f1f5f9",
  card: "#ffffff",
  white: "#ffffff",
} as const;

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
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
} as const;
