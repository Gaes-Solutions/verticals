import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import adminAuditRoutes from "./modules/admin/audit-routes.js";
import adminBillingOpsRoutes from "./modules/admin/billing-ops-routes.js";
import adminCatalogoRoutes from "./modules/admin/catalogo-routes.js";
import adminMetricsRoutes from "./modules/admin/metrics-routes.js";
import adminObservabilidadRoutes from "./modules/admin/observabilidad-routes.js";
import adminRolesPlantillaRoutes from "./modules/admin/roles-plantilla-routes.js";
import adminTeamRoutes from "./modules/admin/team-routes.js";
import adminTenantsRoutes from "./modules/admin/tenants-routes.js";
import adminTicketsRoutes from "./modules/admin/tickets-routes.js";
import authTenantRoutes from "./modules/auth-tenant/routes.js";
import authRoutes from "./modules/auth/routes.js";
import autofacturaPublicRoutes from "./modules/autofactura/routes.js";
import { b2bAuthRoutes, b2bPortalRoutes } from "./modules/b2b-portal/routes.js";
import {
  billingAdminGaesSoftRoutes,
  billingAdminTenantRoutes,
  billingPublicRoutes,
  billingWebhookRoutes,
} from "./modules/billing/routes.js";
import { clienteAuthRoutes, clientePortalRoutes } from "./modules/cliente-portal/routes.js";
import doctoraliaTenantRoutes, {
  doctoraliaAdminRoutes,
  doctoraliaPublicRoutes,
} from "./modules/doctoralia/routes.js";
import healthRoutes from "./modules/health/routes.js";
import partnersRoutes, { partnersPublicRoutes } from "./modules/partners/routes.js";
import phrTenantRoutes, {
  patientAuthRoutes,
  patientEmergencyPublicRoutes,
  patientPortalRoutes,
} from "./modules/patient-portal/routes.js";
import agendaRoutes from "./modules/tenant/agenda/routes.js";
import apartadosRoutes from "./modules/tenant/apartados/routes.js";
import cajasRoutes from "./modules/tenant/cajas/routes.js";
import camasRoutes from "./modules/tenant/camas/routes.js";
import campanasRoutes from "./modules/tenant/campanas/routes.js";
import carritoRoutes from "./modules/tenant/carrito/routes.js";
import categoriasRoutes from "./modules/tenant/categorias/routes.js";
import cfdisRecibidosRoutes from "./modules/tenant/cfdis-recibidos/routes.js";
import cfdisRoutes from "./modules/tenant/cfdis/routes.js";
import checkoutRoutes from "./modules/tenant/checkout/routes.js";
import citasRoutes from "./modules/tenant/citas/routes.js";
import clientesB2bRoutes from "./modules/tenant/clientes-b2b/routes.js";
import clientesRoutes from "./modules/tenant/clientes/routes.js";
import cobrosRoutes from "./modules/tenant/cobros/routes.js";
import consultasRoutes from "./modules/tenant/consultas/routes.js";
import cortesRoutes from "./modules/tenant/cortes/routes.js";
import cotizacionesRoutes from "./modules/tenant/cotizaciones/routes.js";
import cxcRoutes from "./modules/tenant/cxc/routes.js";
import devolucionesOnlineRoutes from "./modules/tenant/devoluciones-online/routes.js";
import devolucionesRoutes from "./modules/tenant/devoluciones/routes.js";
import diotRoutes from "./modules/tenant/diot/routes.js";
import ecommerceConfigRoutes from "./modules/tenant/ecommerce-config/routes.js";
import enviosRoutes from "./modules/tenant/envios/routes.js";
import hospitalizacionesRoutes from "./modules/tenant/hospitalizaciones/routes.js";
import inventarioInsightsRoutes from "./modules/tenant/inventario-insights/routes.js";
import inventarioRoutes from "./modules/tenant/inventario/routes.js";
import lealtadRoutes from "./modules/tenant/lealtad/routes.js";
import preciosRoutes from "./modules/tenant/listas-precios/routes.js";
import lotesRoutes from "./modules/tenant/lotes/routes.js";
import marcasRoutes from "./modules/tenant/marcas/routes.js";
import mascotasRoutes from "./modules/tenant/mascotas/routes.js";
import medicosRoutes from "./modules/tenant/medicos/routes.js";
import monederoRoutes from "./modules/tenant/monedero/routes.js";
import notificacionesRoutes from "./modules/tenant/notificaciones/routes.js";
import ordenesCompraRoutes from "./modules/tenant/ordenes-compra/routes.js";
import pacientesRoutes from "./modules/tenant/pacientes/routes.js";
import pedidosEcommerceRoutes from "./modules/tenant/pedidos-ecommerce/routes.js";
import pedidosRoutes from "./modules/tenant/pedidos/routes.js";
import preguntasRoutes from "./modules/tenant/preguntas/routes.js";
import productosRoutes from "./modules/tenant/productos/routes.js";
import promocionesRoutes from "./modules/tenant/promociones/routes.js";
import recargasRoutes from "./modules/tenant/recargas/routes.js";
import recetasRoutes from "./modules/tenant/recetas/routes.js";
import reportesRoutes from "./modules/tenant/reportes/routes.js";
import resenasRoutes from "./modules/tenant/resenas/routes.js";
import rolesRoutes from "./modules/tenant/roles/routes.js";
import segmentosRoutes from "./modules/tenant/segmentos/routes.js";
import seguridadRoutes from "./modules/tenant/seguridad/routes.js";
import seriesRoutes from "./modules/tenant/series/routes.js";
import sucursalesRoutes from "./modules/tenant/sucursales/routes.js";
import syncRoutes from "./modules/tenant/sync/routes.js";
import ticketsRoutes from "./modules/tenant/tickets/routes.js";
import usuariosRoutes from "./modules/tenant/usuarios/routes.js";
import vacunacionesRoutes from "./modules/tenant/vacunaciones/routes.js";
import variantesRoutes from "./modules/tenant/variantes/routes.js";
import ventasRoutes from "./modules/tenant/ventas/routes.js";
import vistasGuardadasRoutes from "./modules/tenant/vistas-guardadas/routes.js";
import wishlistsRoutes from "./modules/tenant/wishlists/routes.js";
import tenantRoutes from "./modules/tenants/routes.js";
import conektaWebhookRoutes from "./modules/webhooks/conekta-routes.js";
import aiPlugin, { type AiProviderFactory } from "./plugins/ai.js";
import authPlugin from "./plugins/auth.js";
import dbPlugin from "./plugins/db.js";
import emailPlugin, { type EmailProviderFactory } from "./plugins/email.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import fiscalPlugin, { type FiscalProviderFactory } from "./plugins/fiscal.js";
import mensajeriaPlugin, { type MensajeriaProviderFactory } from "./plugins/mensajeria.js";
import pagosPlugin, { type PagoProviderFactory } from "./plugins/pagos.js";
import paqueteriasPlugin, { type ShippingProviderFactory } from "./plugins/paqueterias.js";
import recargasPlugin, { type RecargaProviderFactory } from "./plugins/recargas.js";
import securityPlugin from "./plugins/security.js";
import tenantContextPlugin from "./plugins/tenant-context.js";

export interface BuildAppOptions {
  fiscalProviderFactory?: FiscalProviderFactory;
  recargaProviderFactory?: RecargaProviderFactory;
  aiProviderFactory?: AiProviderFactory;
  pagoProviderFactory?: PagoProviderFactory;
  shippingProviderFactory?: ShippingProviderFactory;
  emailProviderFactory?: EmailProviderFactory;
  mensajeriaProviderFactory?: MensajeriaProviderFactory;
}

export async function buildApp(
  config: Config,
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === "development"
        ? {
            level: config.LOG_LEVEL,
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "HH:MM:ss.l" },
            },
          }
        : { level: config.LOG_LEVEL },
    disableRequestLogging: false,
    trustProxy: true,
  });

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { config });
  await app.register(dbPlugin);
  await app.register(authPlugin, { config });
  await app.register(
    fiscalPlugin,
    opts.fiscalProviderFactory ? { factory: opts.fiscalProviderFactory } : {},
  );
  await app.register(
    recargasPlugin,
    opts.recargaProviderFactory ? { factory: opts.recargaProviderFactory } : {},
  );
  await app.register(aiPlugin, opts.aiProviderFactory ? { factory: opts.aiProviderFactory } : {});
  await app.register(
    pagosPlugin,
    opts.pagoProviderFactory ? { factory: opts.pagoProviderFactory } : {},
  );
  await app.register(
    paqueteriasPlugin,
    opts.shippingProviderFactory ? { factory: opts.shippingProviderFactory } : {},
  );
  await app.register(
    emailPlugin,
    opts.emailProviderFactory ? { factory: opts.emailProviderFactory } : {},
  );
  await app.register(
    mensajeriaPlugin,
    opts.mensajeriaProviderFactory ? { factory: opts.mensajeriaProviderFactory } : {},
  );

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth", config });
  await app.register(authTenantRoutes, { prefix: "/auth/tenant" });
  await app.register(tenantRoutes, { prefix: "/tenants" });
  await app.register(adminMetricsRoutes, { prefix: "/admin/metrics" });
  await app.register(adminBillingOpsRoutes, { prefix: "/admin/billing-ops" });
  await app.register(adminAuditRoutes, { prefix: "/admin/audit" });
  await app.register(adminTeamRoutes, { prefix: "/admin/team" });
  await app.register(adminTenantsRoutes, { prefix: "/admin/tenants" });
  await app.register(adminRolesPlantillaRoutes, { prefix: "/admin/roles-plantilla" });
  await app.register(adminCatalogoRoutes, { prefix: "/admin/catalogo" });
  await app.register(adminObservabilidadRoutes, { prefix: "/admin/observabilidad" });
  await app.register(adminTicketsRoutes, { prefix: "/admin/tickets" });
  await app.register(partnersRoutes, { prefix: "/partners" });
  await app.register(partnersPublicRoutes);
  await app.register(doctoraliaAdminRoutes);
  await app.register(doctoraliaPublicRoutes);
  await app.register(patientAuthRoutes, { prefix: "/auth/patient" });
  await app.register(patientPortalRoutes, { prefix: "/patient-portal" });
  await app.register(patientEmergencyPublicRoutes);
  await app.register(billingPublicRoutes);
  await app.register(autofacturaPublicRoutes);
  await app.register(billingAdminTenantRoutes);
  await app.register(billingWebhookRoutes);
  await app.register(conektaWebhookRoutes);
  await app.register(billingAdminGaesSoftRoutes);
  await app.register(clienteAuthRoutes, { prefix: "/auth/cliente" });
  await app.register(clientePortalRoutes, { prefix: "/cliente-portal" });
  await app.register(b2bAuthRoutes, { prefix: "/auth/cliente-b2b" });
  await app.register(b2bPortalRoutes, { prefix: "/b2b-portal" });

  await app.register(
    async (tenantApp) => {
      await tenantApp.register(tenantContextPlugin);
      await tenantApp.register(usuariosRoutes, { prefix: "/usuarios" });
      await tenantApp.register(rolesRoutes, { prefix: "/roles" });
      await tenantApp.register(sucursalesRoutes, { prefix: "/sucursales" });
      await tenantApp.register(cajasRoutes, { prefix: "/cajas" });
      await tenantApp.register(categoriasRoutes, { prefix: "/categorias" });
      await tenantApp.register(marcasRoutes, { prefix: "/marcas" });
      await tenantApp.register(productosRoutes, { prefix: "/productos" });
      await tenantApp.register(variantesRoutes, { prefix: "/variantes" });
      await tenantApp.register(inventarioRoutes, { prefix: "/inventario" });
      await tenantApp.register(lotesRoutes, { prefix: "/lotes" });
      await tenantApp.register(seriesRoutes, { prefix: "/series" });
      await tenantApp.register(preciosRoutes, { prefix: "/precios" });
      await tenantApp.register(ventasRoutes, { prefix: "/ventas" });
      await tenantApp.register(cortesRoutes);
      await tenantApp.register(cfdisRoutes);
      await tenantApp.register(ticketsRoutes);
      await tenantApp.register(clientesRoutes, { prefix: "/clientes" });
      await tenantApp.register(clientesB2bRoutes, { prefix: "/clientes-b2b" });
      await tenantApp.register(apartadosRoutes, { prefix: "/apartados" });
      await tenantApp.register(cxcRoutes, { prefix: "/cxc" });
      await tenantApp.register(cotizacionesRoutes, { prefix: "/cotizaciones" });
      await tenantApp.register(pedidosRoutes, { prefix: "/pedidos" });
      await tenantApp.register(devolucionesRoutes);
      await tenantApp.register(recargasRoutes, { prefix: "/recargas" });
      await tenantApp.register(reportesRoutes, { prefix: "/reportes" });
      await tenantApp.register(seguridadRoutes, { prefix: "/seguridad" });
      await tenantApp.register(cobrosRoutes, { prefix: "/cobros" });
      await tenantApp.register(monederoRoutes, { prefix: "/monedero" });
      await tenantApp.register(inventarioInsightsRoutes, { prefix: "/inventario-insights" });
      await tenantApp.register(vistasGuardadasRoutes, { prefix: "/vistas-guardadas" });
      await tenantApp.register(pacientesRoutes, { prefix: "/pacientes" });
      await tenantApp.register(medicosRoutes, { prefix: "/medicos" });
      await tenantApp.register(agendaRoutes, { prefix: "/agenda" });
      await tenantApp.register(citasRoutes, { prefix: "/citas" });
      await tenantApp.register(consultasRoutes, { prefix: "/consultas" });
      await tenantApp.register(recetasRoutes, { prefix: "/recetas" });
      await tenantApp.register(mascotasRoutes, { prefix: "/mascotas" });
      await tenantApp.register(vacunacionesRoutes, { prefix: "/vacunaciones" });
      await tenantApp.register(camasRoutes, { prefix: "/camas" });
      await tenantApp.register(hospitalizacionesRoutes, { prefix: "/hospitalizaciones" });
      await tenantApp.register(cfdisRecibidosRoutes, { prefix: "/cfdis-recibidos" });
      await tenantApp.register(ordenesCompraRoutes, { prefix: "/ordenes-compra" });
      await tenantApp.register(diotRoutes, { prefix: "/diot" });
      await tenantApp.register(ecommerceConfigRoutes, { prefix: "/ecommerce" });
      await tenantApp.register(carritoRoutes, { prefix: "/tienda" });
      await tenantApp.register(enviosRoutes, { prefix: "/envios" });
      await tenantApp.register(checkoutRoutes, { prefix: "/checkout" });
      await tenantApp.register(pedidosEcommerceRoutes, { prefix: "/pedidos-ecommerce" });
      await tenantApp.register(devolucionesOnlineRoutes, { prefix: "/devoluciones-online" });
      await tenantApp.register(preguntasRoutes, { prefix: "/preguntas" });
      await tenantApp.register(notificacionesRoutes, { prefix: "/notificaciones" });
      await tenantApp.register(resenasRoutes, { prefix: "/resenas" });
      await tenantApp.register(wishlistsRoutes, { prefix: "/wishlists" });
      await tenantApp.register(promocionesRoutes, { prefix: "/promociones" });
      await tenantApp.register(segmentosRoutes, { prefix: "/segmentos" });
      await tenantApp.register(campanasRoutes, { prefix: "/campanas" });
      await tenantApp.register(lealtadRoutes, { prefix: "/lealtad" });
      await tenantApp.register(doctoraliaTenantRoutes, { prefix: "/doctoralia" });
      await tenantApp.register(phrTenantRoutes, { prefix: "/phr" });
      await tenantApp.register(syncRoutes, { prefix: "/sync" });
    },
    { prefix: "/t" },
  );

  return app;
}
