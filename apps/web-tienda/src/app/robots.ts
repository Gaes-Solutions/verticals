import type { MetadataRoute } from "next";

const BASE_URL = process.env.TIENDA_PUBLIC_URL ?? "http://localhost:3001";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // páginas privadas/transaccionales sin valor SEO
      disallow: ["/cuenta", "/checkout", "/carrito", "/recovery", "/api"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
