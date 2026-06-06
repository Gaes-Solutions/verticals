import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import {
  cotizarQuerySchema,
  idParamSchema,
  pickupConfigSchema,
  tarifaEnvioSchema,
  zonaEnvioSchema,
} from "./schemas.js";
import { EnviosError, cotizarEnvio } from "./service.js";

const sucursalParamSchema = z.object({ sucursalId: z.string().min(1) });

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof EnviosError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Unprocessable Entity",
      message: err.message,
    });
    return true;
  }
  return false;
}

function tarifaData(body: z.infer<typeof tarifaEnvioSchema>) {
  return {
    paqueteria: body.paqueteria,
    nombrePublico: body.nombrePublico,
    tipoCalculo: body.tipoCalculo,
    montoFijo: body.montoFijo ?? null,
    ...(body.escalones ? { escalonPeso: body.escalones as object } : {}),
    montoMinimoEnvioGratis: body.montoMinimoEnvioGratis ?? null,
    diasEntregaEstimados: body.diasEntregaEstimados ?? null,
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
  };
}

/** Zonas/tarifas de envío + pickup por sucursal + cotizador público. */
const enviosRoutes: FastifyPluginAsync = async (app) => {
  // --- Cotizador (lo usa la tienda con token de servicio, sin permiso especial) ---
  app.get("/cotizar", async (req, reply) => {
    const q = cotizarQuerySchema.parse(req.query);
    try {
      return await cotizarEnvio(req.tenantPrisma, q);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  // --- Zonas ---
  app.get("/zonas", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    return req.tenantPrisma.zonaEnvio.findMany({
      include: { tarifas: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post("/zonas", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    const body = zonaEnvioSchema.parse(req.body);
    const zona = await req.tenantPrisma.zonaEnvio.create({
      data: {
        nombre: body.nombre,
        cpsIncluidos: body.cpsIncluidos ?? [],
        estadosIncluidos: body.estadosIncluidos ?? [],
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    return reply.code(201).send(zona);
  });

  app.put("/zonas/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = zonaEnvioSchema.parse(req.body);
    const existe = await req.tenantPrisma.zonaEnvio.findUnique({ where: { id } });
    if (!existe) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Zona no encontrada" });
    }
    return req.tenantPrisma.zonaEnvio.update({
      where: { id },
      data: {
        nombre: body.nombre,
        ...(body.cpsIncluidos ? { cpsIncluidos: body.cpsIncluidos } : {}),
        ...(body.estadosIncluidos ? { estadosIncluidos: body.estadosIncluidos } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
  });

  app.delete("/zonas/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    await req.tenantPrisma.zonaEnvio.delete({ where: { id } }).catch(() => null);
    return reply.code(204).send();
  });

  // --- Tarifas ---
  app.post("/tarifas", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    const body = tarifaEnvioSchema.parse(req.body);
    const zona = await req.tenantPrisma.zonaEnvio.findUnique({ where: { id: body.zonaEnvioId } });
    if (!zona) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Zona no encontrada" });
    }
    const tarifa = await req.tenantPrisma.tarifaEnvio.create({
      data: { zonaEnvioId: body.zonaEnvioId, ...tarifaData(body) },
    });
    return reply.code(201).send(tarifa);
  });

  app.put("/tarifas/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    const body = tarifaEnvioSchema.parse(req.body);
    const existe = await req.tenantPrisma.tarifaEnvio.findUnique({ where: { id } });
    if (!existe) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Tarifa no encontrada" });
    }
    return req.tenantPrisma.tarifaEnvio.update({ where: { id }, data: tarifaData(body) });
  });

  app.delete("/tarifas/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    const { id } = idParamSchema.parse(req.params);
    await req.tenantPrisma.tarifaEnvio.delete({ where: { id } }).catch(() => null);
    return reply.code(204).send();
  });

  // --- Pickup por sucursal ---
  app.get("/pickup", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    const sucursales = await req.tenantPrisma.sucursal.findMany({
      where: { isActive: true },
      select: { id: true, nombre: true, direccion: true },
      orderBy: { nombre: "asc" },
    });
    const configs = await req.tenantPrisma.configPickupSucursal.findMany();
    const porSucursal = new Map(configs.map((c) => [c.sucursalId, c]));
    return sucursales.map((s) => ({ sucursal: s, config: porSucursal.get(s.id) ?? null }));
  });

  app.put("/pickup/:sucursalId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_ENVIOS_GESTIONAR);
    const { sucursalId } = sucursalParamSchema.parse(req.params);
    const body = pickupConfigSchema.parse(req.body);
    const sucursal = await req.tenantPrisma.sucursal.findUnique({ where: { id: sucursalId } });
    if (!sucursal) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Sucursal no encontrada" });
    }
    const data = {
      ...(body.activa !== undefined ? { activa: body.activa } : {}),
      ...(body.horarioPickup ? { horarioPickup: body.horarioPickup } : {}),
      ...(body.tiempoPreparacionPromedioMin !== undefined
        ? { tiempoPreparacionPromedioMin: body.tiempoPreparacionPromedioMin }
        : {}),
      ...(body.requiereIdRecoger !== undefined
        ? { requiereIdRecoger: body.requiereIdRecoger }
        : {}),
      ...(body.notificacionListoCanal
        ? { notificacionListoCanal: body.notificacionListoCanal }
        : {}),
    };
    return req.tenantPrisma.configPickupSucursal.upsert({
      where: { sucursalId },
      create: { sucursalId, ...data },
      update: data,
    });
  });
};

export default enviosRoutes;
