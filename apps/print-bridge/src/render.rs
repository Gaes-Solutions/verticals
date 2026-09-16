use crate::types::Ticket;
// Printable ASCII is supported by every ESC/POS model; strip all control bytes
// (including escape sequences) from catalog, customer and fiscal fields.
fn clean(value: &str) -> String {
    value.chars().map(|c| match c {
        'á' | 'Á' => 'a', 'é' | 'É' => 'e', 'í' | 'Í' => 'i',
        'ó' | 'Ó' => 'o', 'ú' | 'Ú' | 'ü' | 'Ü' => 'u', 'ñ' | 'Ñ' => 'n',
        c if c.is_ascii() && !c.is_ascii_control() => c,
        _ => ' ',
    }).collect()
}
fn line(out: &mut String, value: &str, columns: usize) {
    let text = clean(value);
    if text.is_empty() { out.push('\n'); }
    for chunk in text.as_bytes().chunks(columns) {
        out.push_str(std::str::from_utf8(chunk).unwrap()); out.push('\n');
    }
}
pub fn render(ticket: &Ticket, columns: usize, cut: bool) -> Result<Vec<u8>, &'static str> {
    if columns != 32 && columns != 48 { return Err("Ancho no admitido"); }
    let mut text = String::new();
    let mut add = |s: &str| line(&mut text, s, columns);
    match ticket {
        Ticket::Venta(v) => {
            if v.lineas.is_empty() || v.lineas.len() > 500 { return Err("Cantidad de lineas invalida"); }
            add(v.emisor.razon_social.as_deref().unwrap_or("GaesSoft"));
            add(&v.emisor.sucursal.nombre);
            if let Some(rfc) = &v.emisor.rfc { add(rfc); }
            if v.venta.estado != "cobrada" { add(&format!("ESTADO: {}", v.venta.estado)); add("NO COMPROBANTE DE PAGO"); }
            add(&format!("Venta {}", v.venta.folio)); add(&v.venta.fecha);
            add(&format!("Cajero: {}", v.venta.cajero));
            if let Some(caja) = &v.emisor.caja { add(&format!("Caja: {}", caja.codigo)); }
            if let Some(cliente) = &v.venta.cliente { add(&format!("Cliente: {cliente}")); }
            add(&"-".repeat(columns));
            for item in &v.lineas {
                add(&item.descripcion); add(&format!("{} x {} = {}", item.cantidad, item.precio_unitario, item.subtotal));
            }
            add(&"-".repeat(columns));
            add(&format!("Subtotal: {}", v.totales.subtotal));
            add(&format!("Descuento: {}", v.totales.descuento_total));
            add(&format!("IVA incluido: {}", v.totales.iva_total));
            add(&format!("IEPS incluido: {}", v.totales.ieps_total));
            add(&format!("TOTAL {} {}", v.totales.total, v.venta.moneda));
            for pago in &v.pagos { add(&format!("{}: {}", pago.metodo, pago.monto)); }
            add(&format!("Cambio: {}", v.totales.cambio_dado));
            if let Some(cfdi) = &v.cfdi { add("Folio fiscal:"); add(&cfdi.folio_fiscal); }
            if let Some(auto) = &v.autofactura { add("Autofacturacion:"); add(&auto.url_portal); add(&format!("Vence: {}", auto.expira_at)); }
        }
        Ticket::Corte(c) => {
            add(&c.emisor.sucursal.nombre); add(&format!("Caja: {}", c.emisor.caja.codigo));
            add(&format!("Corte {} #{}", c.corte.tipo, c.corte.numero)); add(&c.generado_at);
            add(&format!("Cajero: {}", c.corte.cajero));
            add(&format!("Ventas: {} Total: {}", c.ventas.count, c.ventas.total));
            add(&format!("Canceladas: {}", c.ventas.canceladas));
            add(&format!("Entradas: {}", c.desglose_movimientos.entradas));
            add(&format!("Salidas: {}", c.desglose_movimientos.salidas));
            add(&format!("Esperado: {}", c.efectivo.esperado));
            add(&format!("Contado: {}", c.efectivo.contado));
            add(&format!("Diferencia: {}", c.efectivo.diferencia));
            if let Some(rows) = c.desglose_por_metodo.as_object() { for (method, amount) in rows { add(&format!("{}: {}", method, amount)); } }
            if let Some(notes) = &c.observaciones { add(notes); }
        }
    }
    if text.len() > 128 * 1024 { return Err("Ticket demasiado grande"); }
    let mut bytes = vec![0x1b, b'@']; bytes.extend(text.as_bytes()); bytes.extend(b"\n\n\n");
    if cut { bytes.extend([0x1d, b'V', 0]); }
    Ok(bytes)
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn removes_command_injection() { assert_eq!(clean("Cafe\u{1b}@\nñ"), "Cafe @ n"); }
    #[test] fn wraps_at_printer_width() { let mut s = String::new(); line(&mut s, &"a".repeat(65), 32); assert_eq!(s.lines().map(str::len).collect::<Vec<_>>(), vec![32,32,1]); }
}
