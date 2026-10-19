"use client";

import {
  type AdicionCarrito,
  type CarritoLineaLocal,
  guardarCarrito,
  leerCarrito,
  propietarioCarrito,
} from "@/lib/carrito-store";
import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ImagenCompra } from "./imagen-compra";

export function CarritoFlotante() {
  const pathname = usePathname();
  const [items, setItems] = useState<CarritoLineaLocal[]>([]);
  const [ultimo, setUltimo] = useState<AdicionCarrito | null>(null);
  const recibo = useRef<AdicionCarrito | null>(null);
  const [aviso, setAviso] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const invalidarConfirmacion = () => {
      if (timer.current) clearTimeout(timer.current);
      recibo.current = null;
      setUltimo(null);
    };
    const refresh = () => {
      try {
        const actuales = leerCarrito();
        setItems(actuales);
        if (
          recibo.current &&
          (recibo.current.owner !== propietarioCarrito() ||
            JSON.stringify(actuales) !== JSON.stringify(recibo.current.despues))
        )
          invalidarConfirmacion();
      } catch {
        invalidarConfirmacion();
        setItems([]);
      }
    };
    const contexto = () => {
      invalidarConfirmacion();
      setAviso("");
      refresh();
    };
    const agregado = (event: Event) => {
      const linea = (event as CustomEvent<AdicionCarrito>).detail;
      try {
        if (
          !linea ||
          !Array.isArray(linea.antes) ||
          !Array.isArray(linea.despues) ||
          linea.owner !== propietarioCarrito() ||
          JSON.stringify(leerCarrito()) !== JSON.stringify(linea.despues)
        )
          return;
        recibo.current = linea;
        setUltimo(linea);
        setAviso("");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(invalidarConfirmacion, 5500);
      } catch {
        invalidarConfirmacion();
      }
    };
    refresh();
    window.addEventListener("carrito-actualizado", refresh);
    window.addEventListener("carrito-agregado", agregado);
    window.addEventListener("carrito-externo-actualizado", invalidarConfirmacion);
    window.addEventListener("carrito-contexto-cambiado", contexto);
    return () => {
      window.removeEventListener("carrito-actualizado", refresh);
      window.removeEventListener("carrito-agregado", agregado);
      window.removeEventListener("carrito-externo-actualizado", invalidarConfirmacion);
      window.removeEventListener("carrito-contexto-cambiado", contexto);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const visible = items.length > 0 && (pathname === "/" || pathname.startsWith("/producto/"));
  useEffect(() => {
    document.body.classList.toggle("store-has-cart", visible);
    const actualizarEspacio = () => {
      if (panel.current)
        document.body.style.setProperty(
          "--store-cart-height",
          `${Math.ceil(panel.current.getBoundingClientRect().height)}px`,
        );
    };
    actualizarEspacio();
    const observador = new ResizeObserver(actualizarEspacio);
    if (panel.current) observador.observe(panel.current);
    return () => {
      observador.disconnect();
      document.body.classList.remove("store-has-cart");
      document.body.style.removeProperty("--store-cart-height");
    };
  }, [visible]);
  if (!visible) return null;
  const unidades = items.reduce((n, p) => n + Math.round(p.cantidad * 1000), 0) / 1000;
  const total = items.reduce((n, p) => n + Number(p.precio) * p.cantidad, 0);
  const formato = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  function deshacer() {
    const r = recibo.current;
    if (!r) return;
    recibo.current = null;
    setUltimo(null);
    if (timer.current) clearTimeout(timer.current);
    try {
      if (
        r.owner !== propietarioCarrito() ||
        JSON.stringify(leerCarrito()) !== JSON.stringify(r.despues)
      ) {
        setAviso("Tu carrito cambió. Revisa tu selección antes de quitar productos.");
        return;
      }
      try {
        guardarCarrito(r.antes);
      } catch {
        if (
          r.owner !== propietarioCarrito() ||
          JSON.stringify(leerCarrito()) !== JSON.stringify(r.antes)
        )
          throw new Error();
      }
      setAviso("");
    } catch {
      setAviso(
        "No pudimos confirmar que se deshizo. Revisa tu carrito antes de volver a intentar.",
      );
    }
  }
  function cerrarConfirmacion() {
    recibo.current = null;
    setUltimo(null);
    if (timer.current) clearTimeout(timer.current);
  }

  return (
    <aside ref={panel} className="store-floating-cart" aria-label="Tu compra">
      {ultimo && (
        <div className="store-cart-feedback">
          <output className="flex min-w-0 items-center gap-2">
            <Check size={16} className="shrink-0" />
            <span className="truncate">Agregaste {ultimo.titulo}</span>
          </output>
          <button
            type="button"
            onClick={deshacer}
            className="min-h-11 shrink-0 px-1 font-semibold underline"
          >
            Deshacer
          </button>
          <button
            type="button"
            className="min-h-11 min-w-11 shrink-0"
            aria-label="Cerrar confirmación"
            onClick={cerrarConfirmacion}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {aviso && (
        <p role="alert" className="p-3 text-sm text-danger">
          {aviso}
        </p>
      )}
      <div className="store-floating-cart-content">
        <div className="store-cart-preview" aria-hidden="true">
          <ImagenCompra src={items[0]?.imagenUrl} alt="" />
          <b>{unidades}</b>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">
            {items.length} {items.length === 1 ? "producto" : "productos"} · Subtotal estimado
          </p>
          <p className="break-all text-lg font-bold text-slate-900">{formato.format(total)}</p>
        </div>
        <Link href="/carrito" className="store-button min-h-11">
          Ver mi compra <ArrowRight size={16} />
        </Link>
      </div>
    </aside>
  );
}
