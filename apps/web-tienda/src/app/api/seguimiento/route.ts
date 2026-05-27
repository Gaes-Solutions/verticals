import { api } from "@/lib/api";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const folio = req.nextUrl.searchParams.get("folio");
  const email = req.nextUrl.searchParams.get("email");
  if (!folio || !email) {
    return NextResponse.json({ message: "Falta folio o email" }, { status: 400 });
  }
  try {
    const data = await api(
      `/pedidos-ecommerce/seguimiento/${folio}?email=${encodeURIComponent(email)}`,
    );
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ message: "Pedido no encontrado" }, { status: 404 });
  }
}
