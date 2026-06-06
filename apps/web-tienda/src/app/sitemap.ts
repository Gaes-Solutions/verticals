import { api } from "@/lib/api";
import type { MetadataRoute } from "next";

const BASE_URL = process.env.TIENDA_PUBLIC_URL ?? "http://localhost:3001";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const estaticas: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/carrito`, changeFrequency: "monthly", priority: 0.3 },
  ];
  try {
    const catalogo = await api<{ items: Array<{ slugSeo: string; updatedAt?: string }> }>(
      "/tienda/catalogo?pageSize=100",
    );
    const productos: MetadataRoute.Sitemap = catalogo.items.map((p) => ({
      url: `${BASE_URL}/producto/${p.slugSeo}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      ...(p.updatedAt ? { lastModified: new Date(p.updatedAt) } : {}),
    }));
    return [...estaticas, ...productos];
  } catch {
    return estaticas;
  }
}
