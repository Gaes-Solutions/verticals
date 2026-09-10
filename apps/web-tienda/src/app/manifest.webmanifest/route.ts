import { getTiendaConfig } from "@/lib/api";

/**
 * Manifiesto por tienda. Es lo que convierte "agregar a pantalla de inicio" en
 * la app de ESE negocio: el comprador termina con un icono que dice el nombre
 * de su tienda, no "Tienda GaesSoft".
 *
 * Se genera por petición porque el mismo despliegue sirve varias tiendas según
 * el dominio; un archivo estático solo podría decir una cosa.
 */
export const dynamic = "force-dynamic";

const COLOR = "#0d9488";

export async function GET() {
  const config = await getTiendaConfig().catch(() => null);
  const nombre = config?.nombre?.trim() || "Tienda";
  // El nombre corto es el que cabe debajo del icono en el teléfono.
  const corto = nombre.length > 12 ? `${nombre.slice(0, 11).trimEnd()}…` : nombre;

  return Response.json(
    {
      name: nombre,
      short_name: corto,
      description: config?.lema?.trim() || `Compra en línea en ${nombre}`,
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: COLOR,
      lang: "es-MX",
      icons: [
        { src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icono-recortable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      ],
    },
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        // Cada tienda tiene el suyo: que ningún intermediario lo comparta.
        "cache-control": "private, max-age=300",
      },
    },
  );
}
