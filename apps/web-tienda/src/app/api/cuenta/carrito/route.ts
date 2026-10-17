import { esCarritoRemoto } from "@/lib/carrito-contract";
import { sameOriginRequest } from "@/lib/checkout-session";
import { ClienteSessionError, getClienteSession } from "@/lib/cliente";
import { type NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
async function respuestaServidor(
  res: Response,
  method: string,
  owner: string,
  allowClear: boolean,
) {
  if (method === "GET" && res.status === 404)
    return NextResponse.json({ owner, cart: null }, { headers: { "Cache-Control": "no-store" } });
  const data = res.status === 204 ? null : await res.json().catch(() => undefined);
  const cleared = res.status === 204 && allowClear;
  if (res.ok && !cleared && !esCarritoRemoto(data))
    return NextResponse.json(
      {
        message: "No pudimos confirmar tu carrito. Tu selección se conserva; vuelve a intentarlo.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  if (!res.ok && (!data || typeof data !== "object"))
    return NextResponse.json(
      { message: "No pudimos sincronizar tu carrito. Reintenta." },
      { status: res.status, headers: { "Cache-Control": "no-store" } },
    );
  return NextResponse.json(res.ok ? { owner, cart: data } : data, {
    status: res.status === 204 ? 200 : res.status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function forward(req: NextRequest) {
  if (req.method !== "GET" && !sameOriginRequest(req))
    return NextResponse.json({ message: "Solicitud no autorizada." }, { status: 403 });
  try {
    const session = await getClienteSession();
    if (!session) return NextResponse.json({ message: "Inicia sesión." }, { status: 401 });
    const owner = JSON.stringify([session.cliente.tenantSlug, session.cliente.id]);
    const input = req.method === "POST" ? await req.json() : null;
    if (req.method === "POST" && (!input || !("expectedVersion" in input)))
      return NextResponse.json(
        { message: "Actualiza tu carrito antes de continuar." },
        { status: 400 },
      );
    // The browser never chooses the account, tenant or upstream URL.
    if (input && input.owner !== owner)
      return NextResponse.json(
        { message: "La cuenta cambió. Actualiza tu carrito." },
        { status: 409 },
      );
    const res = await fetch(
      `${process.env.API_URL ?? "http://localhost:3000"}/cliente-portal/comercio/carrito`,
      {
        method: req.method,
        headers: {
          Authorization: `Bearer ${session.token}`,
          ...(input ? { "Content-Type": "application/json" } : {}),
        },
        ...(input
          ? {
              body: JSON.stringify({
                items: input.items,
                expectedVersion: input.expectedVersion,
                ...(input.cuponCodigo ? { cuponCodigo: input.cuponCodigo } : {}),
              }),
            }
          : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      },
    );
    return await respuestaServidor(
      res,
      req.method,
      owner,
      req.method === "POST" && Array.isArray(input?.items) && input.items.length === 0,
    );
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof ClienteSessionError
            ? error.message
            : "No pudimos sincronizar tu carrito. Reintenta.",
      },
      { status: error instanceof ClienteSessionError ? error.statusCode : 503 },
    );
  }
}
export const GET = forward;
export const POST = forward;
