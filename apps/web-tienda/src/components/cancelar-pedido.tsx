"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DialogoTienda } from "./dialogo-tienda";

/** Botón para que el cliente cancele su compra (antes de que se envíe). */
export function CancelarPedido({ folio }: { folio: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelar() {
    if (enviando) return;
    if (motivo.trim().length < 3) {
      setError("Cuéntanos por qué cancelas");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cuenta/pedidos/${folio}/cancelar`, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      if (res.status === 401) {
        setError(
          "Tu sesión venció. Inicia sesión en otra pestaña y consulta el estado antes de continuar.",
        );
        return;
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string };
        setError(d.message ?? "No se pudo cancelar");
        return;
      }
      setAbierto(false);
      router.refresh();
    } catch {
      setError(
        "No pudimos confirmar la cancelación. Consulta el estado del pedido antes de reintentar.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="gx-btn-danger">
        Cancelar compra
      </button>

      {abierto && (
        <DialogoTienda
          titulo="Cancelar compra"
          bloqueado={enviando}
          onCerrar={() => setAbierto(false)}
        >
          <p className="mb-4 text-slate-500 text-sm">
            Confirma la cancelación de este pedido. Si hay un pago en proceso o confirmado, la
            tienda debe revisar el cobro y el reembolso.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-label="Motivo de cancelación"
            placeholder="¿Por qué cancelas?"
            maxLength={500}
            rows={3}
            className="gx-input mb-4"
          />
          {error && (
            <div className="mb-3 text-sm">
              <p role="alert" className="text-danger">
                {error}
              </p>
              <button
                type="button"
                className="mt-2 text-marca underline"
                onClick={() => {
                  setAbierto(false);
                  router.refresh();
                }}
              >
                Consultar estado del pedido
              </button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => setAbierto(false)}
              className="gx-btn-secondary"
            >
              No, conservar
            </button>
            <button type="button" onClick={cancelar} disabled={enviando} className="gx-btn-danger">
              {enviando ? "Cancelando…" : "Sí, cancelar"}
            </button>
          </div>
        </DialogoTienda>
      )}
    </>
  );
}
