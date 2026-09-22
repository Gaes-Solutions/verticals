export { calcularLinea, calcularTicket } from "./calculate.js";
export { aplicarPromocionesATicket, promoAplicaContexto } from "./promociones.js";
export {
  PricingError,
  calcularImpuestosLinea,
  calcularLineasDeVenta,
  comprobanteDeLineas,
  totalesDeVenta,
} from "./venta-lineas.js";
export type { LineaCalculo, LineaComprobante, VarianteSnapshot } from "./venta-lineas.js";
export type {
  PromoContexto,
  PromoEvaluable,
  PromocionAplicada,
  ResultadoPromos,
} from "./promociones.js";
export type {
  AccionTipo,
  CalcularLineaContexto,
  CalcularTicketInput,
  CuponInput,
  DecimalLike,
  DescuentoAplicado,
  DescuentoGlobalInput,
  LineaCalculada,
  LineaPrecioInput,
  ListaPrecioItemInput,
  PrecioEscalonadoInput,
  ReglaAccion,
  ReglaCondicion,
  ReglaPrecioInput,
  ReglaTipo,
  TicketCalculado,
} from "./types.js";
export { TicketLocalError, calcularVentaLocal } from "./venta-local.js";
export type {
  CatalogoLocal,
  EscalonadoCatalogo,
  ItemListaCatalogo,
  ListaPrecioCatalogo,
  ProductoCatalogo,
  PromocionCatalogo,
  ReglaCatalogo,
  VarianteCatalogo,
  VentaLocalCalculada,
  VentaLocalInput,
} from "./venta-local.js";
