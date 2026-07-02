import gaesPreset from "@gaespos/ui/tailwind-preset";
import type { Config } from "tailwindcss";

// Mismo estándar (preset) pero con acento AZUL: distingue el portal mayorista
// del back-office (teal) y la tienda. Ver docs/design-system.md.
export default {
  presets: [gaesPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#1d4ed8", dark: "#1e3a8a", light: "#dbeafe" },
      },
    },
  },
} satisfies Config;
