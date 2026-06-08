// postcss-import inlina el @import de @gaespos/ui/components.css ANTES de
// Tailwind, para que su @layer components encuentre el @tailwind components.
export default {
  plugins: { "postcss-import": {}, tailwindcss: {}, autoprefixer: {} },
};
