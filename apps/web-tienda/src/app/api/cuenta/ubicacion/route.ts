import { getClienteToken } from "@/lib/cliente";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
/** Geocoding uses the same authenticated backend for web and Android. */
export async function GET(req: Request) {
  try {
    const token = await getClienteToken();
    if (!token)
      return NextResponse.json(
        { message: "Inicia sesión para buscar tu dirección." },
        { status: 401 },
      );
    const p = new URL(req.url).searchParams;
    const body = p.has("q")
      ? { q: p.get("q") }
      : {
          lat: p.get("lat") === null ? null : Number(p.get("lat")),
          lon: p.get("lon") === null ? null : Number(p.get("lon")),
        };
    const response = await fetch(
      `${process.env.API_URL ?? "http://localhost:3000"}/cliente-portal/ubicacion`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
    );
    return NextResponse.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { message: "No pudimos consultar el mapa. Puedes escribir los datos manualmente." },
      { status: 503 },
    );
  }
}
