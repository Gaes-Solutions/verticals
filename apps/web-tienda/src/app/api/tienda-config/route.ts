import { type TiendaConfig, getTiendaConfig } from "@/lib/api";
import { NextResponse } from "next/server";

/** GET /api/tienda-config → funciones del storefront para componentes cliente. */
export async function GET() {
  const config: TiendaConfig = await getTiendaConfig();
  return NextResponse.json(config);
}
