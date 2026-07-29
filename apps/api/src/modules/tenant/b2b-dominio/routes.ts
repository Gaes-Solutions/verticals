import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { tokenVerificacion, verificarTxt } from "../ecommerce-config/dominio-service.js";
import { type DnsRecord, provisionarDominio, railwayCfg } from "./railway.js";

const VERIFY_PREFIX = "_gaessoft-verify";

/** Destino CNAME al que el mayorista apunta su dominio propio del portal B2B. */
function cnameTarget(): string {
  return process.env.B2B_CNAME_TARGET?.trim() || "b2b.angaes.com";
}

/**
 * Hosts propiedad de la plataforma (target CNAME, apex de marca) que ningún
 * tenant puede reclamar como dominio propio: reclamarlos secuestraría el portal
 * compartido. Se cubre el host y cualquier subdominio suyo.
 */
function hostsReservados(): string[] {
  const extra = (process.env.PLATFORM_RESERVED_HOSTS ?? "angaes.com,gaessoft.mx,gaessoft.shop")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [cnameTarget().toLowerCase(), ...extra];
}

function esHostReservado(host: string): boolean {
  return hostsReservados().some((base) => host === base || host.endsWith(`.${base}`));
}

function txtRecord(host: string, token: string): DnsRecord {
  return { tipo: "TXT", nombre: `${VERIFY_PREFIX}.${host}`, valor: `gaessoft-verify=${token}` };
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
 * `tipo = "portal_b2b"`. La propiedad del dominio se prueba con un TXT de
 * verificación; solo un dominio verificado enruta a su tenant.
 */
const b2bDominioRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const rows = await app.masterPrisma.tiendaDominio.findMany({
      where: { tenantSlug: req.tenantSlug, tipo: "portal_b2b" },
      select: { host: true, verificado: true, tokenVerificacion: true },
      orderBy: { createdAt: "asc" },
    });
    const dominios = rows.map((d) => ({
      host: d.host,
      verificado: d.verificado,
      ...(!d.verificado && d.tokenVerificacion
        ? { txt: txtRecord(d.host, d.tokenVerificacion) }
        : {}),
    }));
    return { dominios, cname: cnameTarget(), automatico: railwayCfg() !== null };
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const { host } = setSchema.parse(req.body);

    if (esHostReservado(host)) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "Ese dominio está reservado por la plataforma",
      });
    }

    const existente = await app.masterPrisma.tiendaDominio.findUnique({
      where: { host },
      select: { tenantSlug: true, verificado: true, tokenVerificacion: true },
    });
    // Solo un registro YA verificado de otro tenant bloquea el host. Un registro
    // sin verificar no prueba propiedad de nadie, así que puede reclamarse (evita
    // squatting/DoS de un tenant que registra un host que no controla).
    if (existente && existente.tenantSlug !== req.tenantSlug && existente.verificado) {
      return reply
        .code(409)
        .send({ statusCode: 409, error: "Conflict", message: "Ese dominio ya está en uso" });
    }

    const propio = existente?.tenantSlug === req.tenantSlug;
    // Idempotente: reconectar el propio dominio ya verificado no lo reinicia.
    if (propio && existente?.verificado) {
      return reply.code(200).send({
        host,
        verificado: true,
        automatico: railwayCfg() !== null,
        aviso: null,
        dns: { records: [{ tipo: "CNAME", nombre: host, valor: cnameTarget() }] },
      });
    }

    const token =
      propio && existente?.tokenVerificacion ? existente.tokenVerificacion : tokenVerificacion();

    await app.masterPrisma.tiendaDominio.upsert({
      where: { host },
      create: {
        host,
        tenantSlug: req.tenantSlug,
        tipo: "portal_b2b",
        verificado: false,
        tokenVerificacion: token,
      },
      update: {
        tenantSlug: req.tenantSlug,
        tipo: "portal_b2b",
        verificado: false,
        tokenVerificacion: token,
      },
    });

    const records: DnsRecord[] = [
      { tipo: "CNAME", nombre: host, valor: cnameTarget() },
      txtRecord(host, token),
    ];
    return reply.code(201).send({ host, verificado: false, dns: { records } });
  });

  // Prueba la propiedad del dominio leyendo el TXT esperado vía DNS. Solo al
  // verificar se marca `verificado` y se provisiona el custom domain en Railway.
  app.post("/:host/verificar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const { host } = hostParam.parse(req.params);
    const normal = host.toLowerCase();

    const registro = await app.masterPrisma.tiendaDominio.findUnique({
      where: { host: normal },
      select: { tenantSlug: true, verificado: true, tokenVerificacion: true },
    });
    if (!registro || registro.tenantSlug !== req.tenantSlug || !registro.tokenVerificacion) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Dominio no registrado" });
    }

    const ok = await verificarTxt(normal, registro.tokenVerificacion);
    if (!ok) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          "No se encontró el registro TXT de verificación. Revisa tu DNS e intenta de nuevo.",
      });
    }

    if (!registro.verificado) {
      await app.masterPrisma.tiendaDominio.update({
        where: { host: normal },
        data: { verificado: true },
      });
    }

    // Self-serve: recién probada la propiedad, si Railway está configurado damos
    // de alta el custom domain y devolvemos los registros DNS reales (Railway
    // emite el TLS solo). Si no, o si Railway lo rechaza, caemos al CNAME.
    let records: DnsRecord[] = [{ tipo: "CNAME", nombre: normal, valor: cnameTarget() }];
    let automatico = false;
    let aviso: string | null = null;
    const cfg = railwayCfg();
    if (cfg) {
      try {
        const railwayRecords = await provisionarDominio(cfg, normal);
        if (railwayRecords.length > 0) {
          records = railwayRecords;
          automatico = true;
        }
      } catch (err) {
        app.log.warn({ err, host: normal }, "no se pudo provisionar el dominio B2B en Railway");
        aviso =
          "El dominio quedó verificado, pero no se pudo conectar automáticamente. " +
          "Usa el CNAME de abajo o reintenta.";
      }
    }

    return reply
      .code(200)
      .send({ host: normal, verificado: true, automatico, aviso, dns: { records } });
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
