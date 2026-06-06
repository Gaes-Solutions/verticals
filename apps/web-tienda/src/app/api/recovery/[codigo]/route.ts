import { api } from "@/lib/api";
import { NextResponse } from "next/server";

/** GET /api/recovery/:codigo → items del carrito abandonado para restaurar. */
export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  try {
    const carrito = await api<{
      items: Array<{
        varianteId: string;
        nombre: string;
        precioUnitario: string;
        cantidad: string;
      }>;
    }>(`/tienda/recovery/${codigo}`);
    return NextResponse.json(carrito);
  } catch {
    return NextResponse.json({ message: "Carrito no disponible" }, { status: 404 });
  }
}
