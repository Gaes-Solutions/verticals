"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useRef, useState } from "react";

/** A regular accessible button; dragging this button is an optional shortcut. */
export function BotonAgregar({
  disabled = false,
  onAgregar,
}: { disabled?: boolean; onAgregar: () => void }) {
  const [avance, setAvance] = useState(0);
  const inicio = useRef<{ x: number; y: number; umbral: number } | null>(null);
  const omitirClick = useRef(false);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={disabled ? "Agotado" : "Agregar"}
      title="Toca para agregar o desliza este botón hacia la derecha"
      className="store-add-button store-swipe-button w-full disabled:cursor-not-allowed disabled:opacity-40"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        if (disabled) return;
        omitirClick.current = false;
        inicio.current = {
          x: e.clientX,
          y: e.clientY,
          umbral: Math.min(65, e.currentTarget.clientWidth * 0.4),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const start = inicio.current;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) > Math.abs(dy))
          setAvance(Math.max(0, Math.min(100, (dx / start.umbral) * 100)));
      }}
      onPointerUp={(e) => {
        const start = inicio.current;
        inicio.current = null;
        setAvance(0);
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) omitirClick.current = true;
        if (dx >= start.umbral && Math.abs(dx) > Math.abs(dy) && !disabled) onAgregar();
      }}
      onPointerCancel={() => {
        inicio.current = null;
        setAvance(0);
      }}
      onClick={(e) => {
        if (omitirClick.current && e.detail !== 0) {
          omitirClick.current = false;
          return;
        }
        onAgregar();
      }}
    >
      <span aria-hidden="true" className="store-swipe-fill" style={{ width: `${avance}%` }} />
      <span className="relative flex flex-col items-center">
        <span className="flex items-center gap-1.5">
          <Plus size={15} /> {disabled ? "Agotado" : "Agregar"}
        </span>
        {!disabled && (
          <small className="flex items-center gap-1 text-[9px] font-normal opacity-75">
            Toca o desliza <ArrowRight size={10} />
          </small>
        )}
      </span>
    </button>
  );
}
