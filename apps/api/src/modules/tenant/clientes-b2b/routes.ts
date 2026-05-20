import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { stripUndefined } from "../../../lib/strip-undefined.js";
import {
  type ClienteB2bListQuery,
  clienteB2bCreateSchema,
  clienteB2bIdParamSchema,
  clienteB2bListQuerySchema,
  clienteB2bUpdateSchema,
  contactoCreateSchema,
  creditoCreateSchema,
  direccionB2bCreateSchema,
  listaPrecioAsignacionSchema,
  vendedorAsignacionSchema,
} from "./schemas.js";

function buildB2bWhere(q: ClienteB2bListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (q.industria) where.industria = q.industria;
  if (q.nivelMayoreoId) where.nivelMayoreoId = q.nivelMayoreoId;
  if (q.condicionesPago) where.condicionesPago = q.condicionesPago;
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.q) {
    where.OR = [
      { razonSocial: { contains: q.q, mode: "insensitive" } },
      { nombreComercial: { contains: q.q, mode: "insensitive" } },
      { rfc: { contains: q.q.toUpperCase() } },
      { telefonoPrincipal: { contains: q.q } },
      { emailPrincipal: { contains: q.q, mode: "insensitive" } },
      { contactos: { some: { nombre: { contains: q.q, mode: "insensitive" } } } },
    ];
  }
  return where;
}

const clientesB2bRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const q = clienteB2bListQuerySchema.parse(req.query);
    const where = buildB2bWhere(q);
    const [total, items] = await Promise.all([
      req.tenantPrisma.clienteB2b.count({ where }),
      req.tenantPrisma.clienteB2b.findMany({
        where,
        include: {
          nivelMayoreo: { select: { id: true, codigo: true, nombre: true } },
          _count: { select: { contactos: true, direcciones: true, ventas: true } },
        },
        orderBy: { razonSocial: "asc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_LEER);
    const { id } = clienteB2bIdParamSchema.parse(req.params);
    const item = await req.tenantPrisma.clienteB2b.findUnique({
      where: { id },
      include: {
        nivelMayoreo: true,
        contactos: { where: { isActive: true } },
        direcciones: true,
        creditos: { orderBy: { vigenteDesde: "desc" } },
        listasPrecio: { include: { lista: { select: { id: true, codigo: true, nombre: true } } } },
        vendedoresAsignados: {
          include: { usuario: { select: { id: true, nombre: true, apellidos: true } } },
        },
      },
    });
    if (!item) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Cliente B2B no encontrado" });
    }
    return item;
  });

  app.post("/", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_CREAR);
    const body = clienteB2bCreateSchema.parse(req.body);
    if (body.nivelMayoreoId) {
      const nivel = await req.tenantPrisma.nivelPrecioMayoreo.findUnique({
        where: { id: body.nivelMayoreoId },
      });
      if (!nivel) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `nivelMayoreoId "${body.nivelMayoreoId}" no existe`,
        });
      }
    }
    if (body.listaPrecioPrincipalCodigo) {
      const lista = await req.tenantPrisma.listaPrecio.findUnique({
        where: { codigo: body.listaPrecioPrincipalCodigo },
      });
      if (!lista) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `Lista de precios "${body.listaPrecioPrincipalCodigo}" no existe`,
        });
      }
    }
    const created = await req.tenantPrisma.clienteB2b.create({
      data: stripUndefined(body) as Parameters<
        typeof req.tenantPrisma.clienteB2b.create
      >[0]["data"],
    });
    return reply.code(201).send(created);
  });

  app.patch("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteB2bIdParamSchema.parse(req.params);
    const body = clienteB2bUpdateSchema.parse(req.body);
    return req.tenantPrisma.clienteB2b.update({
      where: { id },
      data: stripUndefined(body) as Parameters<
        typeof req.tenantPrisma.clienteB2b.update
      >[0]["data"],
    });
  });

  app.delete("/:id", async (req) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteB2bIdParamSchema.parse(req.params);
    return req.tenantPrisma.clienteB2b.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
    });
  });

  // ===== CONTACTOS =====
  app.post("/:id/contactos", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteB2bIdParamSchema.parse(req.params);
    const body = contactoCreateSchema.parse(req.body);
    const created = await req.tenantPrisma.clienteB2bContacto.create({
      data: { ...stripUndefined(body), clienteB2bId: id } as Parameters<
        typeof req.tenantPrisma.clienteB2bContacto.create
      >[0]["data"],
    });
    return reply.code(201).send(created);
  });

  // ===== DIRECCIONES =====
  app.post("/:id/direcciones", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteB2bIdParamSchema.parse(req.params);
    const body = direccionB2bCreateSchema.parse(req.body);
    if (body.isDefaultEnvio) {
      await req.tenantPrisma.clienteB2bDireccion.updateMany({
        where: { clienteB2bId: id, isDefaultEnvio: true },
        data: { isDefaultEnvio: false },
      });
    }
    const created = await req.tenantPrisma.clienteB2bDireccion.create({
      data: { ...stripUndefined(body), clienteB2bId: id } as Parameters<
        typeof req.tenantPrisma.clienteB2bDireccion.create
      >[0]["data"],
    });
    return reply.code(201).send(created);
  });

  // ===== CRÉDITOS =====
  app.post("/:id/credito", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_FIADO_GESTIONAR);
    const { id } = clienteB2bIdParamSchema.parse(req.params);
    const body = creditoCreateSchema.parse(req.body);
    await req.tenantPrisma.clienteB2bCredito.updateMany({
      where: { clienteB2bId: id, isActive: true },
      data: { isActive: false, vigenteHasta: new Date() },
    });
    const created = await req.tenantPrisma.clienteB2bCredito.create({
      data: {
        clienteB2bId: id,
        lineaAutorizada: body.lineaAutorizada,
        diasCredito: body.diasCredito,
        ...(body.tasaInteresMoraPct !== undefined
          ? { tasaInteresMoraPct: body.tasaInteresMoraPct }
          : {}),
        permiteFacturasVencidas: body.permiteFacturasVencidas,
        ...(body.garantiaDocumentada ? { garantiaDocumentada: body.garantiaDocumentada } : {}),
        ...(body.vigenteDesde ? { vigenteDesde: new Date(body.vigenteDesde) } : {}),
        ...(body.vigenteHasta ? { vigenteHasta: new Date(body.vigenteHasta) } : {}),
        aprobadoPorId: req.principal.userId,
        ...(body.notasAutorizacion ? { notasAutorizacion: body.notasAutorizacion } : {}),
      },
    });
    return reply.code(201).send(created);
  });

  // ===== LISTAS DE PRECIO =====
  app.post("/:id/listas-precio", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteB2bIdParamSchema.parse(req.params);
    const body = listaPrecioAsignacionSchema.parse(req.body);
    const lista = await req.tenantPrisma.listaPrecio.findUnique({
      where: { codigo: body.listaPrecioCodigo },
    });
    if (!lista) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `Lista de precios "${body.listaPrecioCodigo}" no existe`,
      });
    }
    const created = await req.tenantPrisma.clienteB2bListaPrecio.upsert({
      where: { clienteB2bId_listaPrecioId: { clienteB2bId: id, listaPrecioId: lista.id } },
      create: {
        clienteB2bId: id,
        listaPrecioId: lista.id,
        prioridad: body.prioridad,
        ...(body.vigenteDesde ? { vigenteDesde: new Date(body.vigenteDesde) } : {}),
        ...(body.vigenteHasta ? { vigenteHasta: new Date(body.vigenteHasta) } : {}),
      },
      update: {
        prioridad: body.prioridad,
        ...(body.vigenteDesde ? { vigenteDesde: new Date(body.vigenteDesde) } : {}),
        ...(body.vigenteHasta ? { vigenteHasta: new Date(body.vigenteHasta) } : {}),
      },
    });
    return reply.code(201).send(created);
  });

  // ===== VENDEDORES ASIGNADOS =====
  app.post("/:id/vendedores", async (req, reply) => {
    req.requirePerm(PERMISSIONS.CLIENTES_ACTUALIZAR);
    const { id } = clienteB2bIdParamSchema.parse(req.params);
    const body = vendedorAsignacionSchema.parse(req.body);
    const usuario = await req.tenantPrisma.usuario.findUnique({ where: { id: body.usuarioId } });
    if (!usuario) {
      return reply.code(404).send({
        statusCode: 404,
        error: "Not Found",
        message: `Usuario "${body.usuarioId}" no existe`,
      });
    }
    const created = await req.tenantPrisma.clienteB2bVendedorAsignado.upsert({
      where: {
        clienteB2bId_usuarioId_tipo: {
          clienteB2bId: id,
          usuarioId: body.usuarioId,
          tipo: body.tipo,
        },
      },
      create: {
        clienteB2bId: id,
        usuarioId: body.usuarioId,
        tipo: body.tipo,
        ...(body.comisionPctOverride !== undefined
          ? { comisionPctOverride: body.comisionPctOverride }
          : {}),
        ...(body.vigenteHasta ? { vigenteHasta: new Date(body.vigenteHasta) } : {}),
      },
      update: {
        ...(body.comisionPctOverride !== undefined
          ? { comisionPctOverride: body.comisionPctOverride }
          : {}),
        ...(body.vigenteHasta ? { vigenteHasta: new Date(body.vigenteHasta) } : {}),
      },
    });
    return reply.code(201).send(created);
  });
};

export default clientesB2bRoutes;
