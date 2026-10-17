"use client";

import { type CarritoLineaLocal, guardarCarrito, leerCarrito } from "@/lib/carrito-store";
import { codigoRecoveryValido, errorRecovery, leerCarritoRecovery } from "@/lib/recovery-contract";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Resultado =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string; reintentar: boolean }
  | { tipo: "listo"; items: CarritoLineaLocal[] };

async function cargarRecovery(codigo: string, cancel: AbortSignal): Promise<Resultado> {
  if (!codigoRecoveryValido(codigo))
    return { tipo: "error", mensaje: errorRecovery(400), reintentar: false };
  try {
    const signal = AbortSignal.any([cancel, AbortSignal.timeout(20000)]);
    const res = await fetch(`/api/recovery/${encodeURIComponent(codigo)}`, {
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!res.ok)
      return {
        tipo: "error",
        mensaje: errorRecovery(res.status),
        reintentar: ![400, 404, 410].includes(res.status),
      };
    const items = leerCarritoRecovery(await res.json());
    signal.throwIfAborted();
    if (!items) throw new Error("Invalid recovery receipt");
    return { tipo: "listo", items };
  } catch {
    return { tipo: "error", mensaje: errorRecovery(503), reintentar: true };
  }
}

/** Opening a recovery link never edits the current cart. */
export function RecuperarCarrito({ codigo }: { codigo: string }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<Resultado>({ tipo: "cargando" });
  const [solicitud, setSolicitud] = useState({ codigo });
  const [actual, setActual] = useState({ firma: "", cantidad: 0, contexto: 0 });
  const [confirmado, setConfirmado] = useState(false);
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  const contexto = useRef(0);
  const montado = useRef(false);

  useEffect(() => {
    montado.current = true;
    const actualizar = () => {
      try {
        const items = leerCarrito();
        setActual({
          firma: JSON.stringify(items),
          cantidad: items.length,
          contexto: contexto.current,
        });
        setConfirmado(false);
      } catch {
        setActual({ firma: "", cantidad: 0, contexto: contexto.current });
        setAviso("No pudimos leer tu carrito. Revisa que el navegador permita guardar datos.");
      }
    };
    const cambiarContexto = () => {
      contexto.current++;
      actualizar();
      setAviso("La cuenta cambió. Revisa tu carrito antes de confirmar.");
    };
    actualizar();
    window.addEventListener("carrito-actualizado", actualizar);
    window.addEventListener("carrito-contexto-cambiado", cambiarContexto);
    window.addEventListener("storage", actualizar);
    return () => {
      montado.current = false;
      window.removeEventListener("carrito-actualizado", actualizar);
      window.removeEventListener("carrito-contexto-cambiado", cambiarContexto);
      window.removeEventListener("storage", actualizar);
    };
  }, []);

  useEffect(() => {
    let activo = true;
    const controller = new AbortController();
    setResultado({ tipo: "cargando" });
    void cargarRecovery(solicitud.codigo, controller.signal).then((value) => {
      if (activo) setResultado(value);
    });
    return () => {
      activo = false;
      controller.abort();
    };
  }, [solicitud]);

  function recuperar() {
    if (ocupado.current || resultado.tipo !== "listo" || !resultado.items.length) return;
    try {
      const items = leerCarrito();
      if (actual.firma !== JSON.stringify(items) || actual.contexto !== contexto.current) {
        setActual({
          firma: JSON.stringify(items),
          cantidad: items.length,
          contexto: contexto.current,
        });
        setConfirmado(false);
        setAviso("Tu carrito cambió. Revisa la selección actual antes de confirmar otra vez.");
        return;
      }
      if (items.length && !confirmado) return;
      ocupado.current = true;
      setGuardando(true);
      setAviso("");
      guardarCarrito(resultado.items);
      if (montado.current) router.push("/carrito");
    } catch {
      ocupado.current = false;
      setGuardando(false);
      setAviso("No pudimos confirmar el cambio. Revisa tu carrito antes de volver a intentar.");
    }
  }

  return (
    <section className="mx-auto max-w-xl py-8" aria-labelledby="recovery-titulo">
      <h1 id="recovery-titulo" className="font-bold text-2xl text-slate-800">
        Recupera tu selección
      </h1>
      <p className="mt-2 text-slate-500">Revisa los productos antes de llevarlos al carrito.</p>
      {resultado.tipo === "cargando" && (
        <output className="mt-6 block">Buscando tus productos…</output>
      )}
      {resultado.tipo === "error" && (
        <div className="mt-6">
          <p role="alert">{resultado.mensaje}</p>
          {resultado.reintentar && (
            <button
              type="button"
              className="gx-btn-primary mt-4 min-h-11"
              onClick={() => setSolicitud({ codigo })}
            >
              Volver a intentar
            </button>
          )}
        </div>
      )}
      {resultado.tipo === "listo" &&
        (resultado.items.length ? (
          <div className="gx-card mt-6">
            <ul className="divide-y divide-slate-100">
              {resultado.items.map((item) => (
                <li key={item.varianteId} className="flex gap-3 py-3">
                  <span className="min-w-0 flex-1 break-words font-medium">{item.titulo}</span>
                  <span className="shrink-0 text-slate-500">Cantidad: {item.cantidad}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-slate-500 text-sm">
              Los precios y la disponibilidad se verificarán antes de confirmar la compra.
            </p>
            {actual.cantidad > 0 && (
              <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmado}
                  disabled={guardando}
                  onChange={(e) => setConfirmado(e.target.checked)}
                  className="h-5 w-5 shrink-0"
                />
                <span>
                  Quiero reemplazar mi carrito actual ({actual.cantidad} producto
                  {actual.cantidad === 1 ? "" : "s"}) con esta selección.
                </span>
              </label>
            )}
            <button
              type="button"
              onClick={recuperar}
              disabled={guardando || !actual.firma || (actual.cantidad > 0 && !confirmado)}
              className="gx-btn-primary mt-4 min-h-11 w-full"
            >
              {guardando
                ? "Abriendo carrito…"
                : actual.cantidad > 0
                  ? "Reemplazar mi carrito"
                  : "Llevar al carrito"}
            </button>
          </div>
        ) : (
          <output className="mt-6 block">
            Esta selección no tiene productos para recuperar. Tu carrito actual se conserva.
          </output>
        ))}
      {aviso && (
        <p role="alert" className="mt-4 text-sm">
          {aviso}
        </p>
      )}
      <nav aria-label="Continuar comprando" className="mt-6 flex flex-wrap gap-3">
        <Link href="/carrito" className="gx-btn-secondary min-h-11">
          Ver mi carrito actual
        </Link>
        <Link href="/" className="gx-btn-secondary min-h-11">
          Ir al catálogo
        </Link>
      </nav>
    </section>
  );
}
