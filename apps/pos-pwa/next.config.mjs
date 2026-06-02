/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El service worker (public/sw.js) y el manifest se sirven estáticos.
  // PWA mínima sin next-pwa para no acoplar a un plugin; el SW es manual.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};
export default nextConfig;
