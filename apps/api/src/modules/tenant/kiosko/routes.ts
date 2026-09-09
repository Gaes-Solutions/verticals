import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type KioskoAuth,
  consultarPrecio,
  contenidoIdle,
  getKioskoConfig,
  resolverKiosko,
} from "./service.js";

/** Extrae y valida el token del header `Authorization: Bearer <tenant.secreto>`. */
async function requireKiosko(req: FastifyRequest, reply: FastifyReply): Promise<KioskoAuth | null> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    reply
      .code(401)
      .send({ statusCode: 401, error: "Unauthorized", message: "Falta token de kiosko" });
    return null;
  }
  const auth = await resolverKiosko(token);
  if (!auth) {
    reply
      .code(401)
      .send({ statusCode: 401, error: "Unauthorized", message: "Token de kiosko inválido" });
    return null;
  }
  return auth;
}

// Límites por ruta. Sin ellos solo aplica el global, que alcanza para volcar el
// catálogo completo con precios y promociones desde un token robado. Se expresan
// como fracción del global para que el entorno mande: en producción el global es
// 100/min y esto deja 30/10/20, y una batería de pruebas que lo sube no se topa.
// Un cliente escaneando hace ~4 consultas por minuto: 30 da margen a varios
// kioskos tras la misma IP y aun así corta la enumeración masiva.
const fraccion = (global: number, pct: number) =>
  ({ max: Math.max(1, Math.round((global * pct) / 100)), timeWindow: "1 minute" }) as const;

/** Rutas del DISPOSITIVO kiosko (auth por token de dispositivo). Prefijo /kiosko. */
export const kioskoDeviceRoutes: FastifyPluginAsync<{ rateLimitMax: number }> = async (
  app,
  opts,
) => {
  const LIMITE_PRECIO = fraccion(opts.rateLimitMax, 30);
  const LIMITE_CONFIG = fraccion(opts.rateLimitMax, 10);
  const LIMITE_IDLE = fraccion(opts.rateLimitMax, 20);
  // Config que el dispositivo lee al arrancar (tiempos, colores, idioma…).
  // Un kiosko real la consulta al arrancar y al reconectar, no en bucle.
  app.get("/config", { config: { rateLimit: LIMITE_CONFIG } }, async (req, reply) => {
    const auth = await requireKiosko(req, reply);
    if (!auth) return;
    const cfg = await getKioskoConfig(auth.tenantPrisma);
    return {
      reposoSegundos: cfg.reposoSegundos,
      precioSegundos: cfg.precioSegundos,
      contenidoReposo: cfg.contenidoReposo,
      slideSegundos: cfg.slideSegundos,
      mostrarExistencia: cfg.mostrarExistencia,
      sonidoBeep: cfg.sonidoBeep,
      mensajeBienvenida: cfg.mensajeBienvenida,
      colorAcento: cfg.colorAcento,
      idioma: cfg.idioma,
    };
  });

  // Verificación de precio por código (barcode/sku).
  app.get("/precio/:codigo", { config: { rateLimit: LIMITE_PRECIO } }, async (req, reply) => {
    const auth = await requireKiosko(req, reply);
    if (!auth) return;
    const { codigo } = z.object({ codigo: z.string().min(1).max(80) }).parse(req.params);
    const cfg = await getKioskoConfig(auth.tenantPrisma);
    const r = await consultarPrecio(auth, codigo, cfg.mostrarExistencia);
    if (!r.encontrado) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Sin coincidencia" });
    }
    return r;
  });

  // Contenido del modo reposo (carrusel de anuncios).
  app.get("/idle", { config: { rateLimit: LIMITE_IDLE } }, async (req, reply) => {
    const auth = await requireKiosko(req, reply);
    if (!auth) return;
    const cfg = await getKioskoConfig(auth.tenantPrisma);
    return { slides: await contenidoIdle(auth.tenantPrisma, cfg.contenidoReposo, auth.sucursalId) };
  });
};
