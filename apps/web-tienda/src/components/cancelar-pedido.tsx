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
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-red-300 px-4 py-2 font-medium text-red-600 text-sm hover:bg-red-50"
      >
        Cancelar compra
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6">
            <h2 className="mb-1 font-bold text-lg">Cancelar compra</h2>
            <p className="mb-4 text-gray-500 text-sm">
              Si ya pagaste, te reembolsaremos. Solo se puede cancelar antes de que se envíe.
            </p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="¿Por qué cancelas?"
              rows={3}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-600 text-sm"
              >
                No, conservar
              </button>
              <button
                type="button"
                onClick={cancelar}
                disabled={enviando}
                className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-sm text-white hover:bg-red-700 disabled:opacity-50"
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
