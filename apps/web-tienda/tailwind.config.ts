import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marca: { DEFAULT: "#0f766e", dark: "#115e59" },
      },
    },
  },
  plugins: [],
} satisfies Config;
