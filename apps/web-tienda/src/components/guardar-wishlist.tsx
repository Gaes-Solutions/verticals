"use client";
import { listaWishlist, reciboWishlist } from "@/lib/preferencias-contract";
import { ErrorPreferencia, fetchPreferencia, useSolicitudCuenta } from "@/lib/use-solicitud-cuenta";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
export function GuardarWishlist({ productoPublicadoId }: { productoPublicadoId: string }) {
  return <GuardarProducto key={productoPublicadoId} productoPublicadoId={productoPublicadoId} />;
}
function GuardarProducto({ productoPublicadoId }: { productoPublicadoId: string }) {
  const router = useRouter();
  const { ocupado, error, ejecutar } = useSolicitudCuenta();
  const [guardado, setGuardado] = useState(false);
  const [listo, setListo] = useState(false);
  const [incierto, setIncierto] = useState(false);
  const [sinSesion, setSinSesion] = useState(false);
  const cargar = useCallback(
    () =>
      ejecutar(
        async (signal) => {
          const { data } = await fetchPreferencia("/api/cuenta/wishlist", signal);
          if (!listaWishlist(data)) throw new ErrorPreferencia(502);
          setGuardado(data.some((i) => i.productoPublicadoId === productoPublicadoId));
          setListo(true);
          setIncierto(false);
          setSinSesion(false);
        },
        (e) => {
          setListo(false);
          if (e instanceof ErrorPreferencia && e.status === 401) {
            setSinSesion(true);
            setListo(true);
            setGuardado(false);
          }
        },
      ),
    [ejecutar, productoPublicadoId],
  );
  useEffect(() => {
    void cargar();
    const refrescar = () => {
      void cargar();
    };
    window.addEventListener("wishlist-actualizada", refrescar);
    return () => window.removeEventListener("wishlist-actualizada", refrescar);
  }, [cargar]);
  function guardar() {
    if (sinSesion) {
      router.push("/cuenta/login");
      return;
    }
    if (!listo || incierto || guardado) return;
    void ejecutar(
      async (signal) => {
        const { data } = await fetchPreferencia("/api/cuenta/wishlist", signal, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productoPublicadoId }),
        });
        if (!reciboWishlist(data)) throw new ErrorPreferencia(502);
        setGuardado(true);
        window.dispatchEvent(new Event("wishlist-actualizada"));
      },
      (e) => {
        setIncierto(true);
        if (e instanceof ErrorPreferencia && e.status === 401) setSinSesion(true);
      },
    );
  }
  return (
    <div>
      <button
        type="button"
        onClick={guardar}
        aria-pressed={guardado}
        disabled={ocupado || guardado || (!sinSesion && (!listo || incierto))}
        className="gx-btn-secondary min-h-11"
      >
        <Heart size={16} className={guardado ? "fill-marca text-marca" : ""} />
        {ocupado ? "Comprobando…" : guardado ? "Guardado" : "Guardar"}
      </button>
      {error && !sinSesion && (
        <p role="alert" className="mt-2 text-danger text-sm">
          {error}
        </p>
      )}
      {sinSesion && (
        <p className="mt-2 text-slate-500 text-sm">Inicia sesión para guardar tus favoritos.</p>
      )}
      {(!listo || incierto) && !ocupado && (
        <button
          type="button"
          onClick={() => void cargar()}
          className="gx-btn-secondary mt-2 min-h-11"
        >
          Actualizar favoritos
        </button>
      )}
    </div>
  );
}
