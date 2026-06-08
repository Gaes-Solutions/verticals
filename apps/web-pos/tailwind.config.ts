import gaesPreset from "@gaespos/ui/tailwind-preset";
import type { Config } from "tailwindcss";

// Acento heredado del preset (teal GaesSoft). Ver docs/design-system.md.
export default {
  presets: [gaesPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
} satisfies Config;
