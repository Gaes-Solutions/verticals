import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // azul corporativo para diferenciar del back-office (teal) y la tienda
        brand: { DEFAULT: "#1d4ed8", dark: "#1e3a8a" },
      },
    },
  },
  plugins: [],
} satisfies Config;
