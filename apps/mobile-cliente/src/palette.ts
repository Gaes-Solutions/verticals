/**
 * Paletas de color puras (sin dependencia de react-native) para que módulos
 * que corren fuera de la app (p. ej. el HTML del WebView de pagos) tomen los
 * mismos tokens de marca. theme.ts elige y expone la activa.
 * Acento app Cliente = teal GaesSoft B2C (#0f766e).
 * Tokens por ROL (brandLight = fondo sutil, brandDark = texto/énfasis).
 */
export type Palette = {
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

export const lightPalette: Palette = {
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
  ink: "#0f172a",
  text: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  bg: "#f8fafc",
  card: "#ffffff",
  white: "#ffffff",
  onBrandMuted: "rgba(255,255,255,0.75)",
};

export const darkPalette: Palette = {
  brand: "#2dd4bf",
  brandDark: "#99f6e4",
  brandLight: "#134e4a",
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
