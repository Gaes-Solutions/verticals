"use client";
import { useAccionPedido } from "@/lib/use-accion-pedido";
import { type FormEvent, useState } from "react";
import { DialogoTienda } from "./dialogo-tienda";
export function CancelarPedido({ folio }: { folio: string }) {
  return <CancelarCompra key={folio} folio={folio} />;
}
function CancelarCompra({ folio }: { folio: string }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const accion = useAccionPedido(folio, "cancelar");
  async function cancelar(e: FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 3) {
      setErrorLocal("Cuéntanos por qué cancelas (al menos 3 caracteres).");
      return;
    }
    setErrorLocal(null);
    await accion.enviar({ motivo: motivo.trim() });
  }
  if (accion.confirmacion)
    return <output className="gx-card block !p-4 text-sm">{accion.confirmacion}</output>;
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="gx-btn-danger min-h-11">
        Cancelar compra
      </button>
      {abierto && (
        <DialogoTienda
          titulo="Cancelar compra"
          bloqueado={accion.ocupado}
          onCerrar={() => setAbierto(false)}
        >
          <form onSubmit={cancelar}>
            <p className="mb-4 text-slate-600 text-sm">
              Confirma la cancelación de este pedido. Si hay un pago en proceso o confirmado, la
              tienda debe revisar el cobro y el reembolso.
            </p>
            <textarea
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setErrorLocal(null);
              }}
              disabled={accion.ocupado}
              aria-label="Motivo de cancelación"
              placeholder="¿Por qué cancelas?"
              maxLength={500}
              rows={3}
              className="gx-input mb-4"
            />
            {(errorLocal || accion.error) && (
              <p role="alert" className="mb-3 text-danger text-sm">
                {errorLocal || accion.error}
              </p>
            )}
            {(accion.requiereConsulta || accion.bloqueada) && (
              <button
                type="button"
                className="gx-btn-secondary mb-3 min-h-11 w-full"
                disabled={accion.ocupado}
                onClick={() => void accion.consultar()}
              >
                Consultar estado de cancelación
              </button>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={accion.ocupado}
                onClick={() => setAbierto(false)}
                className="gx-btn-secondary min-h-11"
              >
                No, conservar
              </button>
              <button
                type="submit"
                disabled={accion.ocupado || accion.requiereConsulta || accion.bloqueada}
                className="gx-btn-danger min-h-11"
              >
                {accion.ocupado ? "Comprobando…" : "Sí, cancelar"}
              </button>
            </div>
          </form>
        </DialogoTienda>
      )}
    </>
  );
}
