import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getConfigVendedores, periodoDe, resumenComisiones } from "../comisiones/service.js";
import { lineaCreditoDisponible } from "../cxc/service.js";

const idParamSchema = z.object({ id: z.string().cuid() });

function hoy(): { inicio: Date; fin: Date } {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 1);
  return { inicio, fin };
}

/**
 * Backend del home de la PWA de campo: meta+comisión del periodo, ruta de
 * visitas de hoy y pendientes accionables del vendedor autenticado.
 */
const vendedorRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard", async (req) => {
    req.requirePerm(PERMISSIONS.COMISIONES_LEER_PROPIAS);
    const vendedorId = req.principal.userId;
    const { inicio, fin } = hoy();
    const [resumen, config, visitasHoy, cotizacionesVigentes, pedidosPorConfirmar, cxcPorCobrar] =
      await Promise.all([
        resumenComisiones(req.tenantPrisma, vendedorId, periodoDe(new Date())),
        getConfigVendedores(req.tenantPrisma),
        req.tenantPrisma.visita.findMany({
          where: { vendedorId, fechaPlaneada: { gte: inicio, lt: fin } },
          include: {
            clienteB2b: {
              select: {
                id: true,
                razonSocial: true,
                nombreComercial: true,
                telefonoPrincipal: true,
              },
            },
          },
          orderBy: { fechaPlaneada: "asc" },
        }),
        req.tenantPrisma.cotizacion.count({
          where: { vendedorId, estado: { in: ["borrador", "enviada"] } },
        }),
        req.tenantPrisma.pedido.count({
          where: { vendedorId, estado: { in: ["creado", "preparando"] } },
        }),
        req.tenantPrisma.cuentaCobrar.aggregate({
          where: { vendedorId, estado: { in: ["activa", "vencida"] } },
          _count: true,
          _sum: { montoOriginal: true, montoPagado: true },
        }),
      ]);

    const saldoCxc =
      Number(cxcPorCobrar._sum.montoOriginal ?? 0) - Number(cxcPorCobrar._sum.montoPagado ?? 0);
    return {
      resumen,
      config,
      visitasHoy,
      pendientes: {
        cotizacionesVigentes,
        pedidosPorConfirmar,
        cxcPorCobrar: { cuentas: cxcPorCobrar._count, saldo: saldoCxc.toFixed(2) },
      },
    };
  });

  app.get("/clientes", async (req) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const asignaciones = await req.tenantPrisma.clienteB2bVendedorAsignado.findMany({
      where: {
        usuarioId: req.principal.userId,
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: new Date() } }],
      },
      include: {
        clienteB2b: {
          select: {
            id: true,
            razonSocial: true,
            nombreComercial: true,
            rfc: true,
            telefonoPrincipal: true,
            emailPrincipal: true,
            diasCreditoDefault: true,
            isActive: true,
          },
        },
      },
    });
    const clientes = asignaciones.filter((a) => a.clienteB2b.isActive).map((a) => a.clienteB2b);

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const enriquecidos = await Promise.all(
      clientes.map(async (c) => {
        const [ultimaVisita, ventasMes, ultimoPedido] = await Promise.all([
          req.tenantPrisma.visita.findFirst({
            where: { clienteB2bId: c.id, estado: "hecha" },
            orderBy: { checkinAt: "desc" },
            select: { checkinAt: true },
          }),
          req.tenantPrisma.pedido.aggregate({
            where: {
              clienteB2bId: c.id,
              createdAt: { gte: inicioMes },
              estado: { not: "cancelado" },
            },
            _sum: { total: true },
            _count: true,
          }),
          req.tenantPrisma.pedido.findFirst({
            where: { clienteB2bId: c.id, estado: { not: "cancelado" } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true, total: true },
          }),
        ]);
        return {
          ...c,
          ultimaVisitaAt: ultimaVisita?.checkinAt ?? null,
          pedidosMes: ventasMes._count,
          montoMes: Number(ventasMes._sum.total ?? 0).toFixed(2),
          ultimoPedidoAt: ultimoPedido?.createdAt ?? null,
        };
      }),
    );
    return { items: enriquecidos };
  });

  app.get("/clientes/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const { id } = idParamSchema.parse(req.params);
    const cliente = await req.tenantPrisma.clienteB2b.findUnique({
      where: { id },
      include: {
        direcciones: true,
        vendedoresAsignados: {
          where: { usuarioId: req.principal.userId },
          select: { tipo: true },
        },
      },
    });
    if (!cliente) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente no encontrado" });
    }
    const [credito, visitas, pedidos, cotizaciones] = await Promise.all([
      lineaCreditoDisponible(req.tenantPrisma, id).catch(() => null),
      req.tenantPrisma.visita.findMany({
        where: { clienteB2bId: id },
        orderBy: { fechaPlaneada: "desc" },
        take: 10,
        select: {
          id: true,
          tipo: true,
          estado: true,
          fechaPlaneada: true,
          checkinAt: true,
          notas: true,
          resultado: true,
        },
      }),
      req.tenantPrisma.pedido.findMany({
        where: { clienteB2bId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, folio: true, estado: true, total: true, createdAt: true },
      }),
      req.tenantPrisma.cotizacion.findMany({
        where: { clienteB2bId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, folio: true, estado: true, total: true, fechaVencimiento: true },
      }),
    ]);
    return { cliente, credito, visitas, pedidos, cotizaciones };
  });
};

export default vendedorRoutes;
