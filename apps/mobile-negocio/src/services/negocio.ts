import { api } from "../lib/api";

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ResumenVentas {
  desde: string;
  hasta: string;
  dias: number;
  totalPeriodo: number;
  numTickets: number;
  ticketPromedio: number;
  ivaPeriodo: number;
  porDia: Array<{ fecha: string; total: number; tickets: number }>;
  porCanal: Array<{ canal: string; total: number; tickets: number }>;
  topProductos: Array<{ productoId: string; nombre: string; cantidad: number; monto: number }>;
}

export interface VentaListItem {
  id: string;
  folio: string;
  total: string;
  estado: string;
  canal: string;
  createdAt: string;
  usuario?: { nombre: string } | null;
}

export interface ProductoItem {
  id: string;
  nombre: string;
  skuPadre: string;
  variantes: Array<{ precioBase: string }>;
}

export const getResumen = (dias: number) =>
  api.get<ResumenVentas>(`/t/reportes/resumen?dias=${dias}`);

export const listVentas = (canal?: string) => {
  const qs = new URLSearchParams({ pageSize: "30" });
  if (canal) qs.set("canal", canal);
  return api.get<Paged<VentaListItem>>(`/t/ventas?${qs.toString()}`);
};

export const listProductos = (q: string) =>
  api.get<Paged<ProductoItem>>(`/t/productos?pageSize=30&q=${encodeURIComponent(q)}`);

// ---- POS / Cobro ----

export interface VarianteItem {
  id: string;
  sku: string;
  precioBase: string;
  isDefault: boolean;
}

export interface ProductoPOS {
  id: string;
  nombre: string;
  skuPadre: string;
  variantes: VarianteItem[];
}

export interface Sucursal {
  id: string;
  nombre: string;
  codigo: string;
  isDefault: boolean;
}

export interface VentaPreview {
  subtotal: string;
  descuentoTotal: string;
  ivaTotal: string;
  total: string;
}

export interface VentaCreada {
  id: string;
  folio: string;
  total: string;
  estado: string;
}

export interface LineaVenta {
  varianteId: string;
  cantidad: string;
}

export const listSucursales = () => api.get<Sucursal[]>("/t/sucursales");

/** Busca productos para el POS (variantes con id + precio). */
export const buscarProductosPOS = (q: string) =>
  api.get<Paged<ProductoPOS>>(`/t/productos?pageSize=25&isActive=true&q=${encodeURIComponent(q)}`);

/** Previsualiza los totales (pricing + promos) sin cobrar. */
export const previewVenta = (sucursalId: string, lineas: LineaVenta[]) =>
  api.post<VentaPreview>("/t/ventas/preview", { sucursalId, canal: "pos", lineas });

/** Crea y cobra una venta en efectivo (POS). */
export const cobrarEfectivo = (sucursalId: string, lineas: LineaVenta[], montoTotal: string) =>
  api.post<VentaCreada>("/t/ventas", {
    sucursalId,
    canal: "pos",
    lineas,
    pagos: [{ metodo: "efectivo", monto: montoTotal }],
  });

// ---- Inventario ----

export interface InventarioItem {
  id: string;
  stockActual: string;
  stockMinimo: string;
  variante: {
    id: string;
    sku: string;
    nombreVariante: string | null;
    producto: { id: string; nombre: string; skuPadre: string };
  };
  sucursal: { id: string; codigo: string; nombre: string };
}

export type TipoAjuste = "ajuste_positivo" | "ajuste_negativo" | "merma" | "consumo_interno";

export const listInventario = (sucursalId?: string, soloBajos = false) => {
  const qs = new URLSearchParams({ pageSize: "80" });
  if (sucursalId) qs.set("sucursalId", sucursalId);
  if (soloBajos) qs.set("stockBajoMinimo", "true");
  return api.get<Paged<InventarioItem>>(`/t/inventario?${qs.toString()}`);
};

export const ajustarInventario = (input: {
  varianteId: string;
  sucursalId: string;
  tipo: TipoAjuste;
  cantidad: string;
  motivo: string;
}) => api.post<{ ok: boolean }>("/t/inventario/ajustes", input);

// ---- Pedidos (ecommerce) ----

export interface PedidoRow {
  id: string;
  folioPublico: string;
  cliente: { nombre: string } | null;
  metodoEnvio: string;
  statusPedido: string;
  statusPago: string;
  total: string;
  createdAt: string;
  statusLabel?: string;
}

export interface PedidoEvento {
  id: string;
  tipo: string;
  descripcion: string;
  createdAt: string;
}

export interface PedidoDetalle extends PedidoRow {
  subtotal: string;
  items: Array<{ nombre: string; cantidad: string; precioUnitario: string; subtotal: string }>;
  eventos: PedidoEvento[];
}

export interface ConfigEstados {
  estados: string[];
  etiquetas: Record<string, string>;
}

export const listPedidosEcom = (statusPedido?: string) => {
  const qs = statusPedido ? `?statusPedido=${encodeURIComponent(statusPedido)}` : "";
  return api.get<{ items: PedidoRow[] }>(`/t/pedidos-ecommerce${qs}`);
};

export const getConfigEstados = () => api.get<ConfigEstados>("/t/pedidos-ecommerce/config");

export const getPedidoDetalle = (id: string) =>
  api.get<PedidoDetalle>(`/t/pedidos-ecommerce/${id}`);

export const transicionarPedido = (id: string, nuevoEstado: string, motivo?: string) =>
  api.post<{ ok: boolean }>(`/t/pedidos-ecommerce/${id}/transicionar`, {
    nuevoEstado,
    ...(nuevoEstado === "cancelado" && motivo ? { motivo } : {}),
  });

// ---- Clientes (B2C) ----

export interface ClienteRow {
  id: string;
  tipo: string;
  isDefault: boolean;
  nombre: string;
  apellidos: string | null;
  emailPrincipal: string | null;
  telefonoPrincipal: string | null;
  rfc: string | null;
  _count?: { ventas: number };
}

export interface FiadoMovimiento {
  id: string;
  tipo: string;
  monto: string;
  createdAt: string;
}

export interface ClienteDetalle extends ClienteRow {
  fiado: { montoTotal: string; estado: string; movimientos: FiadoMovimiento[] } | null;
}

export const listClientes = (q: string) =>
  api.get<Paged<ClienteRow>>(`/t/clientes?pageSize=50&q=${encodeURIComponent(q)}`);

export const getClienteDetalle = (id: string) => api.get<ClienteDetalle>(`/t/clientes/${id}`);

// ---- Devoluciones (online) ----

export type MetodoReembolso =
  | "efectivo"
  | "tarjeta_misma"
  | "saldo_a_favor"
  | "vale"
  | "transferencia";

export interface Solicitud {
  id: string;
  folio: string;
  motivo: string;
  estado: string;
  createdAt: string;
  monto?: string | null;
  items: Array<{ nombre: string; cantidad: number }>;
  pedido: { folioPublico: string; emailComprador: string } | null;
  cliente: { nombre: string } | null;
}

export const listDevoluciones = (estado?: string) => {
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
  return api.get<Solicitud[]>(`/t/devoluciones-online${qs}`);
};

export const aprobarDevolucion = (id: string, metodoReembolso: MetodoReembolso) =>
  api.post<{ ok: boolean }>(`/t/devoluciones-online/${id}/aprobar`, { metodoReembolso });

export const rechazarDevolucion = (id: string, motivo: string) =>
  api.post<{ ok: boolean }>(`/t/devoluciones-online/${id}/rechazar`, { motivo });

// ---- Compras (órdenes de compra) ----

export interface OcLinea {
  id: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  cantidadRecibida: string;
}

export interface OcRow {
  id: string;
  folio: string;
  proveedorRazonSocial: string;
  proveedorRfc: string;
  estado: string;
  total: string;
  createdAt: string;
  lineas: OcLinea[];
}

export const listOrdenesCompra = (estado?: string) => {
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
  return api.get<{ items: OcRow[] }>(`/t/ordenes-compra${qs}`);
};

export const getOcDetalle = (id: string) => api.get<OcRow>(`/t/ordenes-compra/${id}`);

export const autorizarOc = (id: string) =>
  api.post<{ ok: boolean }>(`/t/ordenes-compra/${id}/autorizar`, {});

export const cancelarOc = (id: string, motivo: string) =>
  api.post<void>(`/t/ordenes-compra/${id}/cancelar`, { motivo });

/** Recibe todas las líneas pendientes (cantidad - ya recibida). */
export const recibirOcTodo = (id: string, lineas: OcLinea[]) => {
  const pend = lineas
    .map((l) => ({
      lineaId: l.id,
      cantidadRecibida: String(Number(l.cantidad) - Number(l.cantidadRecibida)),
    }))
    .filter((l) => Number(l.cantidadRecibida) > 0);
  return api.post<{ ok: boolean }>(`/t/ordenes-compra/${id}/recibir`, { lineas: pend });
};

// ---- Precios (listas) ----

export type TipoLista = "publico" | "mayoreo_nivel" | "cliente_individual";

export interface ListaResumen {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  _count?: { items: number };
}

export interface ListaItem {
  varianteId: string;
  precio: string;
  variante: { id: string; sku: string };
}

export interface ListaDetalle extends ListaResumen {
  items: ListaItem[];
}

export const listListasPrecios = () => api.get<ListaResumen[]>("/t/precios/listas");
export const getListaPrecios = (id: string) => api.get<ListaDetalle>(`/t/precios/listas/${id}`);
export const crearListaPrecios = (input: { codigo: string; nombre: string; tipo: TipoLista }) =>
  api.post<ListaResumen>("/t/precios/listas", input);

// ---- Promociones ----

export interface PromoItem {
  id: string;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  status: string;
  vigenciaInicio: string;
  vigenciaFin?: string | null;
  acciones?: { valor?: number } | null;
}

export type AccionPromo = "activar" | "pausar" | "archivar";

export const listPromociones = () => api.get<PromoItem[]>("/t/promociones");
export const cambiarEstadoPromo = (id: string, accion: AccionPromo) =>
  api.post<{ ok: boolean }>(`/t/promociones/${id}/${accion}`, {});

// ---- Monedero (gift cards) ----

export interface GiftCard {
  id: string;
  codigo: string;
  montoInicial: string;
  saldoActual: string;
  estado: string;
  createdAt: string;
}

export const listGiftCards = () => api.get<GiftCard[]>("/t/monedero/gift-cards");
export const emitirGiftCard = (monto: string) =>
  api.post<GiftCard>("/t/monedero/gift-cards", { monto });
export const cancelarGiftCard = (id: string) =>
  api.post<{ ok: boolean }>(`/t/monedero/gift-cards/${id}/cancelar`, {});

// ---- Comisiones (reglas) ----

export interface ReglaComision {
  id: string;
  nombre: string;
  base: string;
  pct: number;
  prioridad: number;
  isActive: boolean;
  categoria?: { id: string; nombre: string } | null;
  producto?: { id: string; nombre: string } | null;
}

export const listReglasComision = () => api.get<ReglaComision[]>("/t/comisiones/reglas");
export const eliminarReglaComision = (id: string) => api.del<void>(`/t/comisiones/reglas/${id}`);

// ---- CFDI / Facturación (emitidos) ----

export interface CfdiEmitido {
  id: string;
  serie: string | null;
  folio: string | null;
  folioFiscal: string | null;
  fechaEmision: string;
  rfcReceptor: string;
  razonSocialReceptor: string;
  total: string;
  estado: string;
  esAutofactura: boolean;
}

export type MotivoCancelacion = "02" | "03" | "04";

export const listCfdisEmitidos = (estado?: string) => {
  const qs = new URLSearchParams({ pageSize: "50" });
  if (estado) qs.set("estado", estado);
  return api.get<Paged<CfdiEmitido>>(`/t/cfdis?${qs.toString()}`);
};

export const cancelarCfdi = (id: string, motivo: MotivoCancelacion) =>
  api.post<{ ok: boolean }>(`/t/cfdis/${id}/cancelar`, { motivo });

// ---- Contabilidad (CFDIs recibidos + DIOT) ----

export interface CategoriaContable {
  id: string;
  codigoContable: string;
  nombre: string;
  tipo: string;
}

export interface CfdiRecibido {
  id: string;
  folio: string | null;
  emisorRfc: string;
  emisorRazonSocial: string;
  fechaEmision: string;
  total: string;
  estado: string;
  categorizacion?: {
    categoria?: { codigoContable: string; nombre: string } | null;
    fuente?: string | null;
  } | null;
}

export interface DiotReporte {
  periodoYyyymm: string;
  totalProveedores: number;
  totalIvaPagado: string;
}

export const listCfdisRecibidos = () =>
  api.get<{ items: CfdiRecibido[] }>("/t/cfdis-recibidos?pageSize=100");
export const listCategoriasContables = () =>
  api.get<CategoriaContable[]>("/t/cfdis-recibidos/categorias/contables");
export const categorizarCfdi = (id: string, categoriaContableId: string) =>
  api.post<{ ok: boolean }>(`/t/cfdis-recibidos/${id}/categorizar`, { categoriaContableId });
export const autoCategorizarCfdi = (id: string) =>
  api.post<{ ok: boolean }>(`/t/cfdis-recibidos/${id}/auto-categorizar`, {});
export const getDiot = (periodo: string) => api.get<DiotReporte>(`/t/diot/${periodo}`);

// ---- Usuarios y Roles ----

export interface RolRef {
  id: string;
  codigo: string;
  nombre: string;
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  isActive: boolean;
  roles: RolRef[];
}

export interface Rol {
  id: string;
  codigo: string;
  nombre: string;
  isActive: boolean;
  permisos: string[];
}

export const listUsuarios = () => api.get<Usuario[]>("/t/usuarios");
export const listRoles = () => api.get<Rol[]>("/t/roles");
export const setUsuarioActivo = (id: string, isActive: boolean) =>
  isActive
    ? api.patch<{ ok: boolean }>(`/t/usuarios/${id}`, { isActive: true })
    : api.del<void>(`/t/usuarios/${id}`);
export const asignarRol = (usuarioId: string, rolId: string) =>
  api.post<{ ok: boolean }>(`/t/usuarios/${usuarioId}/roles`, { rolId });
export const quitarRol = (usuarioId: string, rolId: string) =>
  api.del<void>(`/t/usuarios/${usuarioId}/roles/${rolId}`);

// ---- Seguridad (MFA/2FA del usuario actual) ----

export interface MfaEstado {
  enabled: boolean;
  backupCodesRestantes: number;
}

export const mfaEstado = () => api.get<MfaEstado>("/auth/tenant/mfa/estado");
export const mfaEnroll = () =>
  api.post<{ secret: string; otpauthUrl: string }>("/auth/tenant/mfa/enroll", {});
export const mfaEnrollConfirm = (code: string) =>
  api.post<{ backupCodes: string[] }>("/auth/tenant/mfa/enroll/confirm", { code });
export const mfaDisable = (password: string) =>
  api.post<{ ok: boolean }>("/auth/tenant/mfa/disable", { password });
export const mfaRegenerate = (code: string) =>
  api.post<{ backupCodes: string[] }>("/auth/tenant/mfa/backup-codes/regenerate", { code });

// ---- Configuración ----

export interface ConfigVentas {
  descuentoMaximoPct: number;
  recomendado: number;
}

export const getConfigVentas = () => api.get<ConfigVentas>("/t/config-ventas");
export const saveConfigVentas = (descuentoMaximoPct: number) =>
  api.put<ConfigVentas>("/t/config-ventas", { descuentoMaximoPct });

// ---- CxC (cuentas por cobrar) ----

export type MetodoPago =
  | "efectivo"
  | "tarjeta_debito"
  | "tarjeta_credito"
  | "transferencia"
  | "vale"
  | "otro";

export interface CxcItem {
  id: string;
  folio: string;
  estado: string;
  tipoOrigen: string;
  montoOriginal: string;
  montoPagado: string;
  interesAcumulado: string;
  fechaVencimiento: string;
  cliente?: { nombre: string; apellidos?: string | null } | null;
  clienteB2b?: { razonSocial: string } | null;
  venta?: { folio: string } | null;
}

export interface CxcPago {
  id: string;
  monto: string;
  metodo: string;
  createdAt: string;
}

export interface CxcDetalle extends CxcItem {
  pagos: CxcPago[];
}

export const cxcSaldo = (c: CxcItem) =>
  Number(c.montoOriginal) + Number(c.interesAcumulado) - Number(c.montoPagado);

export const listCxc = () => api.get<Paged<CxcItem>>("/t/cxc?pageSize=100");
export const getCxcDetalle = (id: string) => api.get<CxcDetalle>(`/t/cxc/${id}`);
export const registrarPagoCxc = (id: string, monto: string, metodo: MetodoPago) =>
  api.post<{ ok: boolean }>(`/t/cxc/${id}/pagos`, { monto, metodo });
export const condonarCxc = (id: string, motivo: string) =>
  api.post<{ ok: boolean }>(`/t/cxc/${id}/condonar`, { motivo });
export const incobrableCxc = (id: string, motivo: string) =>
  api.post<{ ok: boolean }>(`/t/cxc/${id}/incobrable`, { motivo });

// ---- Clientes B2B ----

export interface ClienteB2b {
  id: string;
  razonSocial: string;
  rfc: string;
  condicionesPago: string;
  diasCreditoDefault: number;
  emailPrincipal?: string | null;
}

export const listClientesB2b = (q: string) =>
  api.get<Paged<ClienteB2b>>(`/t/clientes-b2b?pageSize=100&q=${encodeURIComponent(q)}`);

// ---- Reseñas ----

export interface Resena {
  id: string;
  rating: number;
  titulo: string | null;
  comentario: string | null;
  estado: "pendiente" | "aprobada" | "rechazada";
  respuestaTienda: string | null;
  createdAt: string;
  productoPublicado: { tituloPublico: string };
  cliente: { nombre: string } | null;
}

export const listResenas = (estado?: string) => {
  const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
  return api.get<Resena[]>(`/t/resenas${qs}`);
};
export const moderarResena = (id: string, estado: "aprobada" | "rechazada") =>
  api.post<{ ok: boolean }>(`/t/resenas/${id}/moderar`, { estado });
export const responderResena = (id: string, respuesta: string) =>
  api.post<{ ok: boolean }>(`/t/resenas/${id}/responder`, { respuesta });

// ---- Preguntas ----

export interface Pregunta {
  id: string;
  pregunta: string;
  respuesta: string | null;
  estado: string;
  createdAt: string;
  productoPublicado: { tituloPublico: string } | null;
  cliente: { nombre: string } | null;
}

export const listPreguntas = () => api.get<Pregunta[]>("/t/preguntas");
export const responderPregunta = (id: string, respuesta: string) =>
  api.post<{ ok: boolean }>(`/t/preguntas/${id}/responder`, { respuesta });
export const rechazarPregunta = (id: string) =>
  api.post<{ ok: boolean }>(`/t/preguntas/${id}/rechazar`, {});

// ---- Envíos ----

export interface Zona {
  id: string;
  nombre: string;
  cpsIncluidos: string[];
  estadosIncluidos: string[];
}
export interface Tarifa {
  id: string;
  paqueteria: string;
  nombrePublico: string;
  tipoCalculo: string;
  montoFijo: string | null;
  montoMinimoEnvioGratis: string | null;
  diasEntregaEstimados: number | null;
  isActive: boolean;
}
export interface PickupRow {
  sucursal: { id: string; nombre: string };
  config: { activa: boolean; tiempoPreparacionPromedioMin: number } | null;
}

export const listZonas = () => api.get<Zona[]>("/t/envios/zonas");
export const listTarifas = () => api.get<Tarifa[]>("/t/envios/tarifas");
export const listPickup = () => api.get<PickupRow[]>("/t/envios/pickup");

// ---- Tienda (ecommerce config) ----

export interface ConfigTienda {
  activa?: boolean;
  subdominio?: string | null;
  dominioPropio?: string | null;
}

export const getEcommerceConfig = () => api.get<ConfigTienda>("/t/ecommerce/config");
export const saveEcommerceConfig = (cfg: ConfigTienda) =>
  api.put<ConfigTienda>("/t/ecommerce/config", cfg);
export const countProductosPublicados = () =>
  api.get<{ items: unknown[] }>("/t/ecommerce/productos-publicados");

// ---- Inventario Insights ----

export interface Insights {
  reordenar: Array<{ sku: string; nombre: string; stock: number; sugerenciaReorden: number }>;
  estancados: Array<{ sku: string; nombre: string; stock: number; valorInmovilizado: number }>;
  topVendidos: Array<{ sku: string; nombre: string; vendido: number; margenTotal: number }>;
}
export const getInventarioInsights = () => api.get<Insights>("/t/inventario-insights");

// ---- Automatizaciones (flows) ----

export interface EventoFlow {
  evento: string;
  label: string;
  usaDias: boolean;
}
export interface Flow {
  id: string;
  evento: string;
  campanaNombre: string;
  canal: string;
  dias: number | null;
  frecuenciaMax: number;
  isActive: boolean;
}
export const listFlows = () => api.get<Flow[]>("/t/campanas/flows");
export const listEventosFlow = () => api.get<EventoFlow[]>("/t/campanas/flows/eventos");
export const toggleFlow = (id: string, isActive: boolean) =>
  api.patch<{ ok: boolean }>(`/t/campanas/flows/${id}`, { isActive });
export const runFlows = () => api.post<{ encolados: number }>("/t/campanas/flows/run", {});

// ---- Guía de inicio (onboarding) ----

export interface Onboarding {
  pasos: Record<string, boolean>;
}
export const getOnboarding = () => api.get<Onboarding>("/t/onboarding");

// ---- Suscripción (billing) ----

export interface BillingContext {
  tenant: {
    slug: string;
    name: string;
    status: string;
    plan: { code: string; name: string; priceMonthly: string };
  };
  subscription: {
    id: string;
    status: string;
    interval: string;
    currentPeriodEnd: string | null;
  } | null;
}
export interface Invoice {
  id: string;
  folio: string;
  status: string;
  total: string;
  currency: string;
  createdAt: string;
}
export const getBillingMe = () => api.get<BillingContext>("/billing/me");
export const listInvoices = () => api.get<Invoice[]>("/billing/invoices");

// ---- Dominio B2B ----

export interface DominioB2b {
  host: string;
  verificado: boolean;
}
export const getB2bDominios = () => api.get<{ dominios: DominioB2b[] }>("/t/b2b-dominio");

// ---- Importador (carga masiva CSV) ----

export interface FilaProducto {
  skuPadre: string;
  nombre: string;
  precioBase: string;
  stockInicial?: string;
}
export interface FilaPrecio {
  sku: string;
  precioBase: string;
}
export interface BulkResultado {
  creados?: number;
  actualizados?: number;
  errores?: number;
}

export const importarProductos = (filas: FilaProducto[]) =>
  api.post<BulkResultado>("/t/productos/bulk", { filas });
export const importarPrecios = (filas: FilaPrecio[]) =>
  api.post<BulkResultado>("/t/productos/bulk-precios", { filas });
