import type { FastifyRequest } from "fastify";
import { getConfigVendedores } from "../comisiones/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];
type Db = TenantClient;
type VisitaRow = NonNullable<Awaited<ReturnType<TenantClient["visita"]["findUnique"]>>>;
type VisitaFotoRow = NonNullable<Awaited<ReturnType<TenantClient["visitaFoto"]["findUnique"]>>>;

export class VisitaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "VisitaError";
  }
}

async function visitaPropia(db: Db, id: string, vendedorId: string) {
  const visita = await db.visita.findUnique({ where: { id } });
  if (!visita) throw new VisitaError(404, "Visita no encontrada");
  if (visita.vendedorId !== vendedorId) {
    throw new VisitaError(403, "La visita pertenece a otro vendedor");
  }
  return visita;
}

export async function checkinVisita(
  db: Db,
  input: { id: string; vendedorId: string; lat?: number; lng?: number },
): Promise<VisitaRow> {
  const visita = await visitaPropia(db, input.id, input.vendedorId);
  if (visita.estado !== "planeada") {
    throw new VisitaError(409, `Solo visitas planeadas admiten checkin (actual: ${visita.estado})`);
  }
  const config = await getConfigVendedores(db);
  if (config.geocheckinActivo && (input.lat === undefined || input.lng === undefined)) {
    throw new VisitaError(422, "El negocio requiere geo-checkin: falta ubicación");
  }
  return db.visita.update({
    where: { id: input.id },
    data: {
      checkinAt: new Date(),
      ...(input.lat !== undefined ? { checkinLat: input.lat } : {}),
      ...(input.lng !== undefined ? { checkinLng: input.lng } : {}),
    },
  });
}

export async function cerrarVisita(
  db: Db,
  input: {
    id: string;
    vendedorId: string;
    resultado?: string;
    notas?: string;
    duracionLlamadaSeg?: number;
  },
): Promise<VisitaRow> {
  const visita = await visitaPropia(db, input.id, input.vendedorId);
  if (visita.estado !== "planeada") {
    throw new VisitaError(409, `La visita ya está ${visita.estado}`);
  }
  return db.visita.update({
    where: { id: input.id },
    data: {
      estado: "hecha",
      ...(visita.checkinAt ? {} : { checkinAt: new Date() }),
      ...(input.resultado !== undefined ? { resultado: input.resultado } : {}),
      ...(input.notas !== undefined ? { notas: input.notas } : {}),
      ...(input.duracionLlamadaSeg !== undefined
        ? { duracionLlamadaSeg: input.duracionLlamadaSeg }
        : {}),
    },
  });
}

export async function cancelarVisita(
  db: Db,
  input: { id: string; vendedorId: string; motivoNoVisita: string },
): Promise<VisitaRow> {
  const visita = await visitaPropia(db, input.id, input.vendedorId);
  if (visita.estado !== "planeada") {
    throw new VisitaError(409, `La visita ya está ${visita.estado}`);
  }
  return db.visita.update({
    where: { id: input.id },
    data: { estado: "cancelada", motivoNoVisita: input.motivoNoVisita },
  });
}

export async function agregarFoto(
  db: Db,
  input: { id: string; vendedorId: string; dataUrl: string; etiqueta?: string },
): Promise<VisitaFotoRow> {
  await visitaPropia(db, input.id, input.vendedorId);
  return db.visitaFoto.create({
    data: {
      visitaId: input.id,
      dataUrl: input.dataUrl,
      ...(input.etiqueta ? { etiqueta: input.etiqueta } : {}),
    },
  });
}

export interface CierreDia {
  fecha: string;
  vendedorId: string;
  visitasPlaneadas: number;
  visitasHechas: number;
  visitasCanceladas: Array<{ clienteB2b: string; motivo: string | null }>;
  pedidosLevantados: number;
  montoPedidos: string;
  cotizacionesCreadas: number;
}

export async function cierreDia(db: Db, vendedorId: string, fecha: Date): Promise<CierreDia> {
  const inicio = new Date(fecha);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  const rango = { gte: inicio, lt: fin };

  const [visitas, pedidos, cotizaciones] = await Promise.all([
    db.visita.findMany({
      where: { vendedorId, fechaPlaneada: rango },
      include: { clienteB2b: { select: { razonSocial: true } } },
    }),
    db.pedido.findMany({
      where: { vendedorId, createdAt: rango, estado: { not: "cancelado" } },
      select: { total: true },
    }),
    db.cotizacion.count({ where: { vendedorId, createdAt: rango } }),
  ]);

  const montoPedidos = pedidos.reduce((acc, p) => acc + Number(p.total), 0);
  return {
    fecha: inicio.toISOString().slice(0, 10),
    vendedorId,
    visitasPlaneadas: visitas.length,
    visitasHechas: visitas.filter((v) => v.estado === "hecha").length,
    visitasCanceladas: visitas
      .filter((v) => v.estado === "cancelada")
      .map((v) => ({ clienteB2b: v.clienteB2b.razonSocial, motivo: v.motivoNoVisita })),
    pedidosLevantados: pedidos.length,
    montoPedidos: montoPedidos.toFixed(2),
    cotizacionesCreadas: cotizaciones,
  };
}
