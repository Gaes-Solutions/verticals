import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api, puede } from "../lib/api.js";

interface PromoItem {
  id: string;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  status: string;
  acciones: { valor?: number };
  vigenciaInicio: string;
  vigenciaFin?: string | null;
  _count?: { aplicaciones: number };
}

const STATUS_BADGE: Record<string, string> = {
  draft: "gx-badge-info",
  programada: "gx-badge-info",
  activa: "gx-badge-ok",
  pausada: "gx-badge-warn",
  expirada: "gx-badge-info",
  cancelada: "gx-badge-danger",
};

const TIPO_LABEL: Record<string, string> = {
  descuento_pct: "Descuento %",
  descuento_monto: "Descuento $",
  precio_especial: "Precio especial",
  dos_x_uno: "2x1",
  tres_x_n: "3xN",
  compra_x_lleva_y: "Compra X lleva Y",
  regalo_con_compra: "Regalo con compra",
  escalonado_volumen: "Escalonado por volumen",
  happy_hour: "Happy hour",
  mxn: "Monto",
};

function resumenPromo(p: PromoItem): string {
  if (p.tipo === "descuento_pct") return `${p.acciones?.valor ?? 0}% de descuento`;
  return TIPO_LABEL[p.tipo] ?? p.tipo;
}

export function PromocionesPage() {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const gestiona = puede("promociones.gestionar");

  const cargar = useCallback(() => {
    setCargando(true);
    api<PromoItem[]>("/t/promociones")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function cambiarEstado(id: string, accion: "activar" | "pausar") {
    await api(`/t/promociones/${id}/${accion}`, { method: "POST" }).catch(() => undefined);
    cargar();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Promociones</h1>
          <p className="text-slate-500 text-sm">
            Descuentos automáticos que se aplican solos en la venta. Actívalas para que corran.
          </p>
        </div>
        {gestiona && (
          <button
            type="button"
            data-tour="promo-nuevo"
            onClick={() => setNuevo(true)}
            className="gx-btn-primary"
          >
            + Nueva promoción
          </button>
        )}
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Promoción</th>
              <th className="gx-th">Tipo</th>
              <th className="gx-th">Vigencia</th>
              <th className="gx-th">Usos</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={6}>
                  Cargando…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={6}>
                  Aún no hay promociones. Crea la primera con “+ Nueva promoción”.
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id}>
                  <td className="gx-td">
                    <div className="font-medium text-slate-800">{p.nombre}</div>
                    <div className="text-slate-400 text-xs">{resumenPromo(p)}</div>
                  </td>
                  <td className="gx-td text-slate-500">{TIPO_LABEL[p.tipo] ?? p.tipo}</td>
                  <td className="gx-td text-slate-500">
                    {new Date(p.vigenciaInicio).toLocaleDateString()}
                    {p.vigenciaFin ? ` – ${new Date(p.vigenciaFin).toLocaleDateString()}` : ""}
                  </td>
                  <td className="gx-td text-slate-500">{p._count?.aplicaciones ?? 0}</td>
                  <td className="gx-td">
                    <span className={STATUS_BADGE[p.status] ?? "gx-badge-info"}>{p.status}</span>
                  </td>
                  <td className="gx-td">
                    {gestiona && (
                      <div className="flex justify-end gap-2 text-sm">
                        {p.status === "activa" ? (
                          <button
                            type="button"
                            onClick={() => cambiarEstado(p.id, "pausar")}
                            className="text-amber-600 hover:underline"
                          >
                            Pausar
                          </button>
                        ) : (
                          p.status !== "expirada" &&
                          p.status !== "cancelada" && (
                            <button
                              type="button"
                              onClick={() => cambiarEstado(p.id, "activar")}
                              className="font-semibold text-brand hover:underline"
                            >
                              Activar
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nuevo && (
        <NuevaPromoModal
          onClose={() => setNuevo(false)}
          onDone={() => {
            setNuevo(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ahoraLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const TIPOS_CREABLES: { value: string; label: string; valorLabel?: string }[] = [
  { value: "descuento_pct", label: "Descuento %", valorLabel: "Descuento (%)" },
  {
    value: "descuento_monto",
    label: "Descuento $ por unidad",
    valorLabel: "Descuento por unidad ($)",
  },
  { value: "precio_especial", label: "Precio especial", valorLabel: "Precio final por unidad ($)" },
  { value: "tres_x_n", label: "NxM (ej. 3x2)" },
  { value: "compra_x_lleva_y", label: "Compra X lleva Y" },
  { value: "regalo_con_compra", label: "Regalo con compra" },
];

interface ProdMini {
  id: string;
  nombre: string;
}

function SelectorProductos({
  titulo,
  ayuda,
  seleccionados,
  onChange,
}: {
  titulo: string;
  ayuda: string;
  seleccionados: ProdMini[];
  onChange: (next: ProdMini[]) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProdMini[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      api<{ items: ProdMini[] }>(`/t/productos?q=${encodeURIComponent(term)}&pageSize=8`)
        .then((r) => setResultados(r.items ?? []))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function agregar(p: ProdMini) {
    if (!seleccionados.some((s) => s.id === p.id)) onChange([...seleccionados, p]);
    setQ("");
    setResultados([]);
  }

  return (
    <div>
      <span className="gx-label">{titulo}</span>
      <p className="mb-1 text-slate-400 text-xs">{ayuda}</p>
      {seleccionados.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {seleccionados.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 text-xs"
            >
              {p.nombre}
              <button
                type="button"
                onClick={() => onChange(seleccionados.filter((s) => s.id !== p.id))}
                className="text-slate-400 hover:text-danger"
                aria-label={`Quitar ${p.nombre}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="gx-input"
        placeholder="Buscar producto por nombre o SKU…"
      />
      {q.trim().length >= 2 && (
        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
          {buscando ? (
            <p className="px-3 py-2 text-slate-400 text-sm">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2 text-slate-400 text-sm">Sin resultados</p>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => agregar(p)}
                className="block w-full px-3 py-2 text-left text-slate-700 text-sm hover:bg-slate-50"
              >
                {p.nombre}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NuevaPromoModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("descuento_pct");
  const [valor, setValor] = useState("");
  const [compra, setCompra] = useState("3");
  const [paga, setPaga] = useState("2");
  const [lleva, setLleva] = useState("3");
  const [comprados, setComprados] = useState<ProdMini[]>([]);
  const [regalos, setRegalos] = useState<ProdMini[]>([]);
  const [cantReq, setCantReq] = useState("1");
  const [cantRegalo, setCantRegalo] = useState("1");
  const [descPct, setDescPct] = useState("100");
  const [inicio, setInicio] = useState(ahoraLocalInput);
  const [fin, setFin] = useState("");
  const [activar, setActivar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const usaValor =
    tipo === "descuento_pct" || tipo === "descuento_monto" || tipo === "precio_especial";
  const usaNxM = tipo === "tres_x_n";
  const usaXY = tipo === "compra_x_lleva_y";
  const usaRegalo = tipo === "regalo_con_compra";

  function reglaValida(): boolean {
    if (usaValor) return !!valor;
    if (usaNxM) return Number(compra) > Number(paga);
    if (usaXY) return Number(lleva) > Number(compra);
    if (usaRegalo) {
      return comprados.length > 0 && regalos.length > 0 && Number(cantReq) > 0;
    }
    return false;
  }
  const valido = !!nombre && reglaValida();

  function buildAcciones(): Record<string, number> {
    if (usaNxM) return { compra: Number(compra), paga: Number(paga) };
    if (usaXY) return { compra: Number(compra), lleva: Number(lleva) };
    if (usaRegalo) {
      return {
        cantidadRequerida: Number(cantReq),
        cantidadRegalo: Number(cantRegalo),
        descuentoPct: Number(descPct),
      };
    }
    return { valor: Number(valor) };
  }

  function buildProductos(): { productoId: string; rol: string }[] | undefined {
    if (!usaRegalo) return undefined;
    return [
      ...comprados.map((p) => ({ productoId: p.id, rol: "comprado" })),
      ...regalos.map((p) => ({ productoId: p.id, rol: "regalo" })),
    ];
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const promo = await api<{ id: string }>("/t/promociones", {
        body: {
          nombre,
          tipo,
          acciones: buildAcciones(),
          vigenciaInicio: new Date(inicio).toISOString(),
          ...(fin ? { vigenciaFin: new Date(fin).toISOString() } : {}),
          canales: ["todos"],
          ...(buildProductos() ? { productos: buildProductos() } : {}),
        },
      });
      if (activar) {
        await api(`/t/promociones/${promo.id}/activar`, { method: "POST" });
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al crear la promoción");
      setGuardando(false);
    }
  }

  const tipoActual = TIPOS_CREABLES.find((t) => t.value === tipo);

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Nueva promoción</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Aplica sobre todo el catálogo y se descuenta solo en la venta mientras esté activa.
        </p>

        <label className="mb-3 block">
          <span className="gx-label">Nombre</span>
          <input
            data-tour="promo-f-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="gx-input"
            placeholder="Ej. Buen Fin"
            required
          />
        </label>

        <label className="mb-3 block">
          <span className="gx-label">Tipo</span>
          <select
            data-tour="promo-f-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="gx-input"
          >
            {TIPOS_CREABLES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {usaRegalo && (
          <div className="mb-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <SelectorProductos
              titulo="Producto(s) que disparan el regalo"
              ayuda="El cliente debe comprarlos para ganar el regalo."
              seleccionados={comprados}
              onChange={setComprados}
            />
            <SelectorProductos
              titulo="Producto(s) de regalo"
              ayuda="Lo que se descuenta al cumplir la compra."
              seleccionados={regalos}
              onChange={setRegalos}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="gx-label">Compra (cantidad)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cantReq}
                  onChange={(e) => setCantReq(e.target.value)}
                  className="gx-input"
                />
              </label>
              <label className="block">
                <span className="gx-label">Regala (cantidad)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cantRegalo}
                  onChange={(e) => setCantRegalo(e.target.value)}
                  className="gx-input"
                />
              </label>
              <label className="block">
                <span className="gx-label">Descuento al regalo (%)</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={descPct}
                  onChange={(e) => setDescPct(e.target.value)}
                  className="gx-input"
                />
                <span className="text-slate-400 text-xs">Recomendado 100% (gratis)</span>
              </label>
            </div>
          </div>
        )}

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          {usaValor && (
            <label className="block">
              <span className="gx-label">{tipoActual?.valorLabel ?? "Valor"}</span>
              <input
                type="number"
                min="1"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="gx-input"
                required
              />
            </label>
          )}
          {(usaNxM || usaXY) && (
            <label className="block">
              <span className="gx-label">{usaXY ? "Paga (X)" : "Compra (N)"}</span>
              <input
                type="number"
                min="1"
                step="1"
                value={compra}
                onChange={(e) => setCompra(e.target.value)}
                className="gx-input"
              />
            </label>
          )}
          {usaNxM && (
            <label className="block">
              <span className="gx-label">Paga (M)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={paga}
                onChange={(e) => setPaga(e.target.value)}
                className="gx-input"
              />
            </label>
          )}
          {usaXY && (
            <label className="block">
              <span className="gx-label">Lleva (Y)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={lleva}
                onChange={(e) => setLleva(e.target.value)}
                className="gx-input"
              />
            </label>
          )}
          <label className="block">
            <span className="gx-label">Inicia</span>
            <input
              type="datetime-local"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="gx-input"
            />
          </label>
          <label className="block">
            <span className="gx-label">Termina (opcional)</span>
            <input
              type="datetime-local"
              value={fin}
              min={inicio}
              onChange={(e) => setFin(e.target.value)}
              className="gx-input"
            />
            <span className="mt-1 block text-slate-400 text-xs">
              Déjalo vacío si la promo no tiene fecha de término.
            </span>
          </label>
        </div>

        <label className="mb-3 flex items-center gap-2 text-slate-700 text-sm">
          <input type="checkbox" checked={activar} onChange={(e) => setActivar(e.target.checked)} />
          Activar de inmediato
        </label>

        {error && <p className="mb-3 text-danger text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button
            type="submit"
            data-tour="promo-f-crear"
            disabled={guardando || !valido}
            className="gx-btn-primary"
          >
            {guardando ? "Creando…" : "Crear promoción"}
          </button>
        </div>
      </form>
    </div>
  );
}
