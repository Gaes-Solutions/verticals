import { randomBytes } from "node:crypto";
import type { TenantPrismaClient } from "@gaespos/db";
import type { PaymentProvider } from "@gaespos/pagos";
import type { CrearCobroInput, PagarCobroInput } from "./schemas.js";

export class CobroError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "CobroError";
  }
}

export interface CobroDto {
  id: string;
  token: string;
  concepto: string;
  monto: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  status: string;
  vigenciaHasta: string | null;
  pagadoAt: string | null;
  createdAt: string;
}

interface CobroRow {
  id: string;
  token: string;
  concepto: string;
  monto: { toString(): string };
  clienteNombre: string | null;
  clienteTelefono: string | null;
  status: string;
  vigenciaHasta: Date | null;
  pagadoAt: Date | null;
  createdAt: Date;
}

function toDto(r: CobroRow): CobroDto {
  return {
    id: r.id,
    token: r.token,
    concepto: r.concepto,
    monto: Number(r.monto).toFixed(2),
    clienteNombre: r.clienteNombre,
    clienteTelefono: r.clienteTelefono,
    status: r.status,
    vigenciaHasta: r.vigenciaHasta ? r.vigenciaHasta.toISOString() : null,
    pagadoAt: r.pagadoAt ? r.pagadoAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

function generarToken(): string {
  return randomBytes(9).toString("base64url");
}

export async function crearCobro(
  client: TenantPrismaClient,
  usuarioId: string,
  input: CrearCobroInput,
): Promise<CobroDto> {
  const vigenciaHasta = input.vigenciaDias
    ? new Date(Date.now() + input.vigenciaDias * 24 * 60 * 60 * 1000)
    : null;
  const link = await client.linkPago.create({
    data: {
      token: generarToken(),
      concepto: input.concepto,
      monto: input.monto.toFixed(2),
      clienteNombre: input.clienteNombre ?? null,
      clienteTelefono: input.clienteTelefono ?? null,
      vigenciaHasta,
      creadoPorId: usuarioId,
    },
  });
  return toDto(link);
}

export async function listarCobros(
  client: TenantPrismaClient,
): Promise<{ items: CobroDto[]; totalCobrado: number; pendiente: number }> {
  const rows = await client.linkPago.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const items = rows.map(toDto);
  const totalCobrado = rows
    .filter((i) => i.status === "pagado")
    .reduce((s, i) => s + Number(i.monto), 0);
  const pendiente = rows
    .filter((i) => i.status === "pendiente")
    .reduce((s, i) => s + Number(i.monto), 0);
  return { items, totalCobrado, pendiente };
}

/** Estado público del cobro (lo que ve el cliente al abrir el link). */
export async function cobroPorToken(
  client: TenantPrismaClient,
  token: string,
): Promise<{
  token: string;
  concepto: string;
  monto: string;
  status: string;
  clienteNombre: string | null;
}> {
  const link = await client.linkPago.findUnique({ where: { token } });
  if (!link) throw new CobroError(404, "Link de cobro no encontrado");
  const expirado =
    link.status === "pendiente" && link.vigenciaHasta && link.vigenciaHasta < new Date();
  return {
    token: link.token,
    concepto: link.concepto,
    monto: Number(link.monto).toFixed(2),
    status: expirado ? "expirado" : link.status,
    clienteNombre: link.clienteNombre,
  };
}

export async function cancelarCobro(client: TenantPrismaClient, id: string): Promise<CobroDto> {
  const link = await client.linkPago.findUnique({ where: { id } });
  if (!link) throw new CobroError(404, "Cobro no encontrado");
  if (link.status === "pagado") throw new CobroError(409, "El cobro ya fue pagado");
  const upd = await client.linkPago.update({ where: { id }, data: { status: "cancelado" } });
  return toDto(upd);
}

export async function pagarCobro(
  client: TenantPrismaClient,
  provider: PaymentProvider,
  token: string,
  input: PagarCobroInput,
): Promise<{ status: string; intentId: string; referenciaPago?: string | null }> {
  const link = await client.linkPago.findUnique({ where: { token } });
  if (!link) throw new CobroError(404, "Link de cobro no encontrado");
  if (link.status !== "pendiente") throw new CobroError(409, `El cobro está ${link.status}`);
  if (link.vigenciaHasta && link.vigenciaHasta < new Date()) {
    await client.linkPago.update({ where: { id: link.id }, data: { status: "expirado" } });
    throw new CobroError(409, "El link de cobro expiró");
  }

  const intent = await provider.crearIntent({
    pedidoId: link.id,
    montoCentavos: Math.round(Number(link.monto) * 100),
    moneda: "MXN",
    metodo: input.metodo,
    emailComprador: input.emailComprador ?? "cobro@gaespos.local",
    descripcion: link.concepto,
    ...(input.cardTokenId ? { cardTokenId: input.cardTokenId } : {}),
  });

  // Tarjeta: cobro inmediato (Conekta real confirma; mock acepta) → pagado.
  // OXXO/SPEI: queda pendiente con referencia para pagar en tienda/banco.
  const pagado =
    intent.status === "confirmado" || (intent.status === "pendiente" && input.metodo === "tarjeta");

  if (pagado) {
    await client.linkPago.update({
      where: { id: link.id },
      data: {
        status: "pagado",
        metodoPago: input.metodo,
        proveedorRef: intent.intentId,
        pagadoAt: new Date(),
      },
    });
    return { status: "pagado", intentId: intent.intentId };
  }
  return {
    status: intent.status,
    intentId: intent.intentId,
    referenciaPago: intent.referenciaPago ?? null,
  };
}
