import { getTiendaConfig } from "@/lib/api";
import { svgIcono } from "@/lib/icono-tienda";

/** Icono de la tienda, generado de su nombre. Ver `lib/icono-tienda`. */
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getTiendaConfig().catch(() => null);
  return new Response(svgIcono(config?.nombre?.trim() || "Tienda", false), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "private, max-age=300",
    },
  });
}
