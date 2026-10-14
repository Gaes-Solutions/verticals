"use client";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

/** Native modal: traps focus, supports Escape and returns focus to its trigger. */
export function DialogoTienda({
  titulo,
  bloqueado = false,
  onCerrar,
  children,
}: {
  titulo: string;
  bloqueado?: boolean;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="store-action-dialog"
      onClose={onCerrar}
      onCancel={(e) => {
        if (bloqueado) e.preventDefault();
      }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 id={titleId} className="font-bold text-lg">
          {titulo}
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          disabled={bloqueado}
          aria-label="Cerrar"
          className="rounded-lg p-2 text-slate-500 disabled:opacity-40"
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
