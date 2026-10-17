import { ApiError, api } from "@/lib/api";
import { esPedidoSeguimiento } from "@/lib/seguimiento-contract";
import { type NextRequest, NextResponse } from "next/server";
const headers = { "Cache-Control": "private, no-store" };
function consultaValida(folio: string, email: string) {
  const control = Array.from(folio).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
  return (
    !!folio &&
    folio !== "." &&
    folio !== ".." &&
    !control &&
    folio.length <= 120 &&
    !!email &&
    email.length <= 320
  );
}
export async function GET(req: NextRequest) {
  const folio = req.nextUrl.searchParams.get("folio")?.trim() ?? "";
  const email = req.nextUrl.searchParams.get("email")?.trim() ?? "";
  if (!consultaValida(folio, email))
    return NextResponse.json({ message: "Falta folio o email" }, { status: 400, headers });
  try {
    const data = await api(
      `/pedidos-ecommerce/seguimiento/${encodeURIComponent(folio)}?email=${encodeURIComponent(email)}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!esPedidoSeguimiento(data, folio))
      return NextResponse.json(
        { message: "No se pudo verificar el pedido." },
        { status: 502, headers },
      );
    return NextResponse.json(data, { headers });
  } catch (error) {
    const status =
      error instanceof ApiError && [400, 404, 429].includes(error.statusCode)
        ? error.statusCode
        : 503;
    return NextResponse.json(
      {
        message:
          status === 404
            ? "Pedido no encontrado"
            : "No se pudo consultar tu pedido. Reintenta en unos momentos.",
      },
      { status, headers },
    );
  }
}
