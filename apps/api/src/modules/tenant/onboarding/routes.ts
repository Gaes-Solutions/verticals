import type { FastifyPluginAsync } from "fastify";

/**
 * Guía de inicio: estado de los pasos de configuración del tenant. La UI usa
 * `pasos` para palomear automáticamente y `vertical` para elegir qué pasos mostrar.
 */
const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    const p = req.tenantPrisma;
    const [productos, listas, clientesB2b, usuarios, comisiones, ventas] = await Promise.all([
      p.producto.count(),
      p.listaPrecio.count({ where: { isDefault: false } }),
      p.clienteB2b.count(),
      p.usuario.count(),
      p.reglaComision.count(),
      p.venta.count(),
    ]);

    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: req.tenantSlug },
      select: { vertical: true },
    });

    return {
      vertical: tenant?.vertical ?? "otro",
      pasos: {
        productos: productos > 0,
        listaPrecios: listas > 0,
        clientesB2b: clientesB2b > 0,
        vendedores: usuarios > 1,
        comisiones: comisiones > 0,
        primeraVenta: ventas > 0,
      },
      conteos: { productos, listas, clientesB2b, ventas },
    };
  });
};

export default onboardingRoutes;
