"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Botón para que el cliente cancele su compra (antes de que se envíe). */
export function CancelarPedido({ folio }: { folio: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancelar() {
    if (motivo.trim().length < 3) {
      setError("Cuéntanos por qué cancelas");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/cuenta/pedidos/${folio}/cancelar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: motivo.trim() }),
    });
    setEnviando(false);
    if (res.status === 401) {
      router.push("/cuenta/login");
      return;
    }
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { message?: string };
      setError(d.message ?? "No se pudo cancelar");
      return;
    }
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="gx-btn-danger">
        Cancelar compra
      </button>

      {abierto && (
        <div className="gx-modal-overlay">
          <div className="gx-modal-panel">
            <h2 className="mb-1 font-bold text-lg">Cancelar compra</h2>
            <p className="mb-4 text-slate-500 text-sm">
              Si ya pagaste, te reembolsaremos. Solo se puede cancelar antes de que se envíe.
            </p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="¿Por qué cancelas?"
              rows={3}
              className="gx-input mb-4"
            />
            {error && <p className="mb-3 text-danger text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="gx-btn-secondary">
                No, conservar
              </button>
              <button
                type="button"
                onClick={cancelar}
                disabled={enviando}
                className="gx-btn-danger"
              >
                {enviando ? "Cancelando…" : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
