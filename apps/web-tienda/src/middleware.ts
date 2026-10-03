import { type NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * Resuelve qué tienda mostrar según el host de la petición: consulta el registro
 * global host→tenant y, si hay match verificado, fija `x-tienda-slug` para que el
 * BFF use ese tenant. Sin match (o en localhost), el BFF cae al tenant por env.
 * El header entrante del cliente se descarta siempre (no es confiable).
 */
export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-tienda-slug");

  const esLocal = !host || host === "localhost" || host.startsWith("127.");
  if (!esLocal) {
    try {
      const res = await fetch(
        `${API_URL}/public/storefront/resolve?host=${encodeURIComponent(host)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        return NextResponse.json(
          { message: "No se pudo resolver esta tienda; inténtalo de nuevo." },
          { status: 503 },
        );
      }
      const { tenantSlug } = (await res.json()) as { tenantSlug?: string };
      if (!tenantSlug) {
        return NextResponse.json({ message: "Tienda no encontrada." }, { status: 404 });
      }
      requestHeaders.set("x-tienda-slug", tenantSlug);
    } catch {
      // Nunca caer al tenant global: una resolución fallida no puede mostrar
      // accidentalmente el catálogo de otra tienda.
      return NextResponse.json(
        { message: "No se pudo resolver esta tienda; inténtalo de nuevo." },
        { status: 503 },
      );
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js)$).*)",
  ],
};
