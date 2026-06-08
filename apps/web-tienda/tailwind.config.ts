import gaesPreset from "@gaespos/ui/tailwind-preset";
import type { Config } from "tailwindcss";

// `marca` (teal) viene del preset compartido. Ver docs/design-system.md.
export default {
  presets: [gaesPreset],
  content: ["./src/**/*.{ts,tsx}"],
} satisfies Config;
