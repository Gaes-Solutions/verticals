import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

export class LealtadError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "LealtadError";
  }
}

async function programaActivo(client: TenantClient) {
  const programa = await client.loyaltyProgram.findFirst({ where: { isActive: true } });
  if (!programa) throw new LealtadError(409, "No hay programa de lealtad activo");
  return programa;
}

export async function inscribirCliente(
  client: TenantClient,
  clienteId: string,
  consentimiento: boolean,
): Promise<{ id: string }> {
  const programa = await programaActivo(client);
  if (programa.requiereConsentimiento && !consentimiento) {
    throw new LealtadError(400, "El programa requiere consentimiento del cliente (LFPDPPP)");
  }
  const existing = await client.clienteLoyalty.findUnique({
    where: { loyaltyProgramId_clienteId: { loyaltyProgramId: programa.id, clienteId } },
  });
  if (existing) return { id: existing.id };
  const inscrito = await client.clienteLoyalty.create({
    data: {
      loyaltyProgramId: programa.id,
      clienteId,
      ...(consentimiento ? { consentimientoAt: new Date() } : {}),
    },
  });
  return { id: inscrito.id };
}

/** Calcula puntos según regla del programa (puntos × peso) y los acumula FIFO. */
export async function acumularPuntos(
  client: TenantClient,
  clienteId: string,
  montoVenta: string,
  origenVentaId?: string,
): Promise<{ puntosGanados: number; saldo: number }> {
  const programa = await programaActivo(client);
  const inscrito = await client.clienteLoyalty.findUnique({
    where: { loyaltyProgramId_clienteId: { loyaltyProgramId: programa.id, clienteId } },
  });
  if (!inscrito) throw new LealtadError(404, "Cliente no inscrito en el programa");

  const regla = programa.reglaAcumulacion as { puntosPorPeso?: number };
  const puntosPorPeso = regla.puntosPorPeso ?? 1;
  const puntos = new Decimal(montoVenta).mul(puntosPorPeso).floor().toNumber();
  if (puntos <= 0) return { puntosGanados: 0, saldo: inscrito.puntosActuales };

  const nuevoSaldo = inscrito.puntosActuales + puntos;
  const caducaAt = new Date();
  caducaAt.setMonth(caducaAt.getMonth() + programa.caducidadPuntosMeses);

  await client.$transaction([
    client.loyaltyMovimiento.create({
      data: {
        loyaltyProgramId: programa.id,
        clienteId,
        tipo: "acumulacion",
        puntos,
        saldoResultante: nuevoSaldo,
        ...(origenVentaId ? { origenVentaId } : {}),
        caducaAt,
      },
    }),
    client.clienteLoyalty.update({
      where: { id: inscrito.id },
      data: {
        puntosActuales: nuevoSaldo,
        lifetimeAcumulado: inscrito.lifetimeAcumulado + puntos,
      },
    }),
  ]);
  return { puntosGanados: puntos, saldo: nuevoSaldo };
}

export async function canjearPuntos(
  client: TenantClient,
  clienteId: string,
  puntos: number,
): Promise<{ saldo: number; valorMxn: string }> {
  const programa = await programaActivo(client);
  const inscrito = await client.clienteLoyalty.findUnique({
    where: { loyaltyProgramId_clienteId: { loyaltyProgramId: programa.id, clienteId } },
  });
  if (!inscrito) throw new LealtadError(404, "Cliente no inscrito");
  if (puntos <= 0) throw new LealtadError(400, "Puntos a canjear debe ser > 0");
  if (inscrito.puntosActuales < puntos) {
    throw new LealtadError(409, "Saldo de puntos insuficiente");
  }
  const nuevoSaldo = inscrito.puntosActuales - puntos;
  const valorMxn = new Decimal(puntos).mul(programa.valorPuntoRedimible.toString()).toFixed(2);
  await client.$transaction([
    client.loyaltyMovimiento.create({
      data: {
        loyaltyProgramId: programa.id,
        clienteId,
        tipo: "canje",
        puntos: -puntos,
        saldoResultante: nuevoSaldo,
        notas: `Canje por $${valorMxn} MXN`,
      },
    }),
    client.clienteLoyalty.update({
      where: { id: inscrito.id },
      data: { puntosActuales: nuevoSaldo, lifetimeCanjeado: inscrito.lifetimeCanjeado + puntos },
    }),
  ]);
  return { saldo: nuevoSaldo, valorMxn };
}
