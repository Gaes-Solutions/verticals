import gaesPreset from "@gaespos/ui/tailwind-preset";
import type { Config } from "tailwindcss";

// Mismo estándar (preset) con acento NARANJA: identifica la app de campo del
// vendedor frente al back-office (teal) y al portal B2B (azul).
export default {
  presets: [gaesPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#ea580c", dark: "#c2410c", light: "#ffedd5" },
      },
    },
  },
} satisfies Config;
