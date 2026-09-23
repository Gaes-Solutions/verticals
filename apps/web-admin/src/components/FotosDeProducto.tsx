import { ImagePlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, loadToken, puede } from "../lib/api.js";
import { prepararFoto } from "../lib/imagen.js";

interface Foto {
  id: string;
  cdnUrl: string;
  orden: number;
}

const FORMATOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Las fotos solo se entregan con sesión, y un <img> no manda el token: cada una
 * se descarga con el token y se muestra desde memoria mientras esté abierta la
 * ventana.
 */
function useVistaPrevia(fotos: Foto[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    const creadas: string[] = [];
    void (async () => {
      for (const foto of fotos) {
        const res = await fetch(`/api${foto.cdnUrl.replace("/tienda/", "/t/tienda/")}`, {
          headers: { Authorization: `Bearer ${loadToken()}` },
        }).catch(() => null);
        if (!res?.ok || !vivo) continue;
        const url = URL.createObjectURL(await res.blob());
        creadas.push(url);
        if (!vivo) break;
        setUrls((previas) => ({ ...previas, [foto.id]: url }));
      }
    })();
    return () => {
      vivo = false;
      for (const url of creadas) URL.revokeObjectURL(url);
    };
  }, [fotos]);
  return urls;
}

/** Fotos de un producto: ver las que tiene, agregar una y quitar la que no va. */
export function FotosDeProducto({ productoId }: { productoId: string }) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const vistas = useVistaPrevia(fotos);
  const puedeEditar = puede("productos.actualizar");

  const cargar = useCallback(() => {
    api<Foto[]>(`/t/productos/${productoId}/imagenes`)
      .then(setFotos)
      .catch(() => setFotos([]));
  }, [productoId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cargar solo cambia con productoId
  useEffect(() => cargar(), [productoId]);

  async function subir(archivo: File) {
    setError(null);
    if (!FORMATOS.includes(archivo.type)) return setError("Usa JPG, PNG o WebP");
    if (archivo.size > MAX_BYTES * 8) return setError("La foto pesa demasiado; redúcela antes");
    setSubiendo(true);
    try {
      const foto = await prepararFoto(archivo);
      const res = await fetch(`/api/t/productos/${productoId}/imagenes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${loadToken()}`, "Content-Type": foto.tipo },
        body: foto.archivo,
      });
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(cuerpo.message ?? "No se pudo guardar la foto");
      }
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la foto");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar(id: string) {
    setError(null);
    try {
      await api(`/t/productos/imagenes/${id}`, { method: "DELETE" });
      setFotos((previas) => previas.filter((f) => f.id !== id));
    } catch {
      setError("No se pudo quitar la foto");
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="font-semibold text-slate-700 text-sm">Fotos</p>
      <p className="mb-3 text-slate-500 text-xs">
        La primera es la que se ve en la tienda en línea. JPG, PNG o WebP; se encogen solas para que
        la tienda cargue rápido.
      </p>
      <div className="flex flex-wrap gap-2">
        {fotos.map((foto) => (
          <div
            key={foto.id}
            className="relative h-20 w-20 overflow-hidden rounded-md border border-slate-200 bg-white"
          >
            {vistas[foto.id] ? (
              <img src={vistas[foto.id]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full animate-pulse bg-slate-100" />
            )}
            {puedeEditar && (
              <button
                type="button"
                onClick={() => quitar(foto.id)}
                aria-label="Quitar foto"
                className="absolute top-0.5 right-0.5 rounded bg-white/90 p-1 text-danger shadow-sm"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {puedeEditar && (
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-slate-300 border-dashed text-slate-500 text-xs hover:border-marca hover:text-marca">
            <ImagePlus size={18} />
            {subiendo ? "Subiendo…" : "Agregar"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={subiendo}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void subir(archivo);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {fotos.length === 0 && !puedeEditar && (
        <p className="text-slate-500 text-xs">Este producto no tiene fotos.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-danger text-xs">
          {error}
        </p>
      )}
      <p className="mt-2 text-slate-500 text-xs">
        ¿Muchos productos? En “Fotos” del menú puedes subirlas todas de una vez nombrando cada
        archivo con el código del producto.
      </p>
    </div>
  );
}
