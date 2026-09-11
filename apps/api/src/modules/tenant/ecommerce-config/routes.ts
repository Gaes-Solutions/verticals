import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  DominioEnUsoError,
  apexPlataforma,
  asegurarHostsDisponibles,
  instruccionesDns,
  sincronizarDominioMaster,
  tokenVerificacion,
  urlPublicaTienda,
  verificarTxt,
} from "./dominio-service.js";
import {
  categoriaPublicaSchema,
  configTiendaSchema,
  idParamSchema,
  publicarProductoSchema,
} from "./schemas.js";

const SINGLETON_ID = "tienda";

/**
 * Calcula el parche de campos del dominio propio según el valor entrante:
 * desconectar (null/""), conectar/cambiar (nuevo token + sin verificar), o
 * dejarlo igual. El token sirve para probar la propiedad por DNS TXT.
 */
function patchDominioPropio(
  entrante: string | null | undefined,
  anterior: string | null,
): Record<string, unknown> {
  if (entrante === undefined) return {};
  if (!entrante) {
    return { dominioPropio: null, dominioVerificado: false, dominioTokenVerificacion: null };
  }
  if (entrante !== anterior) {
    return {
      dominioPropio: entrante,
      dominioVerificado: false,
      dominioTokenVerificacion: tokenVerificacion(),
    };
  }
  return {};
}

const ecommerceConfigRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof DominioEnUsoError) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: "Ese subdominio o dominio ya está en uso por otro negocio",
      });
    }
    return reply.send(err);
  });

  app.get("/servicios-envio", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const { q } = z.object({ q: z.string().trim().max(120).default("") }).parse(req.query);
    const rows = await req.tenantPrisma.productoVariante.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        producto: { tipoVenta: "servicio", isActive: true, archivedAt: null },
        ...(q
          ? {
              OR: [
                { sku: { contains: q, mode: "insensitive" as const } },
                { nombreVariante: { contains: q, mode: "insensitive" as const } },
                { producto: { nombre: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      select: { id: true, sku: true, nombreVariante: true, producto: { select: { nombre: true } } },
      orderBy: [{ producto: { nombre: "asc" } }, { sku: "asc" }],
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      nombre: row.producto.nombre,
      nombreVariante: row.nombreVariante,
      sku: row.sku,
    }));
  });
  app.get("/servicios-envio/:id", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const { id } = idParamSchema.parse(req.params);
    const row = await req.tenantPrisma.productoVariante.findFirst({
      where: {
        id,
        isActive: true,
        archivedAt: null,
        producto: { tipoVenta: "servicio", isActive: true, archivedAt: null },
      },
      select: { id: true, sku: true, nombreVariante: true, producto: { select: { nombre: true } } },
    });
    if (!row) return reply.code(404).send({ message: "Servicio de envío no disponible" });
    return {
      id: row.id,
      nombre: row.producto.nombre,
      nombreVariante: row.nombreVariante,
      sku: row.sku,
    };
  });

  app.get("/config", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const config = await req.tenantPrisma.configTiendaEcommerce.findFirst();
    if (!config) return config;
    // El panel necesita la dirección final para armar el QR del mostrador.
    return { ...config, urlPublica: urlPublicaTienda(config) };
  });

  // Lo que el panel necesita antes de guardar, aun sin tienda configurada: la
  // terminación de la dirección ("tu dirección será …") y si ya hay algo
  // publicado, porque sin productos la tienda no se puede activar.
  app.get("/estado", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const productosPublicados = await req.tenantPrisma.productoPublicado.count({
      where: { isPublicado: true },
    });
    return { apexTienda: apexPlataforma(), productosPublicados };
  });

  app.put("/config", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const body = configTiendaSchema.parse(req.body);
    if (body.envioVarianteId) {
      const service = await req.tenantPrisma.productoVariante.findFirst({
        where: {
          id: body.envioVarianteId,
          isActive: true,
          archivedAt: null,
          producto: { tipoVenta: "servicio", isActive: true, archivedAt: null },
        },
        select: { id: true },
      });
      if (!service)
        return reply
          .code(422)
          .send({ message: "Selecciona un servicio de envío activo de este negocio" });
    }
    const existing = await req.tenantPrisma.configTiendaEcommerce.findFirst();
    // Una tienda encendida sin nada que vender es una página vacía para quien
    // escanea el QR: primero se publica, luego se enciende.
    if (body.activa && !existing?.activa) {
      const publicados = await req.tenantPrisma.productoPublicado.count({
        where: { isPublicado: true },
      });
      if (publicados === 0) {
        return reply.code(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: "Publica al menos un producto antes de activar tu tienda",
        });
      }
    }
    await asegurarHostsDisponibles(app.masterPrisma, req.tenantSlug, {
      subdominio: body.subdominio,
      dominioPropio:
        body.dominioPropio === undefined
          ? (existing?.dominioPropio ?? null)
          : (body.dominioPropio ?? null),
    });
    const data = {
      ...(body.envioVarianteId !== undefined ? { envioVarianteId: body.envioVarianteId } : {}),
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
      ...(body.pasarelaPagoProvider !== undefined
        ? { pasarelaPagoProvider: body.pasarelaPagoProvider }
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
      ...(body.politicasHtml ? { politicasHtml: body.politicasHtml } : {}),
      ...patchDominioPropio(body.dominioPropio, existing?.dominioPropio ?? null),
    };
    const cfg = existing
      ? await req.tenantPrisma.configTiendaEcommerce.update({ where: { id: existing.id }, data })
      : await req.tenantPrisma.configTiendaEcommerce.create({
          data: { id: SINGLETON_ID, ...data },
        });
    await sincronizarDominioMaster(app.masterPrisma, req.tenantSlug, {
      subdominio: cfg.subdominio,
      dominioPropio: cfg.dominioPropio,
      dominioVerificado: cfg.dominioVerificado,
      dominioPropioAnterior: existing?.dominioPropio ?? null,
    });
    return reply.code(existing ? 200 : 201).send({ ...cfg, urlPublica: urlPublicaTienda(cfg) });
  });

  // Estado del dominio propio + instrucciones DNS que el sistema recomienda.
  app.get("/dominio", async (req) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const c = await req.tenantPrisma.configTiendaEcommerce.findFirst();
    const dominio = c?.dominioPropio ?? null;
    return {
      dominioPropio: dominio,
      verificado: c?.dominioVerificado ?? false,
      instrucciones: dominio
        ? instruccionesDns(dominio, c?.dominioTokenVerificacion ?? null)
        : null,
    };
  });

  // Verifica la propiedad del dominio leyendo el TXT esperado vía DNS.
  app.post("/dominio/verificar", async (req, reply) => {
    req.requirePerm(PERMISSIONS.ECOMMERCE_CONFIGURAR);
    const c = await req.tenantPrisma.configTiendaEcommerce.findFirst();
    if (!c?.dominioPropio || !c.dominioTokenVerificacion) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "No hay un dominio propio por verificar",
      });
    }
    const ok = await verificarTxt(c.dominioPropio, c.dominioTokenVerificacion);
    if (ok && !c.dominioVerificado) {
      await req.tenantPrisma.configTiendaEcommerce.update({
        where: { id: c.id },
        data: { dominioVerificado: true },
      });
    }
    await sincronizarDominioMaster(app.masterPrisma, req.tenantSlug, {
      subdominio: c.subdominio,
      dominioPropio: c.dominioPropio,
      dominioVerificado: ok,
      dominioPropioAnterior: c.dominioPropio,
    });
    return {
      verificado: ok,
      instrucciones: instruccionesDns(c.dominioPropio, c.dominioTokenVerificacion),
    };
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
    req.requireAnyPerm([PERMISSIONS.ECOMMERCE_PUBLICAR_PRODUCTO, PERMISSIONS.ECOMMERCE_TIENDA_WEB]);
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
