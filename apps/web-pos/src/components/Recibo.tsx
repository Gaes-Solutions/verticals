import type { Session } from "../App.js";
import type { VentaDetalle } from "../lib/types.js";

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta_debito: "Débito",
  tarjeta_credito: "Crédito",
  transferencia: "Transferencia",
};

/**
 * Recibo de 58mm imprimible. Oculto en pantalla (.recibo-print), aparece solo
 * en `window.print()` vía CSS @media print. Sirve para impresora térmica o PDF.
 */
export function Recibo({ session, venta }: { session: Session; venta: VentaDetalle }) {
  const cambio = venta.cambio ? Number.parseFloat(venta.cambio) : 0;
  return (
    <div className="recibo-print">
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <strong>{session.sucursal.nombre}</strong>
        <br />
        GaesSoft POS
      </div>
      <div>Folio: {venta.folio}</div>
      <div>Caja: {session.caja?.codigo ?? "—"}</div>
      <div>Atendió: {session.cajeroNombre}</div>
      <div>{"-".repeat(32)}</div>
      {venta.lineas.map((l) => (
        <div key={l.numero} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            {l.cantidad}× {l.descripcion}
          </span>
          <span>${Number.parseFloat(l.total).toFixed(2)}</span>
        </div>
      ))}
      <div>{"-".repeat(32)}</div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Subtotal</span>
        <span>${Number.parseFloat(venta.subtotal).toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>IVA</span>
        <span>${Number.parseFloat(venta.impuestos).toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
        <span>TOTAL</span>
        <span>${Number.parseFloat(venta.total).toFixed(2)}</span>
      </div>
      <div>{"-".repeat(32)}</div>
      {venta.pagos.map((p, i) => (
        <div key={`${p.metodo}-${i}`} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{METODO_LABEL[p.metodo] ?? p.metodo}</span>
          <span>${Number.parseFloat(p.monto).toFixed(2)}</span>
        </div>
      ))}
      {cambio > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Cambio</span>
          <span>${cambio.toFixed(2)}</span>
        </div>
      )}
      <div style={{ textAlign: "center", marginTop: 10 }}>¡Gracias por su compra!</div>
    </div>
  );
}
