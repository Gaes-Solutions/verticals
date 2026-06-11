import gaesPreset from "@gaespos/ui/tailwind-preset";
import type { Config } from "tailwindcss";

// Acento índigo: distingue el panel de la PLATAFORMA del back-office de un negocio.
export default {
  presets: [gaesPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#4f46e5", dark: "#4338ca", light: "#e0e7ff" },
      },
    },
  },
} satisfies Config;
