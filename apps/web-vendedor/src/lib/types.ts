export interface ConfigVendedores {
  geocheckinActivo: boolean;
  rankingActivo: boolean;
  firmaPedidoModo: "off" | "sugerida" | "obligatoria";
  metaMensualDefault: string | null;
  bonosEscalonados: Array<{ desdePct: number; bonoPct: number }>;
}

export interface ResumenComisiones {
  periodo: string;
  meta: string | null;
  vendido: string;
  progresoPct: number | null;
  comisionPendiente: string;
  comisionPagada: string;
  comisionCancelada: string;
  bonoEstimado: string;
  totalEstimado: string;
}

export interface VisitaHoy {
  id: string;
  tipo: "visita" | "llamada";
  estado: "planeada" | "hecha" | "cancelada";
  fechaPlaneada: string;
  checkinAt: string | null;
  notas: string | null;
  resultado: string | null;
  clienteB2b: {
    id: string;
    razonSocial: string;
    nombreComercial: string | null;
    telefonoPrincipal: string | null;
  };
}

export interface Dashboard {
  resumen: ResumenComisiones;
  config: ConfigVendedores;
  visitasHoy: VisitaHoy[];
  pendientes: {
    cotizacionesVigentes: number;
    pedidosPorConfirmar: number;
    cxcPorCobrar: { cuentas: number; saldo: string };
  };
}

export interface MiCliente {
  id: string;
  razonSocial: string;
  nombreComercial: string | null;
  rfc: string;
  telefonoPrincipal: string | null;
  emailPrincipal: string | null;
  diasCreditoDefault: number;
  ultimaVisitaAt: string | null;
  pedidosMes: number;
  montoMes: string;
  ultimoPedidoAt: string | null;
}

export interface ClienteDetalle {
  cliente: {
    id: string;
    razonSocial: string;
    nombreComercial: string | null;
    rfc: string;
    telefonoPrincipal: string | null;
    emailPrincipal: string | null;
    diasCreditoDefault: number;
    notas: string | null;
    listaPrecioPrincipalCodigo: string | null;
    direcciones: Array<{ id: string; calle?: string | null; ciudad?: string | null }>;
  };
  credito: {
    lineaAutorizada: string;
    saldoCxcAbiertas: string;
    disponible: string;
    diasCredito: number;
  } | null;
  visitas: Array<{
    id: string;
    tipo: string;
    estado: string;
    fechaPlaneada: string;
    checkinAt: string | null;
    notas: string | null;
    resultado: string | null;
  }>;
  pedidos: Array<{ id: string; folio: string; estado: string; total: string; createdAt: string }>;
  cotizaciones: Array<{
    id: string;
    folio: string;
    estado: string;
    total: string;
    fechaVencimiento: string;
  }>;
}

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  skuPadre: string;
  variantes: Array<{
    id: string;
    sku: string;
    nombreVariante: string | null;
    precioBase: string;
  }>;
}

export interface LineaCarrito {
  varianteId: string;
  sku: string;
  nombre: string;
  cantidad: string;
  precioBase: string;
}

export interface PreviewTicket {
  subtotal: string;
  total: string;
  lineas: Array<{
    productoVarianteId: string;
    cantidad: string;
    precioUnitario: string;
    subtotal: string;
  }>;
}

export interface Comision {
  id: string;
  base: "venta" | "cobro";
  periodo: string;
  montoBase: string;
  pct: string;
  monto: string;
  estado: "pendiente" | "pagada" | "cancelada";
  createdAt: string;
  regla: { nombre: string } | null;
  venta: { folio: string } | null;
  pedido: { folio: string } | null;
}

export interface RankingEntry {
  vendedorId: string;
  nombre: string;
  vendido: string;
  posicion: number;
}
