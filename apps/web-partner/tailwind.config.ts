import gaesPreset from "@gaespos/ui/tailwind-preset";
import type { Config } from "tailwindcss";

// Mismo estándar (preset) con acento VIOLETA: identifica el portal del partner
// contador frente al back-office (teal) y las apps de campo.
export default {
  presets: [gaesPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#7c3aed", dark: "#6d28d9", light: "#ede9fe" },
      },
    },
  },
} satisfies Config;
