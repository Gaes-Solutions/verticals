// El motor vive en @gaespos/pricing para que la caja sin internet calcule igual que el servidor.
import { type PromoContexto, type PromoEvaluable, promoAplicaContexto } from "@gaespos/pricing";
import type { FastifyRequest } from "fastify";

export type {
  PromoContexto,
  PromoEvaluable,
  PromocionAplicada,
  ResultadoPromos,
} from "@gaespos/pricing";
export { aplicarPromocionesATicket } from "@gaespos/pricing";

type TenantClient = FastifyRequest["tenantPrisma"];

export class PromocionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PromocionError";
  }
}

export async function cargarPromocionesAplicables(
  client: TenantClient,
  ctx: PromoContexto,
): Promise<PromoEvaluable[]> {
  const promos = await client.promocion.findMany({
    where: {
      status: "activa",
      vigenciaInicio: { lte: ctx.fecha },
      OR: [{ vigenciaFin: null }, { vigenciaFin: { gte: ctx.fecha } }],
    },
    include: { productos: { select: { productoId: true, rol: true } } },
    orderBy: { prioridad: "asc" },
  });

  // Redenciones por cliente (no revocadas) para promos con tope por cliente.
  const usosPorCliente = new Map<string, number>();
  if (ctx.clienteId) {
    const conTopeCliente = promos.filter((p) => p.limiteUsosCliente != null).map((p) => p.id);
    if (conTopeCliente.length > 0) {
      const grupos = await client.promocionAplicacion.groupBy({
        by: ["promocionId"],
        where: {
          promocionId: { in: conTopeCliente },
          clienteId: ctx.clienteId,
          revocadaAt: null,
        },
        _count: { _all: true },
      });
      for (const g of grupos) usosPorCliente.set(g.promocionId, g._count._all);
    }
  }

  return promos
    .filter((p) => {
      if (p.limiteUsosTotal != null && p.usosActuales >= p.limiteUsosTotal) return false;
      if (p.limiteUsosCliente != null) {
        // Un tope por cliente es inaplicable sin cliente identificado: no se
        // puede acotar el abuso en ventas anónimas, así que la promo no aplica.
        if (!ctx.clienteId) return false;
        if ((usosPorCliente.get(p.id) ?? 0) >= p.limiteUsosCliente) return false;
      }
      return true;
    })
    .map((p) => ({
      id: p.id,
      tipo: p.tipo,
      acciones: p.acciones as Record<string, unknown>,
      condiciones: p.condiciones as Record<string, unknown>,
      prioridad: p.prioridad,
      stackConOtras: p.stackConOtras,
      horarios: p.horarios as PromoEvaluable["horarios"],
      canales: p.canales as string[],
      sucursalesAplicables: p.sucursalesAplicables as string[],
      productosIncluidos: new Set(
        p.productos.filter((x) => x.rol === "incluido").map((x) => x.productoId),
      ),
      productosExcluidos: new Set(
        p.productos.filter((x) => x.rol === "excluido").map((x) => x.productoId),
      ),
      productosComprados: new Set(
        p.productos
          .filter((x) => x.rol === "comprado" || x.rol === "requerido")
          .map((x) => x.productoId),
      ),
      productosRegalo: new Set(
        p.productos.filter((x) => x.rol === "regalo").map((x) => x.productoId),
      ),
    }))
    .filter((p) => promoAplicaContexto(p, ctx));
}
