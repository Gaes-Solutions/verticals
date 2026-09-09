import { useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";
import type { Categoria, Paged, Producto } from "../lib/types.js";

// Atajos del catálogo del SAT para el comercio mexicano típico. NO es el catálogo
// completo (son decenas de miles de claves): el campo acepta cualquier otra.
const CLAVES_PRODSERV = [
  { clave: "01010101", etiqueta: "01010101 — No existe en el catálogo (genérico)" },
  { clave: "50192700", etiqueta: "50192700 — Botanas y snacks" },
  { clave: "50181900", etiqueta: "50181900 — Pan y galletas" },
  { clave: "50202301", etiqueta: "50202301 — Refrescos y bebidas" },
  { clave: "50202306", etiqueta: "50202306 — Agua embotellada" },
  { clave: "50131600", etiqueta: "50131600 — Lácteos y quesos" },
  { clave: "50161500", etiqueta: "50161500 — Dulces y chocolates" },
  { clave: "50202200", etiqueta: "50202200 — Cerveza, vinos y licores" },
  { clave: "51000000", etiqueta: "51000000 — Medicamentos" },
  { clave: "53102500", etiqueta: "53102500 — Ropa" },
  { clave: "53111600", etiqueta: "53111600 — Calzado" },
  { clave: "47131800", etiqueta: "47131800 — Limpieza del hogar" },
  { clave: "53131600", etiqueta: "53131600 — Higiene personal" },
  { clave: "44121700", etiqueta: "44121700 — Papelería" },
  { clave: "43211500", etiqueta: "43211500 — Cómputo y electrónica" },
  { clave: "10101500", etiqueta: "10101500 — Alimento para mascotas" },
  { clave: "78102200", etiqueta: "78102200 — Servicio de envío" },
];

const CLAVES_UNIDAD = [
  { clave: "H87", etiqueta: "H87 — Pieza" },
  { clave: "KGM", etiqueta: "KGM — Kilogramo" },
  { clave: "GRM", etiqueta: "GRM — Gramo" },
  { clave: "LTR", etiqueta: "LTR — Litro" },
  { clave: "MLT", etiqueta: "MLT — Mililitro" },
  { clave: "MTR", etiqueta: "MTR — Metro" },
  { clave: "XBX", etiqueta: "XBX — Caja" },
  { clave: "XPK", etiqueta: "XPK — Paquete" },
  { clave: "XUN", etiqueta: "XUN — Unidad" },
  { clave: "E48", etiqueta: "E48 — Servicio" },
];

export function ProductosPage() {
  const [items, setItems] = useState<Producto[]>([]);
  const [query, setQuery] = useState("");
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState<Producto | "nuevo" | null>(null);
  const puedeCrear = puede("productos.crear");
  const puedeEditar = puede("productos.actualizar");
  const puedeArchivar = puede("productos.archivar");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api<Paged<Producto>>(
        `/t/productos?pageSize=50${query ? `&q=${encodeURIComponent(query)}` : ""}`,
      );
      setItems(res.items);
    } finally {
      setCargando(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  async function archivar(id: string) {
    if (!confirm("¿Archivar este producto?")) return;
    await api(`/t/productos/${id}`, { method: "DELETE" });
    void cargar();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
        {puedeCrear && (
          <button
            type="button"
            data-tour="prod-nuevo"
            onClick={() => setModal("nuevo")}
            className="rounded-lg bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark"
          >
            + Nuevo producto
          </button>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o SKU…"
        className="mb-4 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
      />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2 text-right">Precio</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Sin productos. Crea el primero.
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{p.nombre}</td>
                <td className="px-4 py-2 text-slate-500">{p.skuPadre}</td>
                <td className="px-4 py-2 text-right text-slate-700">
                  {p.variantes[0]
                    ? `$${Number.parseFloat(p.variantes[0].precioBase).toFixed(2)}`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  {puedeEditar && (
                    <button
                      type="button"
                      onClick={() => setModal(p)}
                      className="mr-3 text-brand hover:underline"
                    >
                      Editar
                    </button>
                  )}
                  {puedeArchivar && (
                    <button
                      type="button"
                      onClick={() => archivar(p.id)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      Archivar
                    </button>
                  )}
                  {!puedeEditar && !puedeArchivar && <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <ProductoModal
          producto={modal === "nuevo" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ProductoModal({
  producto,
  onClose,
  onSaved,
}: {
  producto: Producto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editando = producto !== null;
  // Precio/código se editan sobre la variante base; solo para productos de una variante.
  const editaPrecio = !editando || (producto?.variantes.length ?? 0) <= 1;
  const [sku, setSku] = useState(producto?.variantes[0]?.sku ?? producto?.skuPadre ?? "");
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [precioBase, setPrecioBase] = useState(producto?.variantes[0]?.precioBase ?? "");
  const [stockInicial, setStockInicial] = useState("");
  const [aplicaIva, setAplicaIva] = useState(producto?.aplicaIva ?? true);
  const [aplicaIeps, setAplicaIeps] = useState(producto?.aplicaIeps ?? false);
  const [tasaIeps, setTasaIeps] = useState(producto?.tasaIeps ?? "");
  const [requiresBalanza, setRequiresBalanza] = useState(producto?.requiresBalanza ?? false);
  const [claveSat, setClaveSat] = useState(producto?.claveSat ?? "");
  const [claveUnidadSat, setClaveUnidadSat] = useState(producto?.claveUnidadSat ?? "H87");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState(producto?.categoriaId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Categoria[] | Paged<Categoria>>("/t/categorias")
      .then((r) => setCategorias(Array.isArray(r) ? r : r.items))
      .catch(() => setCategorias([]));
  }, []);

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const impuestos = {
        aplicaIva,
        aplicaIeps,
        requiresBalanza,
        ...(aplicaIeps && tasaIeps ? { tasaIeps } : {}),
        // Sin estas claves el SAT no acepta el concepto: facturar responde 409.
        ...(claveSat.trim() ? { claveSat: claveSat.trim() } : {}),
        ...(claveUnidadSat.trim() ? { claveUnidadSat: claveUnidadSat.trim() } : {}),
      };
      if (editando && producto) {
        await api(`/t/productos/${producto.id}`, {
          method: "PATCH",
          body: {
            nombre,
            ...impuestos,
            ...(categoriaId ? { categoriaId } : {}),
            ...(editaPrecio ? { precioBase, sku } : {}),
          },
        });
      } else {
        const creado = await api<Producto>("/t/productos", {
          body: {
            skuPadre: sku,
            nombre,
            precioBase,
            tasaIva: "16",
            ...impuestos,
            ...(categoriaId ? { categoriaId } : {}),
          },
        });
        // Existencias iniciales (opcional): se dan de alta en la sucursal principal.
        const nStock = Number(stockInicial);
        const varianteId = creado.variantes[0]?.id;
        if (nStock > 0 && varianteId) {
          const sucursales = await api<{ id: string }[] | Paged<{ id: string }>>("/t/sucursales")
            .then((r) => (Array.isArray(r) ? r : r.items))
            .catch(() => [] as { id: string }[]);
          const sucursalId = sucursales[0]?.id;
          if (sucursalId) {
            await api("/t/inventario/ajustes", {
              body: {
                varianteId,
                sucursalId,
                tipo: "ajuste_positivo",
                cantidad: stockInicial,
                motivo: "Stock inicial",
              },
            }).catch(() => undefined);
          }
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {editando ? "Editar producto" : "Nuevo producto"}
        </h2>
        <div className="space-y-3">
          <Field label="Nombre *">
            <input
              data-tour="prod-f-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            />
          </Field>
          {editaPrecio && (
            <Field label="Precio de venta (IVA incluido) *">
              <input
                type="number"
                step="0.01"
                data-tour="prod-f-precio"
                value={precioBase}
                onChange={(e) => setPrecioBase(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Field>
          )}
          {editaPrecio && (
            <Field label="SKU / código de barras *">
              <input
                data-tour="prod-f-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ej. 7501234567890 — para escanear en caja"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Field>
          )}
          {!editando && (
            <Field label="Existencias iniciales (opcional)">
              <input
                type="number"
                min="0"
                step="1"
                value={stockInicial}
                onChange={(e) => setStockInicial(e.target.value)}
                placeholder="Cuántas piezas tienes hoy. Puedes dejarlo vacío."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Field>
          )}
          <Field label="Categoría">
            <select
              value={categoriaId ?? ""}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-700 text-sm">Datos para facturar (SAT)</p>
            <p className="mb-3 text-slate-500 text-xs">
              Obligatorios para emitir factura de este producto. Si no facturas, puedes dejarlos
              como están.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Clave del producto">
                <input
                  list="claves-prodserv-sat"
                  value={claveSat}
                  onChange={(e) => setClaveSat(e.target.value)}
                  placeholder="Ej. 50192700"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
                />
                <datalist id="claves-prodserv-sat">
                  {CLAVES_PRODSERV.map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.etiqueta}
                    </option>
                  ))}
                </datalist>
              </Field>
              <Field label="Unidad">
                <input
                  list="claves-unidad-sat"
                  value={claveUnidadSat}
                  onChange={(e) => setClaveUnidadSat(e.target.value)}
                  placeholder="H87"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
                />
                <datalist id="claves-unidad-sat">
                  {CLAVES_UNIDAD.map((c) => (
                    <option key={c.clave} value={c.clave}>
                      {c.etiqueta}
                    </option>
                  ))}
                </datalist>
              </Field>
            </div>
            <p className="mt-2 text-slate-500 text-xs">
              La lista trae las más usadas. Puedes escribir cualquier otra clave del catálogo del
              SAT; si no encuentras la del producto, usa 01010101.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={aplicaIva}
              onChange={(e) => setAplicaIva(e.target.checked)}
            />
            Aplica IVA (16%)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={aplicaIeps}
              onChange={(e) => setAplicaIeps(e.target.checked)}
            />
            Aplica IEPS
          </label>
          {aplicaIeps && (
            <Field label="Tasa IEPS (%)">
              <input
                type="number"
                step="0.01"
                value={tasaIeps ?? ""}
                onChange={(e) => setTasaIeps(e.target.value)}
                placeholder="Ej. 8, 26.5, 160"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
              />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={requiresBalanza}
              onChange={(e) => setRequiresBalanza(e.target.checked)}
            />
            Se vende por peso (balanza)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-tour="prod-f-guardar"
            onClick={guardar}
            disabled={guardando || !nombre || (editaPrecio && (!sku || !precioBase))}
            className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// <label> y no <div>: envolver el control asocia la etiqueta con él, así el
// lector de pantalla la anuncia y tocar el texto enfoca el campo.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // La asociación es real, pero llega por children y la regla estática no puede
    // verla: las pruebas de navegador localizan estos campos por su etiqueta.
    // biome-ignore lint/a11y/noLabelWithoutControl: el control viene en children
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
