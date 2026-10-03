import { ApiError, api } from "@/lib/api";
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
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404)
      return NextResponse.json(
        { message: "El enlace del carrito expiró o no existe." },
        { status: 404 },
      );
    return NextResponse.json(
      { message: "No se pudo recuperar el carrito; inténtalo de nuevo." },
      { status: 503 },
    );
  }
}
