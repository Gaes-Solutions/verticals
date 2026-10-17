"use client";

import { agregar, leerCarrito } from "@/lib/carrito-store";
import { etiquetaUnidad } from "@/lib/etiquetas";
import { Check, Minus, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvisoStock } from "./aviso-stock";
import { CalculadoraEnvio } from "./calculadora-envio";

export interface VarianteCompra {
  id: string;
  precioBase: string;
  nombreVariante: string | null;
  opciones?: Record<string, string> | null;
}

interface MsiConfig {
  habilitado: boolean;
  meses: number[];
  montoMinimo: string;
}

function etiquetaVariante(v: VarianteCompra, i: number): string {
  if (v.nombreVariante) return v.nombreVariante;
  const ops = v.opciones ? Object.values(v.opciones) : [];
  return ops.length ? ops.join(" · ") : `Opción ${i + 1}`;
}

export interface OfertaCompra {
  precioPromocion: string;
  descuentoPct: number;
}

export function ProductoCompra({
  variantes,
  precioOverride,
  titulo,
  comprarAhora,
  msi,
  oferta,
  stockPublico,
  stockBajo,
  envioGratis,
  unidadMedida,
  imagenUrl,
  slugSeo,
  productoPublicadoId,
  stockPorVariante,
  tipoVenta = "unidad",
  mostrarCotizacion = false,
}: {
  variantes: VarianteCompra[];
  precioOverride: string | null;
  titulo: string;
  comprarAhora: boolean;
  msi: MsiConfig;
  oferta?: OfertaCompra | null;
  stockPublico?: number | null;
  stockBajo?: boolean;
  envioGratis?: boolean;
  unidadMedida?: string | null;
  imagenUrl?: string;
  slugSeo?: string;
  productoPublicadoId?: string;
  stockPorVariante?: Record<string, number> | null;
  tipoVenta?: string;
  mostrarCotizacion?: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(() =>
    Math.max(
      0,
      variantes.findIndex((v) => !stockPorVariante || (stockPorVariante[v.id] ?? 0) > 0),
    ),
  );
  const [cantidadTexto, setCantidadTexto] = useState("1");
  const [enCarrito, setEnCarrito] = useState<Record<string, number>>({});
  const [errorCantidad, setErrorCantidad] = useState<string | null>(null);
  const [agregado, setAgregado] = useState(false);
  useEffect(() => {
    const actualizar = () =>
      setEnCarrito(Object.fromEntries(leerCarrito().map((i) => [i.varianteId, i.cantidad])));
    actualizar();
    window.addEventListener("carrito-actualizado", actualizar);
    return () => window.removeEventListener("carrito-actualizado", actualizar);
  }, []);

  const variante = variantes[sel] ?? variantes[0];
  if (!variante) return null;
  const precioLista = Number(precioOverride ?? variante.precioBase);
  const precioNum = oferta ? Number(oferta.precioPromocion) : precioLista;
  const precio = String(precioNum);
  const stockElegido = stockPorVariante ? (stockPorVariante[variante.id] ?? 0) : stockPublico;
  const sinStock = stockElegido != null && stockElegido <= 0;
  const paso = tipoVenta === "unidad" ? 1 : 0.001;
  const cantidad = Number(cantidadTexto);
  const restante =
    stockElegido == null ? null : Math.max(0, stockElegido - (enCarrito[variante.id] ?? 0));
  const limiteAlcanzado = restante != null && restante < paso;
  const cantidadFormatoValido =
    Number.isFinite(cantidad) &&
    cantidad >= paso &&
    (tipoVenta !== "unidad" || Number.isInteger(cantidad)) &&
    Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) < 0.000001;
  const cantidadValida = cantidadFormatoValido && (restante == null || cantidad <= restante);

  function alCarrito() {
    if (!variante || sinStock || !cantidadValida) {
      setErrorCantidad(
        limiteAlcanzado
          ? "Ya tienes en el carrito las unidades disponibles de esta opción."
          : restante != null && cantidad > restante
            ? `Puedes agregar hasta ${restante} de esta opción.`
            : tipoVenta === "unidad"
              ? "Escribe una cantidad entera mayor que cero."
              : "Escribe una cantidad mayor que cero, con hasta 3 decimales.",
      );
      return false;
    }
    setErrorCantidad(null);
    agregar({
      varianteId: variante.id,
      titulo: variantes.length > 1 ? `${titulo} · ${etiquetaVariante(variante, sel)}` : titulo,
      precio,
      cantidad,
      ...(imagenUrl ? { imagenUrl } : {}),
      ...(slugSeo ? { slugSeo } : {}),
    });
    return true;
  }
  function onAgregar() {
    if (!alCarrito()) return;
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1500);
  }
  function onComprarAhora() {
    if (!alCarrito()) return;
    router.push("/checkout");
  }

  const mostrarMsi = msi.habilitado && msi.meses.length > 0 && precioNum >= Number(msi.montoMinimo);
  const mejorPlazo = mostrarMsi ? Math.max(...msi.meses) : 0;
  const unidad = etiquetaUnidad(unidadMedida);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline gap-2">
        {oferta && (
          <span className="text-slate-400 text-lg line-through">${precioLista.toFixed(2)}</span>
        )}
        <p className="font-bold text-3xl text-marca">
          ${precioNum.toFixed(2)}
          {unidad && <span className="ml-1 font-normal text-slate-400 text-sm">{unidad}</span>}
        </p>
        {oferta && oferta.descuentoPct > 0 && (
          <span className="rounded bg-danger px-2 py-0.5 font-bold text-sm text-white">
            -{oferta.descuentoPct}%
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-sm">
        {envioGratis && (
          <span className="gx-badge-ok flex items-center gap-1">
            <Truck size={14} strokeWidth={2} /> Envío gratis
          </span>
        )}
        {(stockPorVariante
          ? stockElegido != null && stockElegido > 0 && stockElegido <= 5
          : stockBajo) &&
          stockElegido != null && (
            <span className="gx-badge-warn">
              Disponibles: {stockElegido} {unidad ?? ""}
            </span>
          )}
        {sinStock && <span className="gx-badge-danger">Sin stock</span>}
      </div>
      {mostrarMsi && (
        <p className="mt-1 text-slate-600 text-sm">
          o hasta <span className="font-semibold text-marca">{mejorPlazo} meses sin intereses</span>{" "}
          de ${(precioNum / mejorPlazo).toFixed(2)}
        </p>
      )}

      {variantes.length > 1 && (
        <div className="mt-4">
          <p className="mb-1 font-medium text-slate-700 text-sm">Elige una opción:</p>
          <div className="flex flex-wrap gap-2">
            {variantes.map((v, i) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={i === sel}
                onClick={() => {
                  setSel(i);
                  setCantidadTexto("1");
                  setErrorCantidad(null);
                  setAgregado(false);
                }}
                className={`min-h-11 rounded-lg border px-3 py-1.5 text-sm ${
                  i === sel
                    ? "border-marca bg-marca/10 font-medium text-marca"
                    : "border-slate-300 text-slate-700 hover:border-marca"
                }`}
              >
                {etiquetaVariante(v, i)}
                {stockPorVariante && (stockPorVariante[v.id] ?? 0) <= 0 && (
                  <span className="ml-1 text-xs text-slate-500">· Agotado</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-lg border border-slate-300">
          <button
            type="button"
            aria-label="Reducir cantidad"
            disabled={cantidad <= paso || !Number.isFinite(cantidad)}
            className="p-3 disabled:opacity-30"
            onClick={() => {
              setCantidadTexto(String(Math.max(paso, Math.round((cantidad - paso) * 1000) / 1000)));
              setErrorCantidad(null);
            }}
          >
            <Minus size={16} />
          </button>
          <input
            type="number"
            min={paso}
            step={paso}
            max={restante ?? undefined}
            value={cantidadTexto}
            onChange={(e) => {
              setCantidadTexto(e.target.value);
              setErrorCantidad(null);
            }}
            aria-label="Cantidad"
            aria-invalid={!cantidadValida}
            className="w-16 bg-transparent py-3 text-center outline-none focus:ring-2 focus:ring-marca"
          />
          <button
            type="button"
            aria-label="Aumentar cantidad"
            disabled={
              !Number.isFinite(cantidad) || (restante != null && cantidad + paso > restante)
            }
            className="p-3 disabled:opacity-30"
            onClick={() => {
              setCantidadTexto(String(Math.round((cantidad + paso) * 1000) / 1000));
              setErrorCantidad(null);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={onAgregar}
          disabled={sinStock || limiteAlcanzado}
          className="gx-btn-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {agregado && <Check size={16} strokeWidth={2.5} />}
          {agregado ? "Agregado" : "Agregar al carrito"}
        </button>
        {comprarAhora && (
          <button
            type="button"
            onClick={onComprarAhora}
            disabled={sinStock || limiteAlcanzado}
            className="gx-btn-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Comprar ahora
          </button>
        )}
      </div>
      {errorCantidad && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorCantidad}
        </p>
      )}
      {limiteAlcanzado && !sinStock && (
        <p className="mt-3 text-sm text-slate-600">
          Ya tienes en el carrito todas las unidades disponibles de esta opción.
        </p>
      )}

      <div aria-live="polite">
        {agregado && (
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 font-medium text-ok">
              <Check size={16} strokeWidth={2.5} /> Agregado al carrito
            </span>
            <Link href="/carrito" className="font-medium text-marca hover:underline">
              Ver carrito
            </Link>
          </p>
        )}
      </div>

      {sinStock && productoPublicadoId && <AvisoStock productoPublicadoId={productoPublicadoId} />}
      {mostrarCotizacion && (
        <CalculadoraEnvio subtotal={cantidadFormatoValido ? precioNum * cantidad : Number.NaN} />
      )}
    </div>
  );
}
