import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";

/** Renderiza un código de barras Code128 (escaneable) del valor dado. */
export function Barcode({ value, height = 40 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width: 1.6,
        fontSize: 12,
        margin: 4,
        displayValue: true,
      });
    } catch {
      // valor no codificable: se ignora (el SKU siempre es Code128-válido)
    }
  }, [value, height]);

  return <svg ref={ref} className="max-w-full" aria-label={`Código de barras ${value}`} />;
}
