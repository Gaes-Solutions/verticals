import { useEffect, type ReactNode } from "react";

const openModals: Array<() => void> = [];

/**
 * Modal estándar (gx-modal-overlay + gx-modal-panel). Anuncia role="dialog" /
 * aria-modal y cierra con Escape; cuando hay varios apilados, solo el más
 * reciente captura el Escape.
 */
export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    openModals.push(onClose);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && openModals[openModals.length - 1] === onClose) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = openModals.indexOf(onClose);
      if (i >= 0) openModals.splice(i, 1);
    };
  }, [onClose]);

  return (
    <div className="gx-modal-overlay" role="dialog" aria-modal="true">
      <div className="gx-modal-panel">{children}</div>
    </div>
  );
}

/** Botón "✕" de cierre con target táctil ≥40px y nombre accesible. */
export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Cerrar"
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    >
      ✕
    </button>
  );
}
