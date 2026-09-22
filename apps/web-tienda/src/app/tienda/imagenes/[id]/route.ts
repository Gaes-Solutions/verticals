import { apiRaw } from "@/lib/api";

/**
 * Fotos del catálogo. El API las guarda por tenant y solo las entrega con el
 * token de la tienda, así que el navegador las pide aquí: este handler las trae
 * con el token del negocio que corresponde a este dominio y las transmite tal
 * cual. La foto no cambia nunca (el id es de la foto, no del producto), así que
 * se cachea una semana en el navegador y en el CDN.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) return new Response(null, { status: 404 });

  let origen: Response;
  try {
    origen = await apiRaw(`/tienda/imagenes/${id}`);
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!origen.ok || !origen.body) return new Response(null, { status: origen.status || 404 });

  return new Response(origen.body, {
    headers: {
      "Content-Type": origen.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=604800, immutable",
      ...(origen.headers.get("content-length")
        ? { "Content-Length": origen.headers.get("content-length") as string }
        : {}),
    },
  });
}
