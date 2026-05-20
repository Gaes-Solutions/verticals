use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Ticket {
    Venta(TicketVenta),
    Corte(TicketCorte),
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TicketVenta {
    pub generado_at: String,
    pub emisor: Emisor,
    pub venta: VentaInfo,
    pub lineas: Vec<Linea>,
    pub pagos: Vec<Pago>,
    pub totales: Totales,
    pub cfdi: Option<CfdiInfo>,
    pub autofactura: Option<Autofactura>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TicketCorte {
    pub generado_at: String,
    pub emisor: EmisorCorte,
    pub corte: CorteInfo,
    pub ventas: VentasResumen,
    pub desglose_por_metodo: serde_json::Value,
    pub desglose_movimientos: DesgloseMov,
    pub efectivo: Efectivo,
    pub denominaciones: serde_json::Value,
    pub observaciones: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Emisor {
    pub rfc: Option<String>,
    pub razon_social: Option<String>,
    pub sucursal: SucursalInfo,
    pub caja: Option<CajaInfo>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct EmisorCorte {
    pub sucursal: SucursalInfo,
    pub caja: CajaInfo,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SucursalInfo {
    pub codigo: String,
    pub nombre: String,
    pub telefono: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CajaInfo {
    pub codigo: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct VentaInfo {
    pub folio: String,
    pub fecha: String,
    pub cajero: String,
    pub cliente: Option<String>,
    pub moneda: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Linea {
    pub numero: u32,
    pub sku: String,
    pub descripcion: String,
    pub cantidad: String,
    pub precio_unitario: String,
    pub subtotal: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Pago {
    pub metodo: String,
    pub monto: String,
    pub ultimos_cuatro: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Totales {
    pub subtotal: String,
    pub descuento_total: String,
    pub iva_total: String,
    pub total: String,
    pub total_cobrado: String,
    pub cambio_dado: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CfdiInfo {
    pub folio_fiscal: String,
    pub fecha_timbrado: String,
    pub rfc_receptor: String,
    pub razon_social_receptor: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Autofactura {
    pub url_portal: String,
    pub expira_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CorteInfo {
    pub tipo: String,
    pub numero: u32,
    pub cajero: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct VentasResumen {
    pub count: u32,
    pub canceladas: u32,
    pub total: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DesgloseMov {
    pub entradas: String,
    pub salidas: String,
    pub neto: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Efectivo {
    pub esperado: String,
    pub contado: String,
    pub diferencia: String,
}
