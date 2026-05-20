import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import { FiadoError, aplicarAbonoFiado, disponibleFiado } from "./fiado-service.js";
import {
  type ClienteListQuery,
  clienteCreateSchema,
  clienteIdParamSchema,
  clienteListQuerySchema,
  clienteUpdateSchema,
  direccionCreateSchema,
  etiquetaSchema,
  grupoCreateSchema,
  telefonoCreateSchema,
} from "./schemas.js";

const abonoSchema = z.object({
  monto: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)])
    .transform((v) => String(v)),
  metodoPago: z.enum([
    "efectivo",
    "tarjeta_debito",
    "tarjeta_credito",
    "transferencia",
    "vale",
    "otro",
  ]),
  referencia: z.string().max(120).optional(),
  comprobanteUrl: z.string().url().optional(),
});

function buildClienteWhere(q: ClienteListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.tipo) where.tipo = q.tipo;
  if (q.clienteGrupoId) where.clienteGrupoId = q.clienteGrupoId;
  if (q.permiteFiado !== undefined) where.permiteFiado = q.permiteFiado;
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.q) {
    where.OR = [
      { nombre: { contains: q.q, mode: "insensitive" } },
      { apellidos: { contains: q.q, mode: "insensitive" } },
      { rfc: { contains: q.q.toUpperCase() } },
      { telefonoPrincipal: { contains: q.q } },
      { emailPrincipal: { contains: q.q, mode: "insensitive" } },
      { telefonos: { some: { telefono: { contains: q.q } } } },
    ];
  }
  return where;
}

const clientesRoutes: FastifyPluginAsync = async (app) => {
  // ===== CLIENTES =====
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const q = clienteListQuerySchema.parse(req.query);
    const where = buildClienteWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.cliente.count({ where }),
      req.tenantPrisma.cliente.findMany({
        where,
        include: {
          grupo: { select: { id: true, codigo: true, nombre: true } },
          vendedorAsignado: { select: { id: true, nombre: true } },
          telefonos: true,
          _count: { select: { ventas: true } },
        },
        orderBy: [{ isDefault: "desc" }, { nombre: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/default", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const cliente = await req.tenantPrisma.cliente.findFirst({ where: { isDefault: true } });
    if (!cliente) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Cliente público en general no sembrado",
      });
    }
    return cliente;
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const { id } = clienteIdParamSchema.parse(req.params);
    const cliente = await req.tenantPrisma.cliente.findUnique({
      where: { id },
      include: {
        grupo: true,
        vendedorAsignado: { select: { id: true, nombre: true } },
        direcciones: true,
        telefonos: true,
        etiquetas: true,
        fiado: { include: { movimientos: { take: 20, orderBy: { createdAt: "desc" } } } },
      },
    });
    if (!cliente) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente no encontrado" });
    }
    return cliente;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_CREAR);
    const body = clienteCreateSchema.parse(req.body);
    const data: Record<string, unknown> = stripUndefined(body);
    if (body.fechaNacimiento) {
      data.fechaNacimiento = new Date(body.fechaNacimiento);
    }
    const created = await req.tenantPrisma.cliente.create({
      data: data as Parameters<typeof req.tenantPrisma.cliente.create>[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteIdParamSchema.parse(req.params);
    const body = clienteUpdateSchema.parse(req.body);
    const existing = await req.tenantPrisma.cliente.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente no encontrado" });
    }
    if (existing.isDefault) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "El cliente Público en general es de solo lectura",
      });
    }
    const data: Record<string, unknown> = stripUndefined(body);
    if (body.fechaNacimiento !== undefined) {
      data.fechaNacimiento = body.fechaNacimiento === null ? null : new Date(body.fechaNacimiento);
    }
    return req.tenantPrisma.cliente.update({
      where: { id },
      data: data as Parameters<typeof req.tenantPrisma.cliente.update>[0]["data"],
    });
  });

  app.delete("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteIdParamSchema.parse(req.params);
    const existing = await req.tenantPrisma.cliente.findUnique({ where: { id } });
    if (!existing) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente no encontrado" });
    }
    if (existing.isDefault) {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message: "No puedes archivar el cliente Público en general",
      });
    }
    return req.tenantPrisma.cliente.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    });
  });

  // ===== DIRECCIONES =====
  app.post("/:id/direcciones", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteIdParamSchema.parse(req.params);
    const body = direccionCreateSchema.parse(req.body);
    if (body.isDefaultEnvio) {
      await req.tenantPrisma.clienteDireccion.updateMany({
        where: { clienteId: id, isDefaultEnvio: true },
        data: { isDefaultEnvio: false },
      });
    }
    if (body.isDefaultFacturacion) {
      await req.tenantPrisma.clienteDireccion.updateMany({
        where: { clienteId: id, isDefaultFacturacion: true },
        data: { isDefaultFacturacion: false },
      });
    }
    const created = await req.tenantPrisma.clienteDireccion.create({
      data: { ...stripUndefined(body), clienteId: id } as Parameters<
        typeof req.tenantPrisma.clienteDireccion.create
      >[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.delete("/:id/direcciones/:dirId", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteIdParamSchema.parse(req.params);
    const dirId = (req.params as { dirId?: string }).dirId;
    if (!dirId) {
      return reply
        .code(400)
        .send({ statusCode: 400, error: "Bad Request", message: "dirId requerido" });
    }
    await req.tenantPrisma.clienteDireccion.deleteMany({ where: { id: dirId, clienteId: id } });
    return reply.code(204).send();
  });

  // ===== TELÉFONOS =====
  app.post("/:id/telefonos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteIdParamSchema.parse(req.params);
    const body = telefonoCreateSchema.parse(req.body);
    if (body.esPrincipal) {
      await req.tenantPrisma.clienteTelefono.updateMany({
        where: { clienteId: id, esPrincipal: true },
        data: { esPrincipal: false },
      });
    }
    const created = await req.tenantPrisma.clienteTelefono.create({
      data: { ...stripUndefined(body), clienteId: id } as Parameters<
        typeof req.tenantPrisma.clienteTelefono.create
      >[0]["data"],
    });
    return reply.code(201).send(created);
  });

  // ===== ETIQUETAS =====
  app.post("/:id/etiquetas", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteIdParamSchema.parse(req.params);
    const body = etiquetaSchema.parse(req.body);
    const created = await req.tenantPrisma.clienteEtiqueta.create({
      data: { clienteId: id, etiqueta: body.etiqueta },
    });
    return reply.code(201).send(created);
  });

  app.delete("/:id/etiquetas/:etiqueta", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteIdParamSchema.parse(req.params);
    const etiqueta = (req.params as { etiqueta?: string }).etiqueta;
    if (!etiqueta) {
      return reply
        .code(400)
        .send({ statusCode: 400, error: "Bad Request", message: "etiqueta requerida" });
    }
    await req.tenantPrisma.clienteEtiqueta.deleteMany({
      where: { clienteId: id, etiqueta },
    });
    return reply.code(204).send();
  });

  // ===== FIADO =====
  app.get("/:id/fiado", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const { id } = clienteIdParamSchema.parse(req.params);
    const cliente = await req.tenantPrisma.cliente.findUnique({
      where: { id },
      include: { fiado: { include: { movimientos: { orderBy: { createdAt: "desc" } } } } },
    });
    if (!cliente) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente no encontrado" });
    }
    const total = cliente.fiado?.montoTotal.toString() ?? "0";
    return {
      cliente: { id: cliente.id, nombre: cliente.nombre, permiteFiado: cliente.permiteFiado },
      ...disponibleFiado(cliente.limiteFiado.toString(), total),
      estado: cliente.fiado?.estado ?? "activo",
      fechaUltimoMovimiento: cliente.fiado?.fechaUltimoMovimiento ?? null,
      movimientos: cliente.fiado?.movimientos ?? [],
    };
  });

  app.post("/:id/fiado/abonar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_FIADO_GESTIONAR);
    const { id } = clienteIdParamSchema.parse(req.params);
    const body = abonoSchema.parse(req.body);
    try {
      const result = await aplicarAbonoFiado(req.tenantPrisma, {
        clienteId: id,
        monto: body.monto,
        metodoPago: body.metodoPago,
        ...(body.referencia ? { referencia: body.referencia } : {}),
        ...(body.comprobanteUrl ? { comprobanteUrl: body.comprobanteUrl } : {}),
        usuarioId: req.principal.userId,
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof FiadoError) {
        return reply.code(err.statusCode).send({
          statusCode: err.statusCode,
          error: err.statusCode >= 500 ? "Internal" : "Bad Request",
          message: err.message,
          ...(err.extra ?? {}),
        });
      }
      throw err;
    }
  });

  // ===== GRUPOS =====
  app.get("/grupos/all", async (req) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    return req.tenantPrisma.clienteGrupo.findMany({
      orderBy: { codigo: "asc" },
      include: { _count: { select: { clientes: true } } },
    });
  });

  app.post("/grupos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_CREAR);
    const body = grupoCreateSchema.parse(req.body);
    const created = await req.tenantPrisma.clienteGrupo.create({
      data: stripUndefined(body) as Parameters<
        typeof req.tenantPrisma.clienteGrupo.create
      >[0]["data"],
    });
    return reply.code(201).send(created);
  });
};

export default clientesRoutes;
