import { api } from "@/lib/api";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/cupon?codigo=&subtotal= → valida un cupón para feedback en checkout. */
export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get("codigo") ?? "";
  const subtotal = req.nextUrl.searchParams.get("subtotal") ?? "0";
  if (!codigo) return NextResponse.json({ valido: false, mensaje: "Sin código" }, { status: 200 });
  try {
    const r = await api(
      `/tienda/cupon?codigo=${encodeURIComponent(codigo)}&subtotal=${encodeURIComponent(subtotal)}`,
    );
    return NextResponse.json(r);
  } catch {
    return NextResponse.json({ valido: false, mensaje: "No se pudo validar" }, { status: 200 });
  }
}
