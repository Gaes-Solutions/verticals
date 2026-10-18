"use client";

import { type CarritoLineaLocal, actualizarCantidad, leerCarrito } from "@/lib/carrito-store";
import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImagenCompra } from "./imagen-compra";

export function CarritoFlotante() {
  const pathname = usePathname();
  const [items, setItems] = useState<CarritoLineaLocal[]>([]);
  const [ultimo, setUltimo] = useState<CarritoLineaLocal | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const refresh = () => setItems(leerCarrito());
    const invalidarConfirmacion = () => {
      if (timer.current) clearTimeout(timer.current);
      setUltimo(null);
    };
    const agregado = (event: Event) => {
      const linea = (event as CustomEvent<CarritoLineaLocal>).detail;
      setUltimo(linea);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUltimo(null), 5500);
    };
    refresh();
    window.addEventListener("carrito-actualizado", refresh);
    window.addEventListener("carrito-agregado", agregado);
    window.addEventListener("carrito-externo-actualizado", invalidarConfirmacion);
    window.addEventListener("carrito-contexto-cambiado", invalidarConfirmacion);
    return () => {
      window.removeEventListener("carrito-actualizado", refresh);
      window.removeEventListener("carrito-agregado", agregado);
      window.removeEventListener("carrito-externo-actualizado", invalidarConfirmacion);
      window.removeEventListener("carrito-contexto-cambiado", invalidarConfirmacion);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const visible = items.length > 0 && (pathname === "/" || pathname.startsWith("/producto/"));
  useEffect(() => {
    document.body.classList.toggle("store-has-cart", visible);
    return () => document.body.classList.remove("store-has-cart");
  }, [visible]);
  if (!visible) return null;
  const unidades = items.reduce((n, p) => n + p.cantidad, 0);
  const total = items.reduce((n, p) => n + Number(p.precio) * p.cantidad, 0);
  const formato = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  function deshacer() {
    if (!ultimo) return;
    const actual = leerCarrito().find((p) => p.varianteId === ultimo.varianteId);
    if (actual) actualizarCantidad(actual.varianteId, actual.cantidad - ultimo.cantidad);
    setUltimo(null);
  }
  return (
    <aside className="store-floating-cart" aria-label="Tu compra">
      {ultimo && (
        <div className="store-cart-feedback">
          <output className="flex min-w-0 items-center gap-2">
            <Check size={16} className="shrink-0" />
            <span className="truncate">Agregaste {ultimo.titulo}</span>
          </output>
          <button type="button" onClick={deshacer} className="shrink-0 font-semibold underline">
            Deshacer
          </button>
          <button type="button" aria-label="Cerrar confirmación" onClick={() => setUltimo(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      <div className="store-floating-cart-content">
        <div className="store-cart-preview" aria-hidden="true">
          <ImagenCompra src={items[0]?.imagenUrl} alt="" />
          <b>{unidades}</b>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">
            {unidades} {unidades === 1 ? "producto" : "productos"} · Subtotal
          </p>
          <p className="text-lg font-bold text-slate-900">{formato.format(total)}</p>
        </div>
        <Link href="/carrito" className="store-button">
          Ver mi compra <ArrowRight size={16} />
        </Link>
      </div>
    </aside>
  );
}
