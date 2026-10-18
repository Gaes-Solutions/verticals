"use client";

import { BarraEnvioGratis } from "@/components/barra-envio-gratis";
import { ImagenCompra } from "@/components/imagen-compra";
import { SugerenciasCarrito } from "@/components/sugerencias-carrito";
import {
  type CarritoLineaLocal,
  actualizarCantidad,
  leerCarrito,
  quitar,
} from "@/lib/carrito-store";
import { useCarritoVerificado } from "@/lib/use-carrito-verificado";
import { CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CarritoPage() {
  const [items, setItems] = useState<CarritoLineaLocal[]>([]);
  const router = useRouter();
  const verificacion = useCarritoVerificado(items);
  const verificados = new Map(verificacion.lineas?.map((l) => [l.varianteId, l]));
  const visibles = items.map((i) => ({
    ...i,
    precio: verificados.get(i.varianteId)?.precio ?? i.precio,
  }));
  const cambiarCantidad = (id: string, cambio: number) => {
    const actual = leerCarrito().find((i) => i.varianteId === id);
    if (actual) actualizarCantidad(id, actual.cantidad + cambio);
  };
  const continuar = () => {
    if (verificacion.prepararCompra()) router.push("/checkout");
  };
  const [envioGratisDesde, setEnvioGratisDesde] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => setItems(leerCarrito());
    refresh();
    window.addEventListener("carrito-actualizado", refresh);
    fetch("/api/tienda-config")
      .then((r) => r.json())
      .then((c: { envioGratisDesde: string | null }) => {
        if (c.envioGratisDesde) setEnvioGratisDesde(Number(c.envioGratisDesde));
      })
      .catch(() => {});
    return () => window.removeEventListener("carrito-actualizado", refresh);
  }, []);

  const total = visibles.reduce((acc, i) => acc + Number(i.precio) * i.cantidad, 0);

  if (items.length === 0) {
    return (
      <div className="text-center">
        <h1 className="font-bold text-2xl">Tu carrito está vacío</h1>
        <Link href="/" className="mt-4 inline-block text-marca">
          Ver catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-28 lg:pb-0">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-semibold text-marca text-sm">Revisa tu compra</p>
          <h1 className="font-bold text-2xl tracking-tight">Tu carrito</h1>
        </div>
        <p className="hidden text-slate-500 text-sm sm:block">
          {items.length} {items.length === 1 ? "producto" : "productos"}
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        {verificacion.cargando && <output>Actualizando precios y disponibilidad…</output>}
        {verificacion.error && <p role="alert">{verificacion.error}</p>}
        {verificacion.lineas && (
          <p className="text-sm text-slate-600">
            Precios consultados. La existencia final y el envío se confirman al pagar; esta revisión
            no reserva productos.
          </p>
        )}
        {(verificacion.error || (verificacion.lineas && !verificacion.listo)) && (
          <button
            type="button"
            className="gx-btn-secondary mt-3 min-h-11"
            onClick={verificacion.revalidar}
          >
            Volver a consultar
          </button>
        )}
      </div>
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {envioGratisDesde && verificacion.listo && (
            <div className="mb-4">
              <BarraEnvioGratis subtotal={total} umbral={envioGratisDesde} />
            </div>
          )}

          <div className="space-y-3">
            {visibles.map((i) => (
              <div key={i.varianteId} className="flex gap-3 gx-card !p-3 sm:!p-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded bg-slate-100">
                  <ImagenCompra
                    src={i.imagenUrl}
                    alt={i.titulo}
                    className="h-full w-full rounded object-cover"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    {i.slugSeo ? (
                      <Link
                        href={`/producto/${i.slugSeo}`}
                        className="min-w-0 break-words font-medium hover:text-marca"
                      >
                        {i.titulo}
                      </Link>
                    ) : (
                      <p className="min-w-0 break-words font-medium">{i.titulo}</p>
                    )}
                    <span className="whitespace-nowrap font-bold">
                      ${(Number(i.precio) * i.cantidad).toFixed(2)}
                    </span>
                  </div>
                  {verificados.get(i.varianteId)?.estado === "no_publicado" && (
                    <p role="alert" className="mt-2 text-danger text-sm">
                      Este artículo ya no está disponible. Quítalo para continuar.
                    </p>
                  )}
                  {verificados.get(i.varianteId)?.estado === "insuficiente" && (
                    <p role="alert" className="mt-2 text-danger text-sm">
                      La cantidad supera el inventario público. Reduce la cantidad o quita el
                      artículo.
                    </p>
                  )}
                  {verificados.get(i.varianteId)?.precio != null &&
                    Number(items.find((l) => l.varianteId === i.varianteId)?.precio) !==
                      Number(i.precio) && (
                      <p className="mt-2 text-sm text-marca">
                        Precio actualizado:{" "}
                        <s>
                          $
                          {Number(items.find((l) => l.varianteId === i.varianteId)?.precio).toFixed(
                            2,
                          )}
                        </s>{" "}
                        → ${Number(i.precio).toFixed(2)} c/u
                      </p>
                    )}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(i.varianteId, -1)}
                        className="flex h-11 w-11 items-center justify-center rounded border text-lg hover:bg-slate-50"
                        aria-label={`Disminuir cantidad de ${i.titulo}`}
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-sm">{i.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(i.varianteId, 1)}
                        className="flex h-11 w-11 items-center justify-center rounded border text-lg hover:bg-slate-50"
                        aria-label={`Aumentar cantidad de ${i.titulo}`}
                      >
                        +
                      </button>
                      <span className="ml-1 hidden text-slate-400 text-xs sm:inline">
                        ${Number(i.precio).toFixed(2)} c/u
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => quitar(i.varianteId)}
                      className="gx-btn-ghost min-h-11 !px-2 text-danger"
                      aria-label={`Quitar ${i.titulo}`}
                    >
                      <Trash2 size={14} /> Quitar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SugerenciasCarrito />
        </div>

        {/* Resumen: sticky en desktop, barra fija en móvil */}
        <aside className="mt-6 lg:sticky lg:top-32 lg:mt-0">
          <div className="tienda-surface hidden !p-5 lg:block">
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-ok-light px-3 py-2 text-ok text-xs">
              <ShieldCheck size={16} /> Compra protegida
            </div>
            <div className="flex justify-between font-bold text-lg">
              <span>Subtotal estimado</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-slate-500 text-xs">Subtotal sin costo de envío.</p>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <p className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-ok" />
                Pago seguro
              </p>
              <p className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-ok" />
                Revisa los cambios antes de pagar
              </p>
            </div>
            <button
              type="button"
              onClick={continuar}
              disabled={!verificacion.listo}
              className="gx-btn-primary mt-4 min-h-11 w-full !py-3"
            >
              Continuar compra →
            </button>
            <Link href="/" className="gx-btn-ghost mt-2 w-full">
              Seguir comprando
            </Link>
          </div>
        </aside>
      </div>

      {/* Total siempre visible en móvil */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.08)] lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-slate-500 text-xs">Subtotal estimado</p>
            <p className="font-bold text-lg">${total.toFixed(2)}</p>
          </div>
          <button
            type="button"
            onClick={continuar}
            disabled={!verificacion.listo}
            className="gx-btn-primary min-h-11 flex-1 !py-3 sm:flex-none sm:px-8"
          >
            Continuar compra →
          </button>
        </div>
      </div>
    </div>
  );
}
