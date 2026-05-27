import { type CatalogoResponse, api } from "@/lib/api";
import Link from "next/link";

function precioDe(p: CatalogoResponse["items"][number]): string {
  const precio = p.precioPublicoOverride ?? p.producto.variantes[0]?.precioBase ?? "0";
  return `$${Number(precio).toFixed(2)}`;
}

export const revalidate = 300;

export default async function CatalogoPage() {
  let data: CatalogoResponse;
  try {
    data = await api<CatalogoResponse>("/tienda/catalogo?pageSize=24", { revalidate: 300 });
  } catch (err) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-6 text-red-700">
        <h1 className="font-bold">No se pudo cargar el catálogo</h1>
        <p className="mt-2 text-sm">{err instanceof Error ? err.message : "Error desconocido"}</p>
        <p className="mt-2 text-sm text-gray-600">
          Verifica que la API esté corriendo y las credenciales de la tienda configuradas.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Catálogo</h1>
      {data.items.length === 0 ? (
        <p className="text-gray-500">Aún no hay productos publicados.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {data.items.map((p) => (
            <Link
              key={p.id}
              href={`/producto/${p.slugSeo}`}
              className="group rounded-lg border bg-white p-4 transition hover:shadow-md"
            >
              <div className="mb-3 flex aspect-square items-center justify-center rounded bg-gray-100 text-4xl">
                {p.fotosArray[0] ? (
                  <img
                    src={p.fotosArray[0]}
                    alt={p.tituloPublico}
                    className="h-full w-full rounded object-cover"
                  />
                ) : (
                  "📦"
                )}
              </div>
              <h2 className="line-clamp-2 text-sm font-medium group-hover:text-marca">
                {p.tituloPublico}
              </h2>
              {p.categoriaPublica && (
                <p className="mt-1 text-xs text-gray-400">{p.categoriaPublica.nombre}</p>
              )}
              <p className="mt-2 font-bold text-marca">{precioDe(p)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
