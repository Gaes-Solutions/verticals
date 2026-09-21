"use client";

import type { CatalogoResponse } from "@/lib/api";
import { agregar } from "@/lib/carrito-store";
import type { PedidoCliente, PedidoDetalleCliente } from "@/lib/cliente";
import { Check, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Pedidos que cuentan como "despensa" repetible (ya entregados al cliente). */
const ESTADOS_ENTREGADOS = ["entregado", "recogido"];
/** Tope del catálogo público para validar disponibilidad antes de re-agregar. */
const TOPE_CATALOGO = 100;

type Fase = "cargando" | "listo" | "agregando" | "exito";

interface LineaRepetible {
  varianteId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: string;
}

/**
 * Franja "Repetir tu despensa": trae el último pedido entregado y, con un
 * toque, vuelve a poner sus líneas en el carrito. Sin sesión o sin pedidos
 * no renderiza nada.
 */
export function RepetirDespensa() {
  const [folio, setFolio] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [lineas, setLineas] = useState<LineaRepetible[]>([]);
  const [fase, setFase] = useState<Fase>("cargando");
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await fetch("/api/cuenta/pedidos", { cache: "no-store" });
        if (!res.ok) return;
        const pedidos = (await res.json()) as PedidoCliente[];
        if (!Array.isArray(pedidos)) return;
        const ultimo = pedidos
          .filter((p) => ESTADOS_ENTREGADOS.includes(p.statusPedido))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        if (!ultimo) return;
        const detRes = await fetch(
          `/api/cuenta/pedidos/${encodeURIComponent(ultimo.folioPublico)}`,
          { cache: "no-store" },
        );
        if (!detRes.ok) return;
        const detalle = (await detRes.json()) as PedidoDetalleCliente;
        if (!activo || !detalle?.items?.length) return;
        setFolio(detalle.folioPublico);
        setTotal(Number(detalle.total));
        setLineas(
          detalle.items.map((it) => ({
            varianteId: it.varianteId,
            nombre: it.nombre,
            cantidad: it.cantidad,
            precioUnitario: it.precioUnitario,
          })),
        );
        setFase("listo");
      } catch {
        // Sin franja: el home sigue funcionando igual.
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  async function repetir() {
    if (fase !== "listo") return;
    setFase("agregando");
    setAviso(null);
    try {
      // Validar disponibilidad contra el catálogo público; si el catálogo es
      // mayor al tope no se puede verificar todo y se agrega igual.
      const disponibles = new Set<string>();
      const catRes = await fetch(`/api/catalogo?soloDisponibles=true&pageSize=${TOPE_CATALOGO}`, {
        cache: "no-store",
      });
      let verificado = false;
      if (catRes.ok) {
        const cat = (await catRes.json()) as CatalogoResponse;
        if (cat.total <= TOPE_CATALOGO) {
          verificado = true;
          for (const item of cat.items) {
            for (const v of item.producto.variantes) disponibles.add(v.id);
          }
        }
      }
      const faltantes = verificado
        ? lineas.filter((l) => !disponibles.has(l.varianteId)).length
        : 0;
      for (const l of lineas) {
        if (verificado && !disponibles.has(l.varianteId)) continue;
        agregar({
          varianteId: l.varianteId,
          titulo: l.nombre,
          precio: l.precioUnitario,
          cantidad: l.cantidad,
        });
      }
      if (lineas.length > 0 && faltantes / lineas.length > 0.2) {
        setAviso("Algunos productos ya no están disponibles y se omitieron.");
      }
      setFase("exito");
    } catch {
      setFase("listo");
      setAviso("No se pudo repetir el pedido. Inténtalo de nuevo.");
    }
  }

  if (fase === "cargando" || !folio) return null;

  return (
    <section className="mb-8 flex flex-col gap-2 rounded-xl bg-gradient-to-r from-brand-dark to-brand p-4 text-white shadow-lg sm:flex-row sm:items-center sm:gap-4">
      <div className="flex flex-1 items-center gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
          <ShoppingBasket size={22} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="font-bold">Repetir tu despensa</p>
          <p className="truncate text-white/85 text-sm">
            Pedido #{folio} · {lineas.length} producto{lineas.length === 1 ? "" : "s"} · $
            {total.toFixed(2)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {fase === "exito" ? (
          <span className="flex items-center gap-2 font-semibold text-sm">
            <Check size={16} strokeWidth={2.5} /> Listo ·
            <Link href="/carrito" className="underline underline-offset-2">
              Ver carrito
            </Link>
          </span>
        ) : (
          <button
            type="button"
            onClick={repetir}
            disabled={fase === "agregando"}
            className="rounded-full bg-white px-5 py-2.5 font-bold text-brand-dark text-sm shadow transition hover:scale-105 disabled:cursor-wait disabled:opacity-70"
          >
            {fase === "agregando" ? "Agregando…" : "1 toque"}
          </button>
        )}
      </div>
      <div aria-live="polite" className="sr-only">
        {fase === "agregando"
          ? "Agregando productos al carrito…"
          : fase === "exito"
            ? "Pedido agregado al carrito"
            : ""}
      </div>
      {aviso && <p className="text-white/90 text-xs sm:basis-full">{aviso}</p>}
    </section>
  );
}
