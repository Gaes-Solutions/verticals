"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface ItemPedido {
  varianteId: string;
  nombre: string;
  cantidad: number;
}

const MOTIVOS: Array<{ value: string; label: string }> = [
  { value: "defectuoso", label: "Llegó defectuoso" },
  { value: "talla_color", label: "Talla o color incorrecto" },
  { value: "cambio_opinion", label: "Cambié de opinión" },
  { value: "error_cobro", label: "Error en el cobro" },
  { value: "garantia", label: "Garantía" },
  { value: "otro", label: "Otro" },
];

const ESTADO_LABEL: Record<string, string> = {
  solicitada: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

/** Botón + modal para que el cliente solicite la devolución de su pedido. */
export function SolicitarDevolucion({
  folio,
  items,
  devolible,
  solicitudExistente,
}: {
  folio: string;
  items: ItemPedido[];
  devolible: boolean;
  solicitudExistente: { estado: string; rechazoMotivo: string | null } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("defectuoso");
  const [descripcion, setDescripcion] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (solicitudExistente) {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm">
        <span className="font-medium">Devolución:</span>{" "}
        {ESTADO_LABEL[solicitudExistente.estado] ?? solicitudExistente.estado}
        {solicitudExistente.rechazoMotivo ? ` — ${solicitudExistente.rechazoMotivo}` : ""}
      </div>
    );
  }
  if (!devolible) return null;

  async function enviar() {
    const seleccion = items
      .map((it) => ({ ...it, cantidad: cantidades[it.varianteId] ?? 0 }))
      .filter((it) => it.cantidad > 0);
    if (!seleccion.length) {
      setError("Selecciona al menos un artículo y su cantidad");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/cuenta/pedidos/${folio}/devoluciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motivo,
        descripcion: descripcion || undefined,
        items: seleccion.map((it) => ({
          varianteId: it.varianteId,
          nombre: it.nombre,
          cantidad: it.cantidad,
        })),
      }),
    });
    setEnviando(false);
    if (res.status === 401) {
      router.push("/cuenta/login");
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "No se pudo enviar la solicitud");
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
        className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 text-sm hover:border-marca hover:text-marca"
      >
        ↩️ Solicitar devolución
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6">
            <div className="mb-3 flex items-start justify-between">
              <h2 className="font-bold text-lg">Solicitar devolución</h2>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <p className="mb-1 font-medium text-gray-700 text-sm">Motivo</p>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {MOTIVOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            <p className="mb-2 font-medium text-gray-700 text-sm">¿Qué artículos devuelves?</p>
            <div className="mb-4 space-y-2">
              {items.map((it) => (
                <div
                  key={it.varianteId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex-1">{it.nombre}</span>
                  <input
                    type="number"
                    min={0}
                    max={it.cantidad}
                    value={cantidades[it.varianteId] ?? 0}
                    onChange={(e) =>
                      setCantidades((c) => ({
                        ...c,
                        [it.varianteId]: Math.max(0, Math.min(it.cantidad, Number(e.target.value))),
                      }))
                    }
                    className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-center"
                  />
                  <span className="text-gray-400">/ {it.cantidad}</span>
                </div>
              ))}
            </div>

            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Cuéntanos qué pasó (opcional)"
              rows={3}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />

            {error && <p className="mb-3 text-red-600 text-sm">{error}</p>}
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="w-full rounded-lg bg-marca py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
