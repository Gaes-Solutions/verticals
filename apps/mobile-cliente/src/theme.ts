import { Appearance } from "react-native";

/**
 * Tokens de marca GaesSoft para móvil. Acento app Cliente = índigo.
 * Soporta modo claro/oscuro según el sistema (se resuelve al arrancar la app).
 * Tokens por ROL (brandLight = fondo sutil, brandDark = texto/énfasis).
 */
type Palette = {
  brand: string;
  brandDark: string;
  brandLight: string;
  ok: string;
  okLight: string;
  danger: string;
  dangerLight: string;
  warn: string;
  warnLight: string;
  info: string;
  infoLight: string;
  ink: string;
  text: string;
  muted: string;
  faint: string;
  line: string;
  bg: string;
  card: string;
  white: string;
  onBrandMuted: string;
};

const light: Palette = {
  brand: "#4f46e5",
  brandDark: "#4338ca",
  brandLight: "#e0e7ff",
  ok: "#059669",
  okLight: "#d1fae5",
  danger: "#dc2626",
  dangerLight: "#fee2e2",
  warn: "#d97706",
  warnLight: "#fef3c7",
  info: "#2563eb",
  infoLight: "#dbeafe",
  ink: "#0f172a",
  text: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  bg: "#eef2ff",
  card: "#ffffff",
  white: "#ffffff",
  onBrandMuted: "rgba(255,255,255,0.75)",
};

const dark: Palette = {
  brand: "#818cf8",
  brandDark: "#c7d2fe",
  brandLight: "#312e81",
  ok: "#34d399",
  okLight: "#064e3b",
  danger: "#f87171",
  dangerLight: "#7f1d1d",
  warn: "#fbbf24",
  warnLight: "#78350f",
  info: "#60a5fa",
  infoLight: "#1e3a8a",
  ink: "#f8fafc",
  text: "#cbd5e1",
  muted: "#94a3b8",
  faint: "#64748b",
  line: "#334155",
  bg: "#0b1120",
  card: "#1e293b",
  white: "#ffffff",
  onBrandMuted: "rgba(255,255,255,0.75)",
};

export const isDark = Appearance.getColorScheme() === "dark";
export const colors: Palette = isDark ? dark : light;

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
