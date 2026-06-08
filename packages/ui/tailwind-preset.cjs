/**
 * Preset Tailwind compartido — el estándar visual de GaesSoft.
 * Todas las apps lo extienden via `presets: [require("@gaespos/ui/tailwind-preset")]`.
 * Lo ÚNICO que cada app personaliza es el color de acento `brand` (sub-marca por app);
 * neutros, estados, radios, sombras y tipografía son idénticos en todo el suite.
 *
 * Ver docs/design-system.md para el uso.
 */

// Acento por defecto: teal GaesSoft. La app de mayoreo lo sobreescribe a azul.
const brand = {
  DEFAULT: "#0f766e",
  dark: "#115e59",
  light: "#ccfbf1",
};

module.exports = {
  theme: {
    extend: {
      colors: {
        brand,
        // alias para la tienda B2C (usa `marca` históricamente)
        marca: brand,
        // estados semánticos: MISMOS en todas las apps
        ok: { DEFAULT: "#059669", light: "#d1fae5" },
        danger: { DEFAULT: "#dc2626", light: "#fee2e2" },
        warn: { DEFAULT: "#d97706", light: "#fef3c7" },
        info: { DEFAULT: "#2563eb", light: "#dbeafe" },
      },
      borderRadius: {
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
};
