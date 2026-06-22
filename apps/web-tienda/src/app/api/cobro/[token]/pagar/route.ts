import { api } from "@/lib/api";
import { type NextRequest, NextResponse } from "next/server";

/** Procesa el pago del link de cobro (reenvía al backend con el token de servicio). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await api(`/cobros/publico/${encodeURIComponent(token)}/pagar`, {
      method: "POST",
      body: { metodo: "tarjeta", ...body },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al procesar el pago" },
      { status: 400 },
    );
  }
}
