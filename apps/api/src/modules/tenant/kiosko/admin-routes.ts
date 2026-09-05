import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { generarToken, getKioskoConfig } from "./service.js";

const configSchema = z.object({
  reposoSegundos: z.number().int().min(5).max(600).optional(),
  precioSegundos: z.number().int().min(2).max(60).optional(),
  contenidoReposo: z.enum(["promociones", "destacados", "ambos"]).optional(),
  slideSegundos: z.number().int().min(2).max(60).optional(),
  mostrarExistencia: z.boolean().optional(),
  sonidoBeep: z.boolean().optional(),
  mensajeBienvenida: z.string().max(120).optional(),
  colorAcento: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  idioma: z.enum(["es", "en"]).optional(),
});

/** Gestión de kioskos desde el panel del dueño. Bajo /t/kioskos. */
const kioskoAdminRoutes: FastifyPluginAsync = async (app) => {
  // Dispositivos
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_LEER);
    return req.tenantPrisma.kioskoDevice.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nombre: true,
        sucursalId: true,
        activo: true,
        ultimoVisto: true,
        createdAt: true,
      },
    });
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const body = z
      .object({ nombre: z.string().min(1).max(80), sucursalId: z.string().min(1) })
      .parse(req.body);
    const { token, hash } = generarToken(req.principal.tenantSlug);
    const device = await req.tenantPrisma.kioskoDevice.create({
      data: { nombre: body.nombre, sucursalId: body.sucursalId, tokenHash: hash },
      select: { id: true, nombre: true, sucursalId: true },
    });
    // El token en claro se muestra UNA sola vez (no se vuelve a poder ver).
    return reply.code(201).send({ device, token });
  });

  app.delete("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    await req.tenantPrisma.kioskoDevice.update({ where: { id }, data: { activo: false } });
    return reply.code(204).send();
  });

  // Config del tenant
  app.get("/config", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_LEER);
    return getKioskoConfig(req.tenantPrisma);
  });

  app.put("/config", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_ACTUALIZAR);
    const body = configSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) if (v !== undefined) data[k] = v;
    const actual = await getKioskoConfig(req.tenantPrisma);
    return req.tenantPrisma.kioskoConfig.update({ where: { id: actual.id }, data });
  });
};

export default kioskoAdminRoutes;
