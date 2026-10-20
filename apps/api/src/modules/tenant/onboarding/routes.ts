import { PERMISSIONS } from "@gaespos/permissions";
import type { FastifyPluginAsync } from "fastify";

/**
 * Guía de inicio: estado de los pasos de configuración del tenant. La UI usa
 * `pasos` para palomear automáticamente y `vertical` para elegir qué pasos mostrar.
 */
const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req) => {
    req.requirePerm(PERMISSIONS.CONFIGURACION_LEER);
    const p = req.tenantPrisma;
    const [productos, listas, clientesB2b, usuarios, comisiones, ventas, sucursal] =
      await Promise.all([
        p.producto.count({ where: { isActive: true, archivedAt: null } }),
        p.listaPrecio.count({ where: { isDefault: false, isActive: true } }),
        p.clienteB2b.count({ where: { isActive: true } }),
        p.usuario.count({
          where: { isActive: true, roles: { some: { rol: { isActive: true } } } },
        }),
        p.reglaComision.count({ where: { isActive: true } }),
        p.venta.count({ where: { estado: "cobrada" } }),
        p.sucursal.findFirst({
          where: { isActive: true, archivedAt: null },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: { nombre: true, direccion: true },
        }),
      ]);

    const tenant = await app.masterPrisma.tenant.findUnique({
      where: { slug: req.tenantSlug },
      select: { vertical: true },
    });

    return {
      vertical: tenant?.vertical ?? "otro",
      pasos: {
        datosNegocio: Boolean(sucursal?.nombre.trim()) && direccionCompleta(sucursal?.direccion),
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

function direccionCompleta(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const direccion = value as Record<string, unknown>;
  const texto = (key: string) => (typeof direccion[key] === "string" ? direccion[key].trim() : "");
  return Boolean(
    texto("calle") && (texto("municipio") || texto("ciudad")) && /^[0-9]{5}$/.test(texto("cp")),
  );
}

export default onboardingRoutes;
