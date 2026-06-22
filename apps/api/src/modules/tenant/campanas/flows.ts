import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];

const DIA_MS = 86_400_000;

export const EVENTOS_FLOW = [
  { evento: "cliente_nuevo", label: "Bienvenida (cliente nuevo)", usaDias: false },
  { evento: "cumpleanos", label: "Cumpleaños", usaDias: false },
  { evento: "win_back", label: "Recuperación (no te hemos visto)", usaDias: true },
  { evento: "recompra", label: "Recordatorio de recompra", usaDias: true },
] as const;

const EVENTOS_VALIDOS = new Set<string>(EVENTOS_FLOW.map((e) => e.evento));

export interface FlowDto {
  id: string;
  evento: string;
  campanaId: string;
  campanaNombre: string;
  canal: string;
  dias: number | null;
  frecuenciaMax: number;
  isActive: boolean;
}

interface TriggerRow {
  id: string;
  evento: string;
  campanaId: string;
  ventanaEnvio: unknown;
  frecuenciaMaxPorCliente30d: number;
  isActive: boolean;
  campana: { nombre: string; canal: string };
}

function diasDe(ventana: unknown): number | null {
  if (ventana && typeof ventana === "object" && "dias" in ventana) {
    const d = (ventana as { dias?: unknown }).dias;
    if (typeof d === "number") return d;
  }
  return null;
}

function flowDto(t: TriggerRow): FlowDto {
  return {
    id: t.id,
    evento: t.evento,
    campanaId: t.campanaId,
    campanaNombre: t.campana.nombre,
    canal: t.campana.canal,
    dias: diasDe(t.ventanaEnvio),
    frecuenciaMax: t.frecuenciaMaxPorCliente30d,
    isActive: t.isActive,
  };
}

export async function listarFlows(client: TenantClient): Promise<FlowDto[]> {
  const rows = await client.campanaTrigger.findMany({
    include: { campana: { select: { nombre: true, canal: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(flowDto);
}

export async function crearFlow(
  client: TenantClient,
  input: { evento: string; campanaId: string; dias?: number; frecuenciaMax?: number },
): Promise<FlowDto> {
  if (!EVENTOS_VALIDOS.has(input.evento)) throw new Error("Evento inválido");
  const campana = await client.campana.findUnique({ where: { id: input.campanaId } });
  if (!campana) throw new Error("Campaña no encontrada");
  const created = await client.campanaTrigger.create({
    data: {
      evento: input.evento,
      campanaId: input.campanaId,
      frecuenciaMaxPorCliente30d: input.frecuenciaMax ?? 1,
      ...(input.dias !== undefined ? { ventanaEnvio: { dias: input.dias } } : {}),
    },
    include: { campana: { select: { nombre: true, canal: true } } },
  });
  return flowDto(created);
}

export async function toggleFlow(
  client: TenantClient,
  id: string,
  isActive: boolean,
): Promise<void> {
  await client.campanaTrigger.update({ where: { id }, data: { isActive } });
}

export async function eliminarFlow(client: TenantClient, id: string): Promise<void> {
  await client.campanaTrigger.delete({ where: { id } });
}

/** Clientes objetivo de un trigger según su evento (pull-based). */
async function clientesObjetivo(
  client: TenantClient,
  evento: string,
  dias: number | null,
): Promise<string[]> {
  const ahora = Date.now();
  if (evento === "cliente_nuevo") {
    const desde = new Date(ahora - (dias ?? 1) * DIA_MS);
    const cs = await client.cliente.findMany({
      where: { isActive: true, createdAt: { gte: desde } },
      select: { id: true },
      take: 1000,
    });
    return cs.map((c) => c.id);
  }
  if (evento === "cumpleanos") {
    const hoy = new Date();
    const cs = await client.cliente.findMany({
      where: { isActive: true, fechaNacimiento: { not: null } },
      select: { id: true, fechaNacimiento: true },
      take: 5000,
    });
    return cs
      .filter(
        (c) =>
          c.fechaNacimiento &&
          c.fechaNacimiento.getUTCMonth() === hoy.getUTCMonth() &&
          c.fechaNacimiento.getUTCDate() === hoy.getUTCDate(),
      )
      .map((c) => c.id);
  }
  // win_back / recompra: basados en la última compra
  const d = dias ?? 30;
  const ventas = await client.venta.groupBy({
    by: ["clienteId"],
    where: { clienteId: { not: null } },
    _max: { createdAt: true },
  });
  const corte = ahora - d * DIA_MS;
  const ids: string[] = [];
  for (const v of ventas) {
    if (!v.clienteId || !v._max.createdAt) continue;
    const ultima = v._max.createdAt.getTime();
    if (evento === "win_back" && ultima <= corte) ids.push(v.clienteId);
    // recompra: la última compra fue hace ~d días (ventana de 1 día)
    if (evento === "recompra" && ultima <= corte && ultima > corte - DIA_MS) ids.push(v.clienteId);
  }
  return ids;
}

/**
 * Ejecuta los flows programados: por cada trigger activo busca los clientes que
 * cumplen la condición y encola un envío (respeta opt-out, tope de frecuencia y
 * que tengan destino). Pensado para correr por cron o "ejecutar ahora".
 */
export async function runFlowsProgramados(
  client: TenantClient,
): Promise<{ flows: number; encolados: number }> {
  const triggers = await client.campanaTrigger.findMany({
    where: { isActive: true },
    include: { campana: { select: { nombre: true, canal: true } } },
  });
  const hace30d = new Date(Date.now() - 30 * DIA_MS);
  let encolados = 0;

  for (const t of triggers) {
    const ids = await clientesObjetivo(client, t.evento, diasDe(t.ventanaEnvio));
    if (ids.length === 0) continue;
    const canal = t.campana.canal === "multi" ? "whatsapp" : t.campana.canal;

    const clientes = await client.cliente.findMany({
      where: { id: { in: ids } },
      select: { id: true, emailPrincipal: true, telefonoPrincipal: true },
    });
    const optOuts = await client.clienteOptOut.findMany({
      where: { clienteId: { in: ids }, canal: canal as never },
      select: { clienteId: true },
    });
    const optOutSet = new Set(optOuts.map((o) => o.clienteId));

    for (const c of clientes) {
      if (optOutSet.has(c.id)) continue;
      const destino = canal === "email" ? c.emailPrincipal : c.telefonoPrincipal;
      if (!destino) continue;
      const recientes = await client.campanaEnvio.count({
        where: { campanaId: t.campanaId, clienteId: c.id, createdAt: { gte: hace30d } },
      });
      if (recientes >= t.frecuenciaMaxPorCliente30d) continue;
      await client.campanaEnvio.create({
        data: {
          campanaId: t.campanaId,
          clienteId: c.id,
          destino,
          canal: canal as never,
          status: "pendiente",
        },
      });
      encolados += 1;
    }
  }
  return { flows: triggers.length, encolados };
}
