import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import {
  agregarCargoSchema,
  aplicarKardexSchema,
  capturarSignoVitalSchema,
  darAltaSchema,
  hospitalizacionIdParamSchema,
  hospitalizacionIngresarSchema,
  hospitalizacionListQuerySchema,
  kardexListQuerySchema,
  programarMedicacionSchema,
  suspenderMedicacionSchema,
} from "./schemas.js";
import {
  HospitalizacionError,
  agregarCargo,
  aplicarKardex,
  capturarSignoVital,
  darAlta,
  ingresarPaciente,
  programarMedicacion,
  suspenderMedicacion,
} from "./service.js";

function errorLabel(status: number): string {
  if (status >= 500) return "Internal";
  if (status === 404) return "Not Found";
  if (status === 409) return "Conflict";
  return "Bad Request";
}

function handleErr(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof HospitalizacionError) {
    reply.code(err.statusCode).send({
      statusCode: err.statusCode,
      error: errorLabel(err.statusCode),
      message: err.message,
      ...(err.extra ?? {}),
    });
    return true;
  }
  return false;
}

type IngresarBody = ReturnType<typeof hospitalizacionIngresarSchema.parse>;
function buildIngresarInput(body: IngresarBody): Parameters<typeof ingresarPaciente>[1] {
  return {
    sucursalId: body.sucursalId,
    camaId: body.camaId,
    ...(body.pacienteId ? { pacienteId: body.pacienteId } : {}),
    ...(body.mascotaId ? { mascotaId: body.mascotaId } : {}),
    medicoResponsableId: body.medicoResponsableId,
    ...(body.diagnosticoIngresoId ? { diagnosticoIngresoId: body.diagnosticoIngresoId } : {}),
    ...(body.diagnosticoIngresoTexto
      ? { diagnosticoIngresoTexto: body.diagnosticoIngresoTexto }
      : {}),
    motivoIngreso: body.motivoIngreso,
    ...(body.notasIngreso ? { notasIngreso: body.notasIngreso } : {}),
    ...(body.tarifaEstanciaDiaria ? { tarifaEstanciaDiaria: body.tarifaEstanciaDiaria } : {}),
  };
}

type SignoBody = ReturnType<typeof capturarSignoVitalSchema.parse>;
function buildSignoInput(
  body: SignoBody,
  hospitalizacionId: string,
  capturadoPorId: string,
): Parameters<typeof capturarSignoVital>[1] {
  return {
    hospitalizacionId,
    capturadoPorId,
    ...(body.temperaturaC !== undefined ? { temperaturaC: body.temperaturaC } : {}),
    ...(body.frecuenciaCardiaca !== undefined
      ? { frecuenciaCardiaca: body.frecuenciaCardiaca }
      : {}),
    ...(body.frecuenciaRespiratoria !== undefined
      ? { frecuenciaRespiratoria: body.frecuenciaRespiratoria }
      : {}),
    ...(body.saturacionO2 !== undefined ? { saturacionO2: body.saturacionO2 } : {}),
    ...(body.presionSistolica !== undefined ? { presionSistolica: body.presionSistolica } : {}),
    ...(body.presionDiastolica !== undefined ? { presionDiastolica: body.presionDiastolica } : {}),
    ...(body.glucosa !== undefined ? { glucosa: body.glucosa } : {}),
    ...(body.dolorEscala !== undefined ? { dolorEscala: body.dolorEscala } : {}),
    ...(body.tiempoLlenadoCapilarSeg !== undefined
      ? { tiempoLlenadoCapilarSeg: body.tiempoLlenadoCapilarSeg }
      : {}),
    ...(body.mucosasColor !== undefined ? { mucosasColor: body.mucosasColor } : {}),
    ...(body.observaciones !== undefined ? { observaciones: body.observaciones } : {}),
  };
}

const hospitalizacionesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.HOSPITALIZACION_LEER);
    const q = hospitalizacionListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.sucursalId) where.sucursalId = q.sucursalId;
    if (q.pacienteId) where.pacienteId = q.pacienteId;
    if (q.mascotaId) where.mascotaId = q.mascotaId;
    if (q.camaId) where.camaId = q.camaId;
    if (q.medicoResponsableId) where.medicoResponsableId = q.medicoResponsableId;
    if (q.estado) where.estado = q.estado;
    const [total, items] = await Promise.all([
      req.tenantPrisma.hospitalizacion.count({ where }),
      req.tenantPrisma.hospitalizacion.findMany({
        where,
        include: {
          cama: { select: { id: true, codigo: true, tipo: true } },
          paciente: {
            select: { id: true, nombre: true, apellidoPaterno: true, numeroExpediente: true },
          },
          mascota: { select: { id: true, nombre: true, especie: true, numeroExpediente: true } },
          medicoResponsable: { select: { id: true, nombre: true } },
          diagnosticoIngreso: { select: { codigoCie10: true, nombreEs: true } },
        },
        orderBy: { fechaIngreso: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.HOSPITALIZACION_LEER);
    const { id } = hospitalizacionIdParamSchema.parse(req.params);
    const hosp = await req.tenantPrisma.hospitalizacion.findUnique({
      where: { id },
      include: {
        cama: true,
        paciente: true,
        mascota: true,
        medicoResponsable: { select: { id: true, nombre: true } },
        diagnosticoIngreso: true,
        altaPor: { select: { id: true, nombre: true } },
        ventaAlAlta: { select: { id: true, folio: true, total: true, estado: true } },
        medicacionesProgramadas: {
          include: {
            medicamento: { select: { id: true, nombreComercial: true } },
            aplicaciones: { orderBy: { horaProgramada: "asc" } },
          },
        },
        cargos: { orderBy: { createdAt: "asc" } },
        signosVitales: { orderBy: { hora: "asc" } },
      },
    });
    if (!hosp) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Hospitalización no encontrada" });
    }
    return hosp;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.HOSPITALIZACION_CREAR);
    const body = hospitalizacionIngresarSchema.parse(req.body);
    try {
      const result = await ingresarPaciente(req.tenantPrisma, buildIngresarInput(body));
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/medicaciones", async (req, reply) => {
    req.requirePerm(PERMISSIONS.MEDICACION_PROGRAMAR);
    const { id } = hospitalizacionIdParamSchema.parse(req.params);
    const body = programarMedicacionSchema.parse(req.body);
    try {
      const result = await programarMedicacion(req.tenantPrisma, {
        hospitalizacionId: id,
        prescritaPorId: req.principal.userId,
        medicamentoCatalogoId: body.medicamentoCatalogoId,
        dosis: body.dosis,
        via: body.via,
        frecuenciaHoras: body.frecuenciaHoras,
        duracionDias: body.duracionDias,
        horaInicio: new Date(body.horaInicio),
        indicacionMedica: body.indicacionMedica,
        ...(body.recetaId ? { recetaId: body.recetaId } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/medicaciones/:id/suspender", async (req, reply) => {
    req.requirePerm(PERMISSIONS.MEDICACION_PROGRAMAR);
    const { id } = hospitalizacionIdParamSchema.parse(req.params);
    const body = suspenderMedicacionSchema.parse(req.body);
    try {
      await suspenderMedicacion(req.tenantPrisma, id, body.motivoSuspension);
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.get("/kardex", async (req) => {
    req.requirePerm(PERMISSIONS.KARDEX_LEER);
    const q = kardexListQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q.medicacionProgramadaId) where.medicacionProgramadaId = q.medicacionProgramadaId;
    if (q.estado) where.estado = q.estado;
    if (q.desde || q.hasta) {
      where.horaProgramada = {
        ...(q.desde ? { gte: new Date(q.desde) } : {}),
        ...(q.hasta ? { lte: new Date(q.hasta) } : {}),
      };
    }
    if (q.hospitalizacionId) {
      where.medicacionProgramada = { hospitalizacionId: q.hospitalizacionId };
    }
    return req.tenantPrisma.kardexAplicacion.findMany({
      where,
      include: {
        medicacionProgramada: {
          select: {
            id: true,
            medicamentoNombreSnapshot: true,
            dosis: true,
            via: true,
            hospitalizacionId: true,
          },
        },
        enfermeraAplicador: { select: { id: true, nombre: true } },
      },
      orderBy: { horaProgramada: "asc" },
    });
  });

  app.post("/kardex/:id/aplicar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.KARDEX_APLICAR);
    const { id } = hospitalizacionIdParamSchema.parse(req.params);
    const body = aplicarKardexSchema.parse(req.body);
    try {
      await aplicarKardex(req.tenantPrisma, {
        kardexId: id,
        enfermeraAplicadorId: req.principal.userId,
        estado: body.estado,
        ...(body.notas ? { notas: body.notas } : {}),
        ...(body.motivoOmision ? { motivoOmision: body.motivoOmision } : {}),
        ...(body.reaccionAdversaObservada
          ? { reaccionAdversaObservada: body.reaccionAdversaObservada }
          : {}),
        ...(body.horaAplicada ? { horaAplicada: new Date(body.horaAplicada) } : {}),
        ...(body.nuevaHoraProgramada
          ? { nuevaHoraProgramada: new Date(body.nuevaHoraProgramada) }
          : {}),
      });
      return reply.code(204).send();
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/signos-vitales", async (req, reply) => {
    req.requirePerm(PERMISSIONS.KARDEX_APLICAR);
    const { id } = hospitalizacionIdParamSchema.parse(req.params);
    const body = capturarSignoVitalSchema.parse(req.body);
    try {
      const result = await capturarSignoVital(
        req.tenantPrisma,
        buildSignoInput(body, id, req.principal.userId),
      );
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/cargos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.HOSPITALIZACION_CREAR);
    const { id } = hospitalizacionIdParamSchema.parse(req.params);
    const body = agregarCargoSchema.parse(req.body);
    try {
      const result = await agregarCargo(req.tenantPrisma, {
        hospitalizacionId: id,
        capturadoPorId: req.principal.userId,
        tipo: body.tipo,
        descripcion: body.descripcion,
        cantidad: body.cantidad,
        precioUnitario: body.precioUnitario,
        ...(body.productoId ? { productoId: body.productoId } : {}),
        ...(body.observaciones ? { observaciones: body.observaciones } : {}),
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });

  app.post("/:id/alta", async (req, reply) => {
    req.requirePerm(PERMISSIONS.HOSPITALIZACION_ALTA);
    const { id } = hospitalizacionIdParamSchema.parse(req.params);
    const body = darAltaSchema.parse(req.body);
    try {
      const result = await darAlta(req.tenantPrisma, {
        hospitalizacionId: id,
        altaPorId: req.principal.userId,
        motivoAlta: body.motivoAlta,
        ...(body.observaciones ? { observaciones: body.observaciones } : {}),
        generarVenta: body.generarVenta,
      });
      return reply.code(200).send(result);
    } catch (err) {
      if (handleErr(reply, err)) return;
      throw err;
    }
  });
};

export default hospitalizacionesRoutes;
