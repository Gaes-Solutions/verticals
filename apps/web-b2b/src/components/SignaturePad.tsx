import { useRef, useState } from "react";
import { Modal } from "./Modal.js";

// slate-900: Tailwind no expone tokens de color a JS, se fija el hex del token.
const TINTA_TRAZO = "#0f172a";

/**
 * Captura de firma manuscrita en canvas (mouse/touch vía Pointer Events).
 * Devuelve la firma como data URL PNG al confirmar.
 */
export function SignaturePad({
  titulo,
  onConfirm,
  onCancel,
  procesando,
}: {
  titulo: string;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
  procesando: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(false);

  function pos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    dibujando.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = TINTA_TRAZO;
    ctx.stroke();
    setTieneTrazo(true);
  }

  function fin() {
    dibujando.current = false;
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
  }

  function confirmar() {
    const canvas = canvasRef.current;
    if (!canvas || !tieneTrazo) return;
    onConfirm(canvas.toDataURL("image/png"));
  }

  return (
    <Modal onClose={onCancel}>
      <h2 className="mb-1 text-lg font-bold text-slate-800">Firma de aceptación</h2>
      <p className="mb-3 text-sm text-slate-500">{titulo}</p>
      <div className="rounded-lg border border-slate-300">
        <canvas
          ref={canvasRef}
          width={440}
          height={180}
          onPointerDown={inicio}
          onPointerMove={mover}
          onPointerUp={fin}
          onPointerLeave={fin}
          aria-label="Área de firma"
          className="h-[180px] w-full touch-none rounded-lg bg-slate-50"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={limpiar} className="gx-btn-ghost">
          Limpiar
        </button>
        <span className="text-xs text-slate-500">Firma con el dedo o el mouse</span>
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onCancel} disabled={procesando} className="gx-btn-ghost flex-1">
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={!tieneTrazo || procesando}
          className="gx-btn-primary flex-1"
        >
          {procesando ? "Aceptando…" : "Firmar y aceptar"}
        </button>
      </div>
    </Modal>
  );
}
