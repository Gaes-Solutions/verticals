import { getTenantClient } from "@gaespos/db";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { cfdiEmitirSchema } from "../tenant/cfdis/schemas.js";
import { CfdiError, emitirCfdi } from "../tenant/cfdis/service.js";

const params = z.object({
  tenantSlug: z.string().min(2).max(50),
  ventaId: z.string().min(1),
});

/**
 * Segundo factor obligatorio para autofacturar: folio impreso + total del ticket.
 * Ninguno de los dos va codificado en el QR (que solo lleva el id), así que
 * conocer el id no basta: hay que tener el ticket físico. Cierra el IDOR y el
 * oráculo de montos por id.
 */
const segundoFactorSchema = z.object({
  folio: z.string().trim().min(1).max(40),
  total: z.coerce.number().finite().nonnegative(),
});

interface VentaAutofactura {
  id: string;
  folio: string;
  estado: string;
  total: unknown;
  cobradaAt: Date | null;
  createdAt: Date;
  usuarioId: string;
  cfdis: { estado: string }[];
}

function coincideSegundoFactor(venta: VentaAutofactura, folio: string, total: number): boolean {
  const folioOk = venta.folio.trim().toLowerCase() === folio.toLowerCase();
  const totalOk = Number(venta.total).toFixed(2) === total.toFixed(2);
  return folioOk && totalOk;
}

/**
 * Resuelve el estado de autofacturación de una venta (sin auth: el ticket físico
 * —id del QR + folio + total— es la credencial). Devuelve si es facturable + el
 * motivo si no lo es.
 */
async function cargarContexto(tenantSlug: string, ventaId: string) {
  const client = getTenantClient(tenantSlug);
  const cfg = await client.cfdiConfig.findFirst();
  const venta = (await client.venta.findUnique({
    where: { id: ventaId },
    select: {
      id: true,
      folio: true,
      estado: true,
      total: true,
      cobradaAt: true,
      createdAt: true,
      usuarioId: true,
      cfdis: { select: { estado: true } },
    },
  })) as VentaAutofactura | null;
  return { client, cfg, venta };
}

function evaluar(
  venta: VentaAutofactura | null,
  cfg: { autofacturaActiva: boolean; diasAutofactura: number; isActive: boolean } | null,
): { facturable: boolean; motivo: string | null; yaFacturada: boolean; expiraAt: string | null } {
  if (!venta)
    return { facturable: false, motivo: "Venta no encontrada", yaFacturada: false, expiraAt: null };
  if (!cfg || !cfg.isActive || !cfg.autofacturaActiva) {
    return {
      facturable: false,
      motivo: "El negocio no tiene autofacturación activa",
      yaFacturada: false,
      expiraAt: null,
    };
  }
  const yaFacturada = venta.cfdis.some((c) => c.estado === "vigente" || c.estado === "pendiente");
  const baseAt = venta.cobradaAt ?? venta.createdAt;
  const expira = new Date(baseAt.getTime() + cfg.diasAutofactura * 86400000);
  const expiraAt = expira.toISOString();
  if (venta.estado !== "cobrada")
    return { facturable: false, motivo: "La venta no está cobrada", yaFacturada, expiraAt };
  if (yaFacturada)
    return { facturable: false, motivo: "Esta venta ya tiene factura", yaFacturada, expiraAt };
  if (Date.now() > expira.getTime())
    return { facturable: false, motivo: "El plazo para facturar ya venció", yaFacturada, expiraAt };
  return { facturable: true, motivo: null, yaFacturada, expiraAt };
}

function fail(reply: FastifyReply, code: number, message: string) {
  return reply.code(code).send({ statusCode: code, error: "Error", message });
}

/**
 * Autofactura pública (sin auth tenant): el cliente walk-in escanea el QR del
 * ticket y emite su CFDI con sus datos fiscales. Reusa emitirCfdi(esAutofactura).
 */
export const autofacturaPublicRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/autofactura/:tenantSlug/venta/:ventaId",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = params.parse(req.params);
      const sf = segundoFactorSchema.safeParse(req.query);
      const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: p.tenantSlug } });
      if (!tenant || tenant.status === "cancelled")
        return fail(reply, 404, "Negocio no encontrado");
      const { cfg, venta } = await cargarContexto(p.tenantSlug, p.ventaId);
      const negocio = cfg?.razonSocialEmisor ?? tenant.name;
      if (!sf.success || !venta || !coincideSegundoFactor(venta, sf.data.folio, sf.data.total)) {
        return {
          negocio,
          ventaId: p.ventaId,
          total: null,
          fecha: null,
          facturable: false,
          motivo: "Verifica el folio y el total de tu ticket",
          yaFacturada: false,
          expiraAt: null,
        };
      }
      const ev = evaluar(venta, cfg);
      return {
        negocio,
        ventaId: p.ventaId,
        total: Number(venta.total),
        fecha: (venta.cobradaAt ?? venta.createdAt).toISOString(),
        ...ev,
      };
    },
  );

  app.post(
    "/autofactura/:tenantSlug/venta/:ventaId",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = params.parse(req.params);
      const body = cfdiEmitirSchema.parse(req.body);
      const sf = segundoFactorSchema.parse(req.body);
      const tenant = await app.masterPrisma.tenant.findUnique({ where: { slug: p.tenantSlug } });
      if (!tenant || tenant.status === "cancelled")
        return fail(reply, 404, "Negocio no encontrado");

      const { client, cfg, venta } = await cargarContexto(p.tenantSlug, p.ventaId);
      if (!venta || !cfg || !coincideSegundoFactor(venta, sf.folio, sf.total))
        return fail(reply, 404, "No pudimos validar tu ticket. Revisa el folio y el total.");
      const ev = evaluar(venta, cfg);
      if (!ev.facturable) return fail(reply, 409, ev.motivo ?? "No facturable");

      const provider = app.fiscalProviderFactory({
        apiKey: cfg.facturamaApiKey,
        ambiente: cfg.facturamaAmbiente,
      });
      try {
        const result = await emitirCfdi(client, provider, {
          ...body,
          ventaId: venta.id,
          emitidoPorId: venta.usuarioId,
          esAutofactura: true,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof CfdiError) return fail(reply, err.statusCode, err.message);
        throw err;
      }
    },
  );
};

export default autofacturaPublicRoutes;
