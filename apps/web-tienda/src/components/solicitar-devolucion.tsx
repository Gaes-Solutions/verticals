"use client";

import { useAccionPedido } from "@/lib/use-accion-pedido";
import { type FormEvent, useState } from "react";
import { DialogoTienda } from "./dialogo-tienda";

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
interface PropsDevolucion {
  folio: string;
  items: ItemPedido[];
  devolible: boolean;
  solicitudExistente: { estado: string; rechazoMotivo: string | null } | null;
}
export function SolicitarDevolucion(props: PropsDevolucion) {
  return <FormularioDevolucion key={props.folio} {...props} />;
}
function FormularioDevolucion({ folio, items, devolible, solicitudExistente }: PropsDevolucion) {
  const accion = useAccionPedido(folio, "devoluciones");
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("defectuoso");
  const [descripcion, setDescripcion] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (accion.confirmacion)
    return <output className="gx-card block !p-4 text-sm">{accion.confirmacion}</output>;
  if (solicitudExistente) {
    return (
      <div className="gx-card !p-4 text-sm">
        <span className="font-medium">Devolución:</span>{" "}
        {ESTADO_LABEL[solicitudExistente.estado] ?? solicitudExistente.estado}
        {solicitudExistente.rechazoMotivo ? ` — ${solicitudExistente.rechazoMotivo}` : ""}
      </div>
    );
  }
  if (!devolible) return null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (accion.ocupado) return;
    if (
      items.some((it) => {
        const n = Number(cantidades[it.varianteId] ?? 0);
        return !Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > it.cantidad;
      })
    ) {
      setError("Revisa las cantidades: usa números enteros sin superar lo comprado.");
      return;
    }
    const seleccion = items
      .map((it) => ({ ...it, cantidad: Number(cantidades[it.varianteId] ?? 0) }))
      .filter((it) => it.cantidad > 0);
    if (!seleccion.length) {
      setError("Selecciona al menos un artículo y su cantidad");
      return;
    }
    setError(null);
    await accion.enviar({
      motivo,
      ...(descripcion ? { descripcion } : {}),
      items: seleccion.map((it) => ({
        varianteId: it.varianteId,
        nombre: it.nombre,
        cantidad: it.cantidad,
      })),
    });
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="gx-btn-secondary min-h-11">
        ↩️ Solicitar devolución
      </button>

      {abierto && (
        <DialogoTienda
          titulo="Solicitar devolución"
          bloqueado={accion.ocupado}
          onCerrar={() => setAbierto(false)}
        >
          <form onSubmit={enviar} noValidate>
            <p className="mb-4 text-sm text-slate-600">
              La tienda revisará tu solicitud. Enviarla todavía no confirma un reembolso.
            </p>
            <label className="mb-4 block">
              <span className="gx-label">Motivo</span>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={accion.ocupado}
                className="gx-input min-h-11"
              >
                {MOTIVOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <p className="mb-2 font-medium text-slate-700 text-sm">¿Qué artículos devuelves?</p>
            <div className="mb-4 space-y-2">
              {items.map((it) => (
                <div
                  key={it.varianteId}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 flex-1 break-words">{it.nombre}</span>
                  <input
                    type="number"
                    aria-label={`Cantidad a devolver de ${it.nombre}`}
                    step={1}
                    min={0}
                    max={it.cantidad}
                    value={cantidades[it.varianteId] ?? "0"}
                    onChange={(e) =>
                      setCantidades((c) => ({
                        ...c,
                        [it.varianteId]: e.target.value,
                      }))
                    }
                    disabled={accion.ocupado}
                    className="gx-input min-h-11 w-16 shrink-0 !px-2 text-center"
                  />
                  <span className="text-slate-400">/ {it.cantidad}</span>
                </div>
              ))}
            </div>

            <textarea
              disabled={accion.ocupado}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              aria-label="Detalle de la devolución"
              maxLength={1000}
              placeholder="Cuéntanos qué pasó (opcional)"
              rows={3}
              className="gx-input mb-4"
            />

            {(error || accion.error) && (
              <p role="alert" className="mb-3 text-danger text-sm">
                {error || accion.error}
              </p>
            )}
            {(accion.requiereConsulta || accion.bloqueada) && (
              <button
                type="button"
                disabled={accion.ocupado}
                onClick={() => void accion.consultar()}
                className="gx-btn-secondary mb-3 min-h-11 w-full"
              >
                Consultar estado de devolución
              </button>
            )}
            <button
              type="submit"
              disabled={accion.ocupado || accion.requiereConsulta || accion.bloqueada}
              className="gx-btn-primary min-h-11 w-full"
            >
              {accion.ocupado ? "Comprobando…" : "Enviar solicitud"}
            </button>
          </form>
        </DialogoTienda>
      )}
    </>
  );
}
