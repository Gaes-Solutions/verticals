"use client";
import type { useCuponCheckout } from "@/lib/use-cupon-checkout";
import { useId } from "react";
export function CuponCheckout({
  cupon,
  disabled = false,
}: { cupon: ReturnType<typeof useCuponCheckout>; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="mt-3">
      <label htmlFor={id} className="gx-label">
        ¿Tienes un cupón?
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={cupon.codigo}
          maxLength={40}
          disabled={disabled}
          onChange={(e) => cupon.cambiar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!disabled) void cupon.aplicar();
            }
          }}
          placeholder="CODIGO"
          autoCapitalize="characters"
          spellCheck={false}
          className="gx-input min-w-0 flex-1 uppercase"
        />
        <button
          type="button"
          onClick={() => void cupon.aplicar()}
          disabled={disabled || !!cupon.validando || !cupon.codigo.trim()}
          className="gx-btn-secondary min-h-11 disabled:opacity-50"
        >
          {cupon.validando ? "Validando…" : "Aplicar"}
        </button>
      </div>
      {!!cupon.codigo && (
        <button
          type="button"
          disabled={disabled}
          onClick={cupon.quitar}
          className="gx-btn-ghost mt-1 min-h-11 text-sm"
        >
          Quitar cupón
        </button>
      )}
      {cupon.validando && (
        <output className="mt-1 block text-sm text-slate-500">Comprobando descuento…</output>
      )}
      {cupon.info?.valido && (
        <output className="mt-1 block text-sm text-ok">{cupon.info.mensaje}</output>
      )}
      {cupon.info && !cupon.info.valido && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {cupon.info.mensaje}
        </p>
      )}
      {cupon.error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {cupon.error}
        </p>
      )}
      {cupon.bloquea && !cupon.validando && !cupon.error && !cupon.info && (
        <p className="mt-1 text-sm text-slate-500">Aplica o quita el cupón para continuar.</p>
      )}
    </div>
  );
}
