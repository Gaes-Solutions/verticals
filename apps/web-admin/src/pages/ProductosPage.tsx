import { useCallback, useEffect, useState } from "react";
import { FotosDeProducto } from "../components/FotosDeProducto.js";
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

// Debe coincidir con el enum UnidadMedida del API (packages/db). Es lo que ve
// el comprador junto al precio ("/ kg", "por pieza"…).
const UNIDADES_MEDIDA = [
  { valor: "pza", etiqueta: "Pieza" },
  { valor: "kg", etiqueta: "Kilogramo" },
  { valor: "g", etiqueta: "Gramo" },
  { valor: "lt", etiqueta: "Litro" },
  { valor: "ml", etiqueta: "Mililitro" },
  { valor: "m", etiqueta: "Metro" },
  { valor: "m2", etiqueta: "Metro cuadrado" },
  { valor: "hora", etiqueta: "Hora" },
  { valor: "servicio", etiqueta: "Servicio" },
] as const;

export function ProductosPage() {
  const [items, setItems] = useState<Producto[]>([]);
  const [query, setQuery] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avisoStock, setAvisoStock] = useState<string | null>(null);
  const [modal, setModal] = useState<Producto | "nuevo" | null>(null);
  const [aArchivar, setAArchivar] = useState<Producto | null>(null);
  const puedeCrear = puede("productos.crear");
  const puedeEditar = puede("productos.actualizar");
  const puedeArchivar = puede("productos.archivar");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api<Paged<Producto>>(
        `/t/productos?pageSize=50${query ? `&q=${encodeURIComponent(query)}` : ""}`,
      );
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los productos");
    } finally {
      setCargando(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  async function archivar(p: Producto) {
    setAArchivar(null);
    try {
      await api(`/t/productos/${p.id}`, { method: "DELETE" });
      void cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo archivar el producto");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
        {puedeCrear && (
          <button
            type="button"
            data-tour="prod-nuevo"
            onClick={() => setModal("nuevo")}
            className="gx-btn-primary"
          >
            + Nuevo producto
          </button>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o SKU…"
        className="gx-input mb-4 max-w-md"
      />
      {avisoStock && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p>{avisoStock}</p>
          <button
            type="button"
            className="gx-btn-secondary mt-2"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("gaes-nav", { detail: "inventario" }))
            }
          >
            Revisar inventario
          </button>
        </div>
      )}

      {error && !cargando && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-danger-light p-3 text-danger text-sm">
          <span>{error}</span>
          <button type="button" onClick={() => void cargar()} className="gx-btn-danger">
            Reintentar
          </button>
        </div>
      )}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Producto</th>
              <th className="gx-th">SKU</th>
              <th className="gx-th text-right">Precio</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td className="gx-td text-slate-400" colSpan={4}>
                  Cargando…
                </td>
              </tr>
            )}
            {!cargando && !error && items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={4}>
                  Sin productos. Crea el primero.
                </td>
              </tr>
            )}
            {!cargando &&
              items.map((p) => (
                <tr key={p.id}>
                  <td className="gx-td font-medium">{p.nombre}</td>
                  <td className="gx-td text-slate-500">{p.skuPadre}</td>
                  <td className="gx-td text-right text-slate-700">
                    {p.variantes[0]
                      ? `$${Number.parseFloat(p.variantes[0].precioBase).toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="gx-td text-right">
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
                        onClick={() => setAArchivar(p)}
                        className="gx-btn-danger"
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
          onSaved={(aviso) => {
            if (aviso) setAvisoStock(aviso);
            setModal(null);
            void cargar();
          }}
        />
      )}

      {aArchivar && (
        <div className="gx-modal-overlay">
          <div className="gx-modal-panel">
            <h2 className="mb-2 font-bold text-lg text-slate-800">Archivar producto</h2>
            <p className="mb-4 text-slate-500 text-sm">
              ¿Archivar “{aArchivar.nombre}”? Desaparecerá del catálogo y de la venta, pero se
              conserva su historial.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAArchivar(null)} className="gx-btn-secondary">
                Volver
              </button>
              <button type="button" onClick={() => archivar(aArchivar)} className="gx-btn-danger">
                Sí, archivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function catalogoInicial(producto: Producto | null) {
  const variante = producto?.variantes[0];
  return {
    sku: variante?.sku ?? producto?.skuPadre ?? "",
    nombre: producto?.nombre ?? "",
    precioBase: variante?.precioBase ?? "",
    categoriaId: producto?.categoriaId ?? "",
    editaPrecio: !producto || producto.variantes.length <= 1,
  };
}
function impuestosIniciales(producto: Producto | null) {
  return {
    aplicaIva: producto?.aplicaIva ?? true,
    aplicaIeps: producto?.aplicaIeps ?? false,
    tasaIeps: producto?.tasaIeps ?? "",
    requiresBalanza: producto?.requiresBalanza ?? false,
    unidadMedida: producto?.unidadMedida ?? "pza",
    claveSat: producto?.claveSat ?? "",
    claveUnidadSat: producto?.claveUnidadSat ?? "H87",
  };
}
function validarCamposProducto(
  nombre: string,
  sku: string,
  precio: string,
  stock: string,
  editaPrecio: boolean,
) {
  const stockValido = stock === "" || (Number.isFinite(Number(stock)) && Number(stock) >= 0);
  const precioValido = precio !== "" && Number.isFinite(Number(precio)) && Number(precio) >= 0;
  return {
    stockValido,
    datosValidos:
      Boolean(nombre.trim()) &&
      (!editaPrecio || (Boolean(sku.trim()) && precioValido)) &&
      stockValido,
  };
}
function datosComunesProducto(input: {
  nombre: string;
  categoriaId: string;
  aplicaIva: boolean;
  aplicaIeps: boolean;
  tasaIeps: string;
  requiresBalanza: boolean;
  unidadMedida: string;
  claveSat: string;
  claveUnidadSat: string;
}) {
  return {
    nombre: input.nombre.trim(),
    aplicaIva: input.aplicaIva,
    aplicaIeps: input.aplicaIeps,
    requiresBalanza: input.requiresBalanza,
    unidadMedida: input.unidadMedida,
    ...(input.aplicaIeps && input.tasaIeps ? { tasaIeps: input.tasaIeps } : {}),
    ...(input.claveSat.trim() ? { claveSat: input.claveSat.trim() } : {}),
    ...(input.claveUnidadSat.trim() ? { claveUnidadSat: input.claveUnidadSat.trim() } : {}),
    ...(input.categoriaId ? { categoriaId: input.categoriaId } : {}),
  };
}

function ProductoModal({
  producto,
  onClose,
  onSaved,
}: {
  producto: Producto | null;
  onClose: () => void;
  onSaved: (aviso?: string) => void;
}) {
  const editando = producto !== null;
  // Precio/código se editan sobre la variante base; solo para productos de una variante.
  const catalogo = catalogoInicial(producto);
  const inicial = impuestosIniciales(producto);
  const editaPrecio = catalogo.editaPrecio;
  const [sku, setSku] = useState(catalogo.sku);
  const [nombre, setNombre] = useState(catalogo.nombre);
  const [precioBase, setPrecioBase] = useState(catalogo.precioBase);
  const [stockInicial, setStockInicial] = useState("");
  const puedeStock = puede("inventario.leer") && puede("inventario.ajustar");
  const { stockValido, datosValidos } = validarCamposProducto(
    nombre,
    sku,
    precioBase,
    stockInicial,
    editaPrecio,
  );
  const [aplicaIva, setAplicaIva] = useState(inicial.aplicaIva);
  const [aplicaIeps, setAplicaIeps] = useState(inicial.aplicaIeps);
  const [tasaIeps, setTasaIeps] = useState(inicial.tasaIeps);
  const [requiresBalanza, setRequiresBalanza] = useState(inicial.requiresBalanza);
  const [unidadMedida, setUnidadMedida] = useState(inicial.unidadMedida);
  const [claveSat, setClaveSat] = useState(inicial.claveSat);
  const [claveUnidadSat, setClaveUnidadSat] = useState(inicial.claveUnidadSat);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState(catalogo.categoriaId);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<Categoria[] | Paged<Categoria>>("/t/categorias")
      .then((r) => setCategorias(Array.isArray(r) ? r : r.items))
      .catch(() => setCategorias([]));
  }, []);

  const bloqueado = guardando || !datosValidos;
  async function guardar() {
    if (bloqueado) return;
    setError(null);
    setGuardando(true);
    try {
      const comunes = datosComunesProducto({
        nombre,
        categoriaId,
        aplicaIva,
        aplicaIeps,
        tasaIeps,
        requiresBalanza,
        unidadMedida,
        claveSat,
        claveUnidadSat,
      });
      if (producto) {
        await api(`/t/productos/${producto.id}`, {
          method: "PATCH",
          body: {
            ...comunes,
            ...(editaPrecio ? { precioBase, sku: sku.trim() } : {}),
          },
        });
      } else {
        const creado = await api<Producto>("/t/productos", {
          body: {
            ...comunes,
            skuPadre: sku.trim(),
            precioBase,
            tasaIva: "16",
          },
        });
        // Existencias iniciales (opcional): se dan de alta en la sucursal principal.
        if (!(await registrarExistenciasIniciales(creado, stockInicial))) {
          onSaved(
            `El producto «${nombre}» ya está creado. No se confirmaron sus existencias iniciales. Revisa Inventario antes de capturarlas de nuevo para evitar duplicarlas.`,
          );
          return;
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
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel max-w-md">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          {editando ? "Editar producto" : "Nuevo producto"}
        </h2>
        <div className="space-y-3">
          <Field label="Nombre *">
            <input
              data-tour="prod-f-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="gx-input"
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
                className="gx-input"
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
                className="gx-input"
              />
            </Field>
          )}
          {!editando && puedeStock && (
            <Field label="Existencias iniciales (opcional)">
              <input
                type="number"
                min="0"
                step="1"
                value={stockInicial}
                onChange={(e) => setStockInicial(e.target.value)}
                placeholder="Cuántas piezas tienes hoy. Puedes dejarlo vacío."
                className="gx-input"
              />
            </Field>
          )}
          <Field label="Categoría">
            <select
              value={categoriaId ?? ""}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="gx-input"
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Field>
          {editando && producto && <FotosDeProducto productoId={producto.id} />}
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
                  className="gx-input"
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
                  className="gx-input"
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
                className="gx-input"
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
          <Field label="Unidad de medida de venta">
            <select
              value={unidadMedida}
              onChange={(e) => setUnidadMedida(e.target.value)}
              className="gx-input"
            >
              {UNIDADES_MEDIDA.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.etiqueta}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-slate-500 text-xs">
            Es como se vende y se muestra el precio en la tienda ("$45.00 / kg", "por pieza").
          </p>
          {!stockValido && (
            <p role="alert" className="text-sm text-danger">
              Las existencias iniciales deben ser un número mayor o igual a cero.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary flex-1">
            Cancelar
          </button>
          <button
            type="button"
            data-tour="prod-f-guardar"
            onClick={guardar}
            disabled={bloqueado}
            className="gx-btn-primary flex-1 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

async function registrarExistenciasIniciales(
  producto: Producto,
  cantidad: string,
): Promise<boolean> {
  if (Number(cantidad) <= 0) return true;
  try {
    const varianteId = producto.variantes[0]?.id;
    if (!varianteId) return false;
    const respuesta = await api<{ id: string }[] | Paged<{ id: string }>>("/t/sucursales/opciones");
    const sucursalId = (Array.isArray(respuesta) ? respuesta : respuesta.items)[0]?.id;
    if (!sucursalId) return false;
    await api("/t/inventario/ajustes", {
      body: { varianteId, sucursalId, tipo: "ajuste_positivo", cantidad, motivo: "Stock inicial" },
    });
    return true;
  } catch {
    return false;
  }
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
