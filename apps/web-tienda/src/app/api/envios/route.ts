import { api } from "@/lib/api";
import { type NextRequest, NextResponse } from "next/server";

export interface OpcionEnvio {
  tarifaId: string;
  nombrePublico: string;
  paqueteria: string;
  costo: string;
  gratis: boolean;
  diasEntregaEstimados: number | null;
}

export interface OpcionPickup {
  sucursalId: string;
  nombre: string;
  direccion: Record<string, unknown> | null;
  tiempoPreparacionPromedioMin: number;
}

/** GET /api/envios?cp=&estado=&subtotal= → cotiza opciones de envío + pickup. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const qs = new URLSearchParams({ subtotal: sp.get("subtotal") ?? "0" });
  const cp = sp.get("cp");
  const estado = sp.get("estado");
  if (cp) qs.set("cp", cp);
  if (estado) qs.set("estado", estado);
  try {
    const cot = await api<{ opcionesEnvio: OpcionEnvio[]; pickup: OpcionPickup[] }>(
      `/envios/cotizar?${qs.toString()}`,
    );
    return NextResponse.json(cot);
  } catch {
    return NextResponse.json({ opcionesEnvio: [], pickup: [] });
  }
}
