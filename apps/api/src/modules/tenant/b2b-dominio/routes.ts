import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { type DnsRecord, provisionarDominio, railwayCfg } from "./railway.js";

/** Destino CNAME al que el mayorista apunta su dominio propio del portal B2B. */
function cnameTarget(): string {
  return process.env.B2B_CNAME_TARGET?.trim() || "b2b.angaes.com";
}

const setSchema = z.object({
  host: z
    .string()
    .trim()
    .toLowerCase()
    .min(4)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Dominio inválido"),
});
const hostParam = z.object({ host: z.string().min(1) });

/**
 * White-label del portal B2B: el mayorista conecta su propio dominio
 * (ej. pedidos.su-mayorista.com) para que sus clientes entren a su marca. Se
 * apoya en el registro global host→tenant (master `tienda_dominios`) con
 * `tipo = "portal_b2b"`. El apuntado por CNAME ya prueba control del dominio,
 * así que se marca verificado al conectar.
 */
const b2bDominioRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const dominios = await app.masterPrisma.tiendaDominio.findMany({
      where: { tenantSlug: req.tenantSlug, tipo: "portal_b2b" },
      select: { host: true, verificado: true },
      orderBy: { createdAt: "asc" },
    });
    return { dominios, cname: cnameTarget(), automatico: railwayCfg() !== null };
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const { host } = setSchema.parse(req.body);

    const existente = await app.masterPrisma.tiendaDominio.findUnique({
      where: { host },
      select: { tenantSlug: true },
    });
    if (existente && existente.tenantSlug !== req.tenantSlug) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "Ese dominio ya está en uso" });
    }

    await app.masterPrisma.tiendaDominio.upsert({
      where: { host },
      create: { host, tenantSlug: req.tenantSlug, tipo: "portal_b2b", verificado: true },
      update: { tenantSlug: req.tenantSlug, tipo: "portal_b2b", verificado: true },
    });

    // Self-serve: si Railway está configurado, damos de alta el custom domain y
    // devolvemos los registros DNS reales (Railway emite el TLS solo). Si no, o
    // si Railway lo rechaza, caemos al CNAME genérico.
    let records: DnsRecord[] = [{ tipo: "CNAME", nombre: host, valor: cnameTarget() }];
    let automatico = false;
    let aviso: string | null = null;
    const cfg = railwayCfg();
    if (cfg) {
      try {
        const railwayRecords = await provisionarDominio(cfg, host);
        if (railwayRecords.length > 0) {
          records = railwayRecords;
          automatico = true;
        }
      } catch (err) {
        app.log.warn({ err, host }, "no se pudo provisionar el dominio B2B en Railway");
        aviso =
          "El dominio quedó registrado, pero no se pudo conectar automáticamente. " +
          "Usa el CNAME de abajo o reintenta.";
      }
    }

    return reply.code(201).send({ host, verificado: true, automatico, aviso, dns: { records } });
  });

  app.delete("/:host", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const { host } = hostParam.parse(req.params);
    await app.masterPrisma.tiendaDominio.deleteMany({
      where: { host: host.toLowerCase(), tenantSlug: req.tenantSlug, tipo: "portal_b2b" },
    });
    return { ok: true };
  });
};

export default b2bDominioRoutes;
