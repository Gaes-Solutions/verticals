import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // Build standalone para imagen Docker delgada (server.js + node_modules traced).
  output: "standalone",
  outputFileTracingRoot: join(__dirname, "../../"),
};
export default nextConfig;
