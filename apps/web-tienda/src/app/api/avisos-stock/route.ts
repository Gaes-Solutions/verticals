import { api } from "@/lib/api";
import { NextResponse } from "next/server";

/** POST /api/avisos-stock → registra un aviso de reabastecimiento (storefront). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const r = await api("/tienda/avisos-stock", { body });
    return NextResponse.json(r, { status: 201 });
  } catch {
    return NextResponse.json({ message: "No se pudo registrar el aviso" }, { status: 400 });
  }
}
