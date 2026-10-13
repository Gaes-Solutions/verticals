import { getClienteToken } from "@/lib/cliente";
import type { ResultadoMapa } from "@/lib/direccion-mapa";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const cache = new Map<string, { hasta: number; resultado: ResultadoMapa }>();
let ultimaConsulta = 0;
const TTL = 10 * 60_000;

/** Same-origin proxy; no browser CORS dependency or coordinates in application logs. */
export async function GET(req: Request) {
  try {
    if (!(await getClienteToken()))
      return NextResponse.json(
        { message: "Inicia sesión para buscar tu dirección." },
        { status: 401 },
      );
  } catch {
    return NextResponse.json(
      { message: "No pudimos verificar tu sesión. Inténtalo de nuevo." },
      { status: 503 },
    );
  }
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const upstream = new URL(
    q ? "search" : "reverse",
    `${process.env.GEOCODING_URL || "https://nominatim.openstreetmap.org"}/`,
  );
  upstream.searchParams.set("format", "jsonv2");
  upstream.searchParams.set("addressdetails", "1");
  upstream.searchParams.set("accept-language", "es");
  if (q) {
    if (q.length < 3 || q.length > 250)
      return NextResponse.json(
        { message: "Escribe una calle y ciudad para buscar." },
        { status: 400 },
      );
    upstream.searchParams.set("q", q);
    upstream.searchParams.set("countrycodes", "mx");
    upstream.searchParams.set("limit", "1");
  } else {
    const lat = params.get("lat");
    const lon = params.get("lon");
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (
      !lat ||
      !lon ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return NextResponse.json({ message: "La ubicación recibida no es válida." }, { status: 400 });
    upstream.searchParams.set("lat", latitude.toFixed(6));
    upstream.searchParams.set("lon", longitude.toFixed(6));
    upstream.searchParams.set("zoom", "18");
  }
  const key = upstream.toString();
  const cached = cache.get(key);
  if (cached && cached.hasta > Date.now())
    return NextResponse.json(cached.resultado, { headers: { "Cache-Control": "no-store" } });
  // Public provider permits at most one request/second per application instance.
  if (Date.now() - ultimaConsulta < 1100)
    return NextResponse.json({ message: "Espera un momento y vuelve a buscar." }, { status: 429 });
  ultimaConsulta = Date.now();
  try {
    const res = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GaeslandStorefront/1.0 (+https://github.com/Gaes-Solutions/verticals)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error("Provider unavailable");
    const data = await res.json();
    const resultado: ResultadoMapa | undefined = q ? data[0] : data;
    if (
      !resultado?.address ||
      !Number.isFinite(Number(resultado.lat)) ||
      !Number.isFinite(Number(resultado.lon))
    )
      return NextResponse.json(
        { message: "El mapa no encontró una dirección aquí. Completa los datos manualmente." },
        { status: 404 },
      );
    const oldest = cache.keys().next().value;
    if (cache.size >= 100 && oldest) cache.delete(oldest);
    cache.set(key, { hasta: Date.now() + TTL, resultado });
    return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      {
        message:
          "El mapa no pudo consultar la dirección. Vuelve a intentarlo o completa los datos manualmente.",
      },
      { status: 502 },
    );
  }
}
