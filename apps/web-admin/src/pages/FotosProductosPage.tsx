import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { ApiError, api, loadToken, puede } from "../lib/api.js";

interface Resultado {
  archivo: string;
  codigo: string;
  estado: "subida" | "sin_coincidencia" | "error";
  detalle?: string;
}

const FORMATOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/** El nombre del archivo es el código: "7501234567890.jpg" o "ABA-001.png". */
function codigoDeArchivo(nombre: string): string {
  return nombre
    .replace(/\.[^.]+$/, "")
    .replace(/[\s_]+/g, " ")
    .trim();
}

async function subirFoto(productoId: string, archivo: File): Promise<void> {
  const res = await fetch(`/api/t/productos/${productoId}/imagenes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${loadToken()}`, "Content-Type": archivo.type },
    body: archivo,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const cuerpo = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(cuerpo.message ?? "No se pudo guardar la foto");
  }
}

/**
 * Fotos del catálogo en lote: con miles de productos nadie va a abrir uno por uno.
 * Cada archivo se asigna por su nombre (código de barras, SKU o código), y al
 * final se dice exactamente cuáles no encontraron producto.
 */
export function FotosProductosPage() {
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [avance, setAvance] = useState({ hechas: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const puedeSubir = puede("productos.actualizar");

  async function procesar(archivos: File[]) {
    setTrabajando(true);
    setError(null);
    setResultados([]);
    setAvance({ hechas: 0, total: archivos.length });
    const salida: Resultado[] = [];
    for (const [indice, archivo] of archivos.entries()) {
      const codigo = codigoDeArchivo(archivo.name);
      try {
        if (!FORMATOS.includes(archivo.type))
          throw new Error("Formato no admitido; usa JPG, PNG o WebP");
        if (archivo.size > MAX_BYTES) throw new Error("Pesa más de 5 MB");
        const producto = await api<{ id: string }>(
          `/t/productos/buscar/${encodeURIComponent(codigo)}`,
        );
        await subirFoto(producto.id, archivo);
        salida.push({ archivo: archivo.name, codigo, estado: "subida" });
      } catch (e) {
        const esBusqueda = e instanceof ApiError && e.status === 404;
        salida.push({
          archivo: archivo.name,
          codigo,
          estado: esBusqueda ? "sin_coincidencia" : "error",
          detalle: esBusqueda
            ? "Ningún producto tiene ese código"
            : e instanceof Error
              ? e.message
              : "Error al subir",
        });
      }
      setAvance({ hechas: indice + 1, total: archivos.length });
      setResultados([...salida]);
    }
    setTrabajando(false);
  }

  const subidas = resultados.filter((r) => r.estado === "subida").length;
  const problemas = resultados.filter((r) => r.estado !== "subida");

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-bold text-2xl text-slate-800">Fotos de productos</h1>
      <p className="mb-6 text-slate-500 text-sm">
        Sube muchas fotos de una vez. Cada archivo se asigna al producto cuyo código coincida con el
        nombre del archivo: código de barras, SKU o código del producto.
      </p>

      <div className="gx-card mb-4">
        <p className="mb-3 text-slate-600 text-sm">
          Ejemplo: la foto de un globo con código <code>7501234567890</code> debe llamarse{" "}
          <code>7501234567890.jpg</code>. Formatos JPG, PNG o WebP, hasta 5 MB cada una.
        </p>
        {!puedeSubir && (
          <p className="text-slate-500 text-sm">No tienes permiso para editar productos.</p>
        )}
        {puedeSubir && (
          <label className="gx-label">
            Elegir fotos
            <input
              className="gx-input mt-1"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={trabajando}
              onChange={(e) => {
                const archivos = [...(e.target.files ?? [])];
                if (archivos.length) void procesar(archivos);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {trabajando && (
          <p className="mt-3 flex items-center gap-2 font-medium text-slate-700 text-sm">
            <ImagePlus size={16} /> Subiendo {avance.hechas} de {avance.total}…
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-danger text-sm">
            {error}
          </p>
        )}
      </div>

      {resultados.length > 0 && !trabajando && (
        <div className="gx-card">
          <h2 className="font-bold text-slate-800">
            {subidas} de {resultados.length} fotos quedaron en su producto
          </h2>
          {problemas.length === 0 ? (
            <p className="mt-1 text-ok text-sm">Todas encontraron su producto.</p>
          ) : (
            <>
              <p className="mt-1 mb-3 text-slate-600 text-sm">
                Estas no se subieron. Revisa que el nombre del archivo sea el código del producto.
              </p>
              <div className="gx-table-wrap">
                <table className="gx-table">
                  <thead>
                    <tr>
                      <th className="gx-th">Archivo</th>
                      <th className="gx-th">Código buscado</th>
                      <th className="gx-th">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problemas.map((r) => (
                      <tr key={r.archivo}>
                        <td className="gx-td">{r.archivo}</td>
                        <td className="gx-td font-medium">{r.codigo}</td>
                        <td className="gx-td text-slate-600">{r.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-3 text-slate-500 text-xs">
            Las fotos aparecen en tu tienda en línea en los productos publicados.
          </p>
        </div>
      )}
    </div>
  );
}
