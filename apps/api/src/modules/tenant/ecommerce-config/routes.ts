import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import {
  categoriaPublicaSchema,
  configTiendaSchema,
  idParamSchema,
  publicarProductoSchema,
} from "./schemas.js";

const SINGLETON_ID = "tienda";

const ecommerceConfigRoutes: FastifyPluginAsync = async (app) => {
  app.get("/config", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    return req.tenantPrisma.configTiendaEcommerce.findFirst();
  });

  app.put("/config", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const body = configTiendaSchema.parse(req.body);
    const existing = await req.tenantPrisma.configTiendaEcommerce.findFirst();
    const data = {
      subdominio: body.subdominio,
      nombre: body.nombre,
      ...(body.activa !== undefined ? { activa: body.activa } : {}),
      ...(body.lema !== undefined ? { lema: body.lema } : {}),
      ...(body.descripcionSeo !== undefined ? { descripcionSeo: body.descripcionSeo } : {}),
      ...(body.monedas ? { monedas: body.monedas } : {}),
      ...(body.paisesEnvio ? { paisesEnvio: body.paisesEnvio } : {}),
      ...(body.whatsappChatWidget !== undefined
        ? { whatsappChatWidget: body.whatsappChatWidget }
        : {}),
      ...(body.modo ? { modo: body.modo } : {}),
      ...(body.mostrarInventarioPublico !== undefined
        ? { mostrarInventarioPublico: body.mostrarInventarioPublico }
        : {}),
      ...(body.bufferInventarioPublico !== undefined
        ? { bufferInventarioPublico: body.bufferInventarioPublico }
        : {}),
      ...(body.guestCheckoutPermitido !== undefined
        ? { guestCheckoutPermitido: body.guestCheckoutPermitido }
        : {}),
      ...(body.msiHabilitado !== undefined ? { msiHabilitado: body.msiHabilitado } : {}),
      ...(body.msiMeses ? { msiMeses: body.msiMeses } : {}),
      ...(body.msiMontoMinimo !== undefined ? { msiMontoMinimo: body.msiMontoMinimo } : {}),
      ...(body.galeriaZoom !== undefined ? { galeriaZoom: body.galeriaZoom } : {}),
      ...(body.mostrarRatingProducto !== undefined
        ? { mostrarRatingProducto: body.mostrarRatingProducto }
        : {}),
      ...(body.cuponEnCheckout !== undefined ? { cuponEnCheckout: body.cuponEnCheckout } : {}),
      ...(body.comprarAhora !== undefined ? { comprarAhora: body.comprarAhora } : {}),
      ...(body.cancelacionCliente !== undefined
        ? { cancelacionCliente: body.cancelacionCliente }
        : {}),
      ...(body.facturacionSelfService !== undefined
        ? { facturacionSelfService: body.facturacionSelfService }
        : {}),
      ...(body.preguntasPublicas !== undefined
        ? { preguntasPublicas: body.preguntasPublicas }
        : {}),
      ...(body.paqueteriaProvider !== undefined
        ? { paqueteriaProvider: body.paqueteriaProvider }
        : {}),
      ...(body.paqueteriaAutoGuia !== undefined
        ? { paqueteriaAutoGuia: body.paqueteriaAutoGuia }
        : {}),
      ...(body.tarifasEnVivo !== undefined ? { tarifasEnVivo: body.tarifasEnVivo } : {}),
      ...(body.paqueteriaPesoDefaultKg !== undefined
        ? { paqueteriaPesoDefaultKg: body.paqueteriaPesoDefaultKg }
        : {}),
      ...(body.pushHabilitado !== undefined ? { pushHabilitado: body.pushHabilitado } : {}),
      ...(body.pushEventos ? { pushEventos: body.pushEventos } : {}),
    };
    const cfg = existing
      ? await req.tenantPrisma.configTiendaEcommerce.update({ where: { id: existing.id }, data })
      : await req.tenantPrisma.configTiendaEcommerce.create({
          data: { id: SINGLETON_ID, ...data },
        });
    return reply.code(existing ? 200 : 201).send(cfg);
  });

  app.post("/categorias", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PUBLICAR_PRODUCTO);
    const body = categoriaPublicaSchema.parse(req.body);
    const cat = await req.tenantPrisma.categoriaPublica.create({
      data: {
        nombre: body.nombre,
        slugSeo: body.slugSeo,
        ...(body.parentId ? { parentId: body.parentId } : {}),
        ...(body.descripcion ? { descripcion: body.descripcion } : {}),
        ...(body.orden !== undefined ? { orden: body.orden } : {}),
      },
    });
    return reply.code(201).send(cat);
  });

  app.get("/categorias", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PUBLICAR_PRODUCTO);
    return req.tenantPrisma.categoriaPublica.findMany({ orderBy: { orden: "asc" } });
  });

  app.post("/productos-publicados", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PUBLICAR_PRODUCTO);
    const body = publicarProductoSchema.parse(req.body);
    const producto = await req.tenantPrisma.producto.findUnique({ where: { id: body.productoId } });
    if (!producto) {
      return reply
        .code(404)
        .send({ statusCode: 404, error: "Not Found", message: "Producto no encontrado" });
    }
    const pub = await req.tenantPrisma.productoPublicado.upsert({
      where: { productoId: body.productoId },
      create: {
        productoId: body.productoId,
        ...(body.categoriaPublicaId ? { categoriaPublicaId: body.categoriaPublicaId } : {}),
        tituloPublico: body.tituloPublico,
        slugSeo: body.slugSeo,
        ...(body.descripcionMd ? { descripcionMd: body.descripcionMd } : {}),
        ...(body.descripcionCortaMd ? { descripcionCortaMd: body.descripcionCortaMd } : {}),
        ...(body.fotosArray ? { fotosArray: body.fotosArray } : {}),
        ...(body.precioPublicoOverride
          ? { precioPublicoOverride: body.precioPublicoOverride }
          : {}),
        ...(body.destacadoHome !== undefined ? { destacadoHome: body.destacadoHome } : {}),
        ...(body.tags ? { tags: body.tags } : {}),
      },
      update: {
        ...(body.categoriaPublicaId ? { categoriaPublicaId: body.categoriaPublicaId } : {}),
        tituloPublico: body.tituloPublico,
        slugSeo: body.slugSeo,
        ...(body.descripcionMd !== undefined ? { descripcionMd: body.descripcionMd } : {}),
        ...(body.fotosArray ? { fotosArray: body.fotosArray } : {}),
        ...(body.precioPublicoOverride
          ? { precioPublicoOverride: body.precioPublicoOverride }
          : {}),
        ...(body.destacadoHome !== undefined ? { destacadoHome: body.destacadoHome } : {}),
        isPublicado: true,
      },
    });
    return reply.code(201).send(pub);
  });

  app.delete("/productos-publicados/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_PUBLICAR_PRODUCTO);
    const { id } = idParamSchema.parse(req.params);
    await req.tenantPrisma.productoPublicado.update({
      where: { id },
      data: { isPublicado: false },
    });
    return reply.code(204).send();
  });
};

export default ecommerceConfigRoutes;
