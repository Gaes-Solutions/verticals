import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  type RecetaListQuery,
  recetaCancelarSchema,
  recetaCreateSchema,
  recetaIdParamSchema,
  recetaListQuerySchema,
  recetaTokenParamSchema,
} from "./schemas.js";
import { RecetaError, generateRecetaToken, nextRecetaFolio } from "./service.js";

function buildWhere(q: RecetaListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.pacienteId) where.pacienteId = q.pacienteId;
  if (q.mascotaId) where.mascotaId = q.mascotaId;
  if (q.medicoUsuarioId) where.medicoUsuarioId = q.medicoUsuarioId;
  if (q.estado) where.estado = q.estado;
  if (q.esGrupoControlado !== undefined) where.esGrupoControlado = q.esGrupoControlado;
  if (q.desde || q.hasta) {
    where.fechaEmision = {
      ...(q.desde ? { gte: new Date(q.desde) } : {}),
      ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
    };
  }
  return where;
}

function handleErr<T>(
  reply: { code: (n: number) => { send: (b: unknown) => T } },
  err: unknown,
): T | null {
  if (err instanceof RecetaError) {
    return reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: err.statusCode >= 500 ? "Internal" : "Bad Request",
      message: err.message,
      ...(err.extra ?? {}),
    });
  }
  return null;
}

const recetasRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.RECETAS_LEER);
    const q = recetaListQuerySchema.parse(req.query);
    const where = buildWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.receta.count({ where }),
      req.tenantPrisma.receta.findMany({
        where,
        include: {
          paciente: {
            select: { id: true, nombre: true, apellidoPaterno: true, numeroExpediente: true },
          },
          mascota: { select: { id: true, nombre: true, especie: true, numeroExpediente: true } },
          medico: { select: { id: true, nombre: true } },
          _count: { select: { items: true } },
        },
        orderBy: { fechaEmision: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.RECETAS_LEER);
    const { id } = recetaIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.receta.findUnique({
      where: { id },
      include: {
        paciente: true,
        mascota: true,
        medico: { select: { id: true, nombre: true } },
        consulta: { select: { id: true, fechaConsulta: true, estado: true } },
        items: {
          orderBy: { numero: "asc" },
          include: {
            medicamento: { select: { id: true, nombreComercial: true, principioActivo: true } },
          },
        },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Receta no encontrada" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.RECETAS_EMITIR);
    const body = recetaCreateSchema.parse(req.body);

    const sucursal = await req.tenantPrisma.sucursal.findUnique({
      where: { id: body.sucursalId },
    });
    if (!sucursal) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Sucursal no encontrada" });
    }

    let esGrupoControlado = body.esGrupoControlado;
    let requiereRecetario = false;
    if (body.items.some((i) => i.medicamentoCatalogoId)) {
      const meds = await req.tenantPrisma.medicamentoCatalogo.findMany({
        where: {
          id: { in: body.items.map((i) => i.medicamentoCatalogoId).filter(Boolean) as string[] },
        },
      });
      for (const m of meds) {
        if (m.requiereRecetarioOficial) requiereRecetario = true;
        if (m.clasificacionCofepris === "G_II" || m.clasificacionCofepris === "G_III") {
          esGrupoControlado = true;
          requiereRecetario = true;
        }
      }
    }
    if (requiereRecetario && !body.numeroRecetarioOficial) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message:
          "Receta incluye medicamentos controlados (G_II/III) — debe capturar numeroRecetarioOficial COFEPRIS",
      });
    }

    try {
      const fechaExpiracion = new Date();
      fechaExpiracion.setDate(fechaExpiracion.getDate() + body.vigenciaDias);
      const result = await req.tenantPrisma.$transaction(async (tx) => {
        const folio = await nextRecetaFolio(tx, sucursal.id, sucursal.codigo);
        const receta = await tx.receta.create({
          data: {
            folio,
            sucursalId: body.sucursalId,
            ...(body.consultaId ? { consultaId: body.consultaId } : {}),
            ...(body.pacienteId ? { pacienteId: body.pacienteId } : {}),
            ...(body.mascotaId ? { mascotaId: body.mascotaId } : {}),
            medicoUsuarioId: body.medicoUsuarioId,
            vigenciaDias: body.vigenciaDias,
            fechaExpiracion,
            qrValidacionToken: generateRecetaToken(),
            esGrupoControlado,
            ...(body.numeroRecetarioOficial
              ? { numeroRecetarioOficial: body.numeroRecetarioOficial }
              : {}),
            ...(body.instruccionesGeneralesTutor
              ? { instruccionesGeneralesTutor: body.instruccionesGeneralesTutor }
              : {}),
          },
        });
        for (let i = 0; i < body.items.length; i += 1) {
          const it = body.items[i]!;
          await tx.recetaItem.create({
            data: {
              recetaId: receta.id,
              numero: i + 1,
              ...(it.medicamentoCatalogoId
                ? { medicamentoCatalogoId: it.medicamentoCatalogoId }
                : {}),
              nombreSnapshot: it.nombreSnapshot,
              ...(it.concentracionSnapshot
                ? { concentracionSnapshot: it.concentracionSnapshot }
                : {}),
              ...(it.presentacionSnapshot ? { presentacionSnapshot: it.presentacionSnapshot } : {}),
              dosisUnidad: it.dosisUnidad,
              dosisCantidad: it.dosisCantidad,
              dosisVia: it.dosisVia,
              frecuenciaHoras: it.frecuenciaHoras,
              duracionDias: it.duracionDias,
              ...(it.totalUnidadesDispensar
                ? { totalUnidadesDispensar: it.totalUnidadesDispensar }
                : {}),
              ...(it.instruccionesAdministracion
                ? { instruccionesAdministracion: it.instruccionesAdministracion }
                : {}),
              alertasAplicadas: (it.alertasAplicadas ?? []) as object,
            },
          });
        }
        return receta;
      });
      return reply.code(201).send(result);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.post("/:id/cancelar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.RECETAS_CANCELAR);
    const { id } = recetaIdParamSchema.parse(req.params);
    const body = recetaCancelarSchema.parse(req.body);
    try {
      const r = await req.tenantPrisma.receta.findUnique({ where: { id } });
      if (!r) throw new RecetaError(404, "Receta no encontrada");
      if (r.estado === "cancelada" || r.estado === "surtida" || r.estado === "expirada") {
        throw new RecetaError(409, `Receta en estado "${r.estado}" no se puede cancelar`);
      }
      const upd = await req.tenantPrisma.receta.update({
        where: { id },
        data: {
          estado: "cancelada",
          canceladaAt: new Date(),
          canceladaPorId: req.principal.userId,
          canceladaMotivo: body.motivo,
        },
      });
      return reply.code(200).send(upd);
    } catch (err) {
      const handled = handleErr(reply, err);
      if (handled !== null) return handled;
      throw err;
    }
  });

  app.get("/validar/:token", async (req, reply) => {
    // Endpoint público (no requiere auth) para que farmacia escanee QR y valide.
    const { token } = recetaTokenParamSchema.parse(req.params);
    const receta = await req.tenantPrisma.receta.findUnique({
      where: { qrValidacionToken: token },
      include: {
        paciente: { select: { nombre: true, apellidoPaterno: true } },
        mascota: { select: { nombre: true, especie: true } },
        medico: { select: { nombre: true } },
        items: { orderBy: { numero: "asc" } },
      },
    });
    if (!receta) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Receta no encontrada o token inválido",
      });
    }
    const vigente = receta.estado === "emitida" && receta.fechaExpiracion > new Date();
    const paciente = receta.paciente
      ? `${receta.paciente.nombre} ${receta.paciente.apellidoPaterno ?? ""}`.trim()
      : null;
    const mascota = receta.mascota ? `${receta.mascota.nombre} (${receta.mascota.especie})` : null;
    return {
      folio: receta.folio,
      paciente,
      mascota,
      medico: receta.medico.nombre,
      fechaEmision: receta.fechaEmision,
      fechaExpiracion: receta.fechaExpiracion,
      estado: receta.estado,
      vigente,
      esGrupoControlado: receta.esGrupoControlado,
      items: receta.items.map((it) => ({
        numero: it.numero,
        medicamento: it.nombreSnapshot,
        concentracion: it.concentracionSnapshot,
        dosis: `${it.dosisCantidad} ${it.dosisUnidad}`,
        via: it.dosisVia,
        frecuencia: `cada ${it.frecuenciaHoras} hrs`,
        duracion: `${it.duracionDias} días`,
        totalDispensar: it.totalUnidadesDispensar,
        instrucciones: it.instruccionesAdministracion,
      })),
    };
  });

  app.get("/medicamentos/catalogo", async (req) => {
    req.requirePerm(PERMISSIONS.RECETAS_EMITIR);
    return req.tenantPrisma.medicamentoCatalogo.findMany({
      where: { isActive: true },
      orderBy: { nombreComercial: "asc" },
    });
  });
};

export default recetasRoutes;
