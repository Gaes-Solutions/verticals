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

/** Rutas del DISPOSITIVO kiosko (auth por token de dispositivo). Prefijo /kiosko. */
export const kioskoDeviceRoutes: FastifyPluginAsync = async (app) => {
  // Config que el dispositivo lee al arrancar (tiempos, colores, idioma…).
  app.get("/config", async (req, reply) => {
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
  app.get("/precio/:codigo", async (req, reply) => {
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
  app.get("/idle", async (req, reply) => {
    const auth = await requireKiosko(req, reply);
    if (!auth) return;
    const cfg = await getKioskoConfig(auth.tenantPrisma);
    return { slides: await contenidoIdle(auth.tenantPrisma, cfg.contenidoReposo) };
  });
};
