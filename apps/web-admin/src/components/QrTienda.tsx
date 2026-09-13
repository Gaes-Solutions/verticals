import { Download, ExternalLink, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef } from "react";

/**
 * El QR del mostrador. El dueño no debería tener que hacerlo en otro lado: lo
 * descarga aquí, lo imprime y lo pega junto a la caja. El comprador lo escanea
 * y cae en el catálogo de ESTA tienda, con su nombre y su icono.
 */
export function QrTienda({
  url,
  nombre,
  abierta,
}: {
  url: string | null;
  nombre: string;
  abierta: boolean;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);

  if (!url) {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-600 text-sm">
        <p className="flex items-center gap-2 font-medium text-slate-700">
          <QrCode size={16} /> QR de tu tienda
        </p>
        <p className="mt-1">
          Tu tienda todavía no tiene una dirección pública. En cuanto la plataforma la active, aquí
          aparece el código para imprimir.
        </p>
      </div>
    );
  }

  function descargar() {
    const canvas = lienzo.current;
    if (!canvas) return;
    const enlace = document.createElement("a");
    enlace.href = canvas.toDataURL("image/png");
    enlace.download = `qr-${
      nombre
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-") || "tienda"
    }.png`;
    enlace.click();
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-4">
      <p className="flex items-center gap-2 font-medium text-slate-700 text-sm">
        <QrCode size={16} /> QR de tu tienda
      </p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="self-start rounded-lg bg-white p-2 shadow-card">
          {/* Se dibuja grande para que impreso siga leyéndose; se muestra chico. */}
          <QRCodeCanvas
            ref={lienzo}
            value={url}
            size={1024}
            marginSize={2}
            level="M"
            style={{ width: 160, height: 160 }}
          />
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <p className="text-slate-600">
            Imprímelo y pégalo en el mostrador. Quien lo escanee verá tu catálogo y podrá guardar tu
            tienda en su pantalla de inicio.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 break-all text-brand hover:underline"
          >
            {url} <ExternalLink size={14} className="shrink-0" />
          </a>
          {!abierta && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
              Tu tienda todavía no está abierta: quien escanee el código verá "Abriremos pronto"
              hasta que esté encendida y tenga al menos un producto publicado.
            </p>
          )}
          <button type="button" onClick={descargar} className="gx-btn-secondary">
            <Download size={16} /> Descargar QR para imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
