"use client";
import type { LineaRepetible } from "@/lib/repetir-pedido-contract";
import { useRepetirPedido } from "@/lib/use-repetir-pedido";
import type { LineaVerificada } from "@/lib/verificar-carrito-contract";
import { Check, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { type RefObject, useEffect, useRef } from "react";
import { DialogoTienda } from "./dialogo-tienda";

/** A delivered order is a starting selection, never a promise of historical prices or stock. */
export function RepetirDespensa() {
  const p = useRepetirPedido();
  const trigger = useRef<HTMLButtonElement>(null);
  const resultado = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (p.fase === "exito") resultado.current?.focus();
  }, [p.fase]);
  if (!p.datos && !p.aviso) return null;
  const ocupado = p.fase === "consultando" || p.fase === "confirmando";
  const precios = new Map(p.vista?.precios.map((i) => [i.varianteId, i]));
  const total = totalSeleccion(p, precios);
  return (
    <section
      aria-label="Repetir tu despensa"
      className="mb-8 rounded-xl bg-gradient-to-r from-brand-dark to-brand p-4 text-white shadow-lg"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
            <ShoppingBasket aria-hidden="true" size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="font-bold">Repetir tu despensa</h2>
            {p.datos && (
              <p className="break-words text-sm text-white/85">
                Pedido #{p.datos.pedido.folioPublico} · {p.datos.pedido.items.length} productos
              </p>
            )}
            <p className="text-sm text-white/85">
              Elige qué volver a comprar con precios actuales.
            </p>
          </div>
        </div>
        <AccionRepetir p={p} ocupado={ocupado} trigger={trigger} resultado={resultado} />
      </div>
      {!p.vista && p.aviso && (
        <p role="alert" className="mt-3 text-sm">
          {p.aviso}
        </p>
      )}
      {p.vista && p.datos && (
        <DialogoTienda
          titulo="Revisa los productos para repetir"
          bloqueado={ocupado}
          focoAlCerrar={trigger}
          onCerrar={p.cerrar}
        >
          <p className="mb-3 text-sm text-slate-600">
            Se sumarán a tu carrito actual. Los productos sin disponibilidad no se agregan. Esta
            revisión no reserva existencias.
          </p>
          <ul className="divide-y divide-slate-100">
            {p.datos.pedido.items.map((item) => (
              <LineaPedido
                key={item.varianteId}
                item={item}
                precio={precios.get(item.varianteId)}
                previa={p.vista?.base.find((i) => i.varianteId === item.varianteId)?.cantidad ?? 0}
                seleccionada={p.vista?.seleccionadas.includes(item.varianteId) ?? false}
                ocupado={ocupado}
                seleccionar={() => p.seleccionar(item.varianteId)}
              />
            ))}
          </ul>
          {!p.vista.seleccionadas.length && (
            <p className="mt-3 text-sm text-slate-600">
              No hay productos seleccionados para agregar.
            </p>
          )}
          <p className="mt-4 font-semibold">Subtotal a agregar: ${total.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Envío y descuentos se confirman al pagar. Los precios se vuelven a revisar al confirmar.
          </p>
          {p.aviso && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {p.aviso}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={p.confirmar}
              disabled={ocupado || !p.vista.seleccionadas.length}
              className="gx-btn-primary min-h-11"
            >
              {p.fase === "confirmando" ? "Verificando…" : "Agregar selección"}
            </button>
            <Link
              href="/carrito"
              aria-disabled={ocupado}
              className="gx-btn-secondary min-h-11"
              onClick={(e) => {
                if (ocupado) e.preventDefault();
              }}
            >
              Revisar mi carrito
            </Link>
          </div>
        </DialogoTienda>
      )}
    </section>
  );
}

function LineaPedido({
  item,
  precio,
  previa,
  seleccionada,
  ocupado,
  seleccionar,
}: {
  item: LineaRepetible;
  precio: LineaVerificada | undefined;
  previa: number;
  seleccionada: boolean;
  ocupado: boolean;
  seleccionar: () => void;
}) {
  const disponible = precio?.estado === "publicado";
  return (
    <li className="py-2">
      <label className="flex min-h-11 items-start gap-3 py-2">
        <input
          type="checkbox"
          checked={seleccionada}
          disabled={!disponible || ocupado}
          onChange={seleccionar}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span className="min-w-0 flex-1 break-words">
          <span className="block font-medium">{item.nombre}</span>
          <span className="block text-sm text-slate-600">
            Agregar {item.cantidad}
            {previa > 0 ? ` · Ya tienes ${previa}` : ""}
          </span>
          <span className={`block text-sm ${disponible ? "text-marca" : "text-danger"}`}>
            {disponible
              ? `$${Number(precio.precio).toFixed(2)} c/u`
              : precio?.estado === "insuficiente"
                ? "Sin existencia suficiente para sumar esta cantidad"
                : "Ya no está disponible"}
          </span>
        </span>
      </label>
    </li>
  );
}

function totalSeleccion(
  p: ReturnType<typeof useRepetirPedido>,
  precios: Map<string, LineaVerificada>,
) {
  return (
    p.datos?.pedido.items.reduce(
      (sum, i) =>
        sum +
        (p.vista?.seleccionadas.includes(i.varianteId)
          ? Number(precios.get(i.varianteId)?.precio ?? 0) * i.cantidad
          : 0),
      0,
    ) ?? 0
  );
}

function AccionRepetir({
  p,
  ocupado,
  trigger,
  resultado,
}: {
  p: ReturnType<typeof useRepetirPedido>;
  ocupado: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  resultado: RefObject<HTMLAnchorElement | null>;
}) {
  return (
    <>
      {p.fase === "exito" ? (
        <output className="flex items-center gap-2 text-sm font-semibold">
          <Check aria-hidden="true" size={16} /> Selección agregada ·{" "}
          <Link
            ref={resultado}
            href="/carrito"
            className="inline-flex min-h-11 items-center underline underline-offset-2"
          >
            Ver carrito
          </Link>
        </output>
      ) : (
        <button
          ref={trigger}
          type="button"
          disabled={ocupado}
          onClick={
            p.actualizarPagina ? () => window.location.reload() : p.datos ? p.revisar : p.reintentar
          }
          className="min-h-11 shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-brand-dark shadow disabled:cursor-wait disabled:opacity-70"
        >
          {ocupado
            ? "Consultando…"
            : p.actualizarPagina
              ? "Actualizar página"
              : p.datos
                ? "Revisar productos"
                : "Volver a intentar"}
        </button>
      )}
    </>
  );
}
