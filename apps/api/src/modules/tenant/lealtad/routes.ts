import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";
import { LealtadError, acumularPuntos, canjearPuntos, inscribirCliente } from "./service.js";

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof LealtadError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error:
        err.statusCode === 404 ? "Not Found" : err.statusCode === 409 ? "Conflict" : "Bad Request",
      message: err.message,
    });
    return true;
  }
  return false;
}

const programaSchema = z.object({
  nombre: z.string().min(1).max(120),
  tipo: z
    .enum(["puntos_por_peso", "puntos_por_visita", "tiers_volumen", "mixto"])
    .default("puntos_por_peso"),
  reglaAcumulacion: z
    .object({ puntosPorPeso: z.number().positive() })
    .default({ puntosPorPeso: 1 }),
  valorPuntoRedimible: z
    .union([z.number().positive(), z.string().regex(/^\d*\.?\d+$/)])
    .transform((v) => String(v))
    .default("0.1"),
  caducidadPuntosMeses: z.number().int().min(1).max(120).default(12),
  requiereConsentimiento: z.boolean().default(true),
});

const lealtadRoutes: FastifyPluginAsync = async (app) => {
  app.put("/programa", async (req, reply) => {
    req.requirePerm(PERMISSIONS.LEALTAD_GESTIONAR);
    const body = programaSchema.parse(req.body);
    const existing = await req.tenantPrisma.loyaltyProgram.findFirst();
    const data = {
      nombre: body.nombre,
      tipo: body.tipo,
      reglaAcumulacion: body.reglaAcumulacion as object,
      valorPuntoRedimible: body.valorPuntoRedimible,
      caducidadPuntosMeses: body.caducidadPuntosMeses,
      requiereConsentimiento: body.requiereConsentimiento,
      isActive: true,
    };
    const programa = existing
      ? await req.tenantPrisma.loyaltyProgram.update({ where: { id: existing.id }, data })
      : await req.tenantPrisma.loyaltyProgram.create({ data });
    return reply.code(existing ? 200 : 201).send(programa);
  });

  app.post("/inscribir", async (req, reply) => {
    req.requirePerm(PERMISSIONS.LEALTAD_GESTIONAR);
    const body = z
      .object({ clienteId: z.string().min(1), consentimiento: z.boolean().default(false) })
      .parse(req.body);
    try {
      const r = await inscribirCliente(req.tenantPrisma, body.clienteId, body.consentimiento);
      return reply.code(201).send(r);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/acumular", async (req, reply) => {
    req.requirePerm(PERMISSIONS.LEALTAD_GESTIONAR);
    const body = z
      .object({
        clienteId: z.string().min(1),
        monto: z.string().regex(/^\d+(\.\d+)?$/),
        ventaId: z.string().optional(),
      })
      .parse(req.body);
    try {
      const r = await acumularPuntos(req.tenantPrisma, body.clienteId, body.monto, body.ventaId);
      return reply.code(200).send(r);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/canjear", async (req, reply) => {
    req.requirePerm(PERMISSIONS.LEALTAD_GESTIONAR);
    const body = z
      .object({ clienteId: z.string().min(1), puntos: z.number().int().positive() })
      .parse(req.body);
    try {
      const r = await canjearPuntos(req.tenantPrisma, body.clienteId, body.puntos);
      return reply.code(200).send(r);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/cliente/:clienteId", async (req) => {
    req.requirePerm(PERMISSIONS.LEALTAD_GESTIONAR);
    const { clienteId } = z.object({ clienteId: z.string().min(1) }).parse(req.params);
    const inscrito = await req.tenantPrisma.clienteLoyalty.findFirst({ where: { clienteId } });
    const movimientos = await req.tenantPrisma.loyaltyMovimiento.findMany({
      where: { clienteId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { inscrito, movimientos };
  });
};

export default lealtadRoutes;
