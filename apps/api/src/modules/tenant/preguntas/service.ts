import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyRequest } from "fastify";
import { notificarCliente, notificarUsuariosConPermiso } from "../notificaciones/service.js";

type TenantClient = FastifyRequest["tenantPrisma"];

export class PreguntaError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PreguntaError";
  }
}

/** Un cliente hace una pregunta pública sobre un producto. Queda pendiente hasta
 * que la tienda responde (entonces se publica). */
export async function crearPregunta(
  client: TenantClient,
  productoPublicadoId: string,
  clienteId: string | null,
  autorNombre: string | null,
  texto: string,
): Promise<{ id: string }> {
  const pregunta = texto.trim();
  if (pregunta.length < 5) throw new PreguntaError(422, "Escribe una pregunta más completa");
  const prod = await client.productoPublicado.findUnique({
    where: { id: productoPublicadoId },
    select: { id: true, isPublicado: true, tituloPublico: true },
  });
  if (!prod || !prod.isPublicado) throw new PreguntaError(404, "Producto no encontrado");

  const creada = await client.preguntaProducto.create({
    data: {
      productoPublicadoId,
      pregunta,
      ...(clienteId ? { clienteId } : {}),
      ...(autorNombre ? { autorNombre } : {}),
    },
  });

  await notificarUsuariosConPermiso(client, PERMISSIONS.ECOMMERCE_RESENAS_MODERAR, {
    tipo: "pregunta_nueva",
    titulo: `Nueva pregunta · ${prod.tituloPublico}`,
    cuerpo: pregunta.slice(0, 120),
    link: "/preguntas",
    metadata: { preguntaId: creada.id, productoPublicadoId },
  });
  return { id: creada.id };
}

/** Preguntas YA respondidas (públicas) de un producto, para el storefront. */
export async function listarPreguntasPublicas(
  client: TenantClient,
  productoPublicadoId: string,
): Promise<unknown[]> {
  return client.preguntaProducto.findMany({
    where: { productoPublicadoId, estado: "publicada" },
    orderBy: { respondidaAt: "desc" },
    take: 30,
    select: { id: true, pregunta: true, respuesta: true, respondidaAt: true, createdAt: true },
  });
}

export async function listarPreguntasAdmin(
  client: TenantClient,
  estado?: string,
): Promise<unknown[]> {
  return client.preguntaProducto.findMany({
    where: estado ? { estado: estado as never } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      productoPublicado: { select: { tituloPublico: true, slugSeo: true } },
      cliente: { select: { nombre: true } },
    },
  });
}

/** La tienda responde → la pregunta se publica en el producto. Avisa al cliente. */
export async function responderPregunta(
  client: TenantClient,
  usuarioId: string,
  preguntaId: string,
  respuesta: string,
): Promise<{ id: string }> {
  const texto = respuesta.trim();
  if (texto.length < 1) throw new PreguntaError(422, "La respuesta está vacía");
  const pregunta = await client.preguntaProducto.findUnique({
    where: { id: preguntaId },
    include: { productoPublicado: { select: { slugSeo: true, tituloPublico: true } } },
  });
  if (!pregunta) throw new PreguntaError(404, "Pregunta no encontrada");

  await client.preguntaProducto.update({
    where: { id: preguntaId },
    data: {
      respuesta: texto,
      respondidaPorId: usuarioId,
      respondidaAt: new Date(),
      estado: "publicada",
    },
  });

  if (pregunta.clienteId) {
    await notificarCliente(client, pregunta.clienteId, {
      tipo: "pregunta_respondida",
      titulo: `Respondieron tu pregunta · ${pregunta.productoPublicado.tituloPublico}`,
      cuerpo: texto.slice(0, 120),
      link: `/producto/${pregunta.productoPublicado.slugSeo}`,
      metadata: { preguntaId },
    });
  }
  return { id: preguntaId };
}

export async function rechazarPregunta(
  client: TenantClient,
  preguntaId: string,
): Promise<{ id: string }> {
  const r = await client.preguntaProducto.updateMany({
    where: { id: preguntaId, estado: "pendiente" },
    data: { estado: "rechazada" },
  });
  if (r.count === 0) throw new PreguntaError(404, "Pregunta no encontrada o ya resuelta");
  return { id: preguntaId };
}
