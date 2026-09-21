import { type CatalogoResponse, api } from "@/lib/api";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/catalogo → catálogo público para componentes cliente (mismo BFF). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const qs = new URLSearchParams();
  for (const k of [
    "q",
    "cat",
    "categoriaPublicaId",
    "orden",
    "soloOfertas",
    "soloDisponibles",
    "page",
    "pageSize",
  ]) {
    const v = sp.get(k);
    if (v) qs.set(k, v);
  }
  try {
    const data = await api<CatalogoResponse>(`/tienda/catalogo?${qs.toString()}`, {
      revalidate: 120,
    });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { message: "No se pudo consultar el catálogo. Reintenta en unos momentos." },
      { status: 503 },
    );
  }
}
