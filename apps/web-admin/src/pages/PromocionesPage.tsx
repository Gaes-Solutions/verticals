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
          <button type="button" onClick={() => setNuevo(true)} className="gx-btn-primary">
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
];

function NuevaPromoModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("descuento_pct");
  const [valor, setValor] = useState("");
  const [compra, setCompra] = useState("3");
  const [paga, setPaga] = useState("2");
  const [lleva, setLleva] = useState("3");
  const [inicio, setInicio] = useState(ahoraLocalInput);
  const [activar, setActivar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const usaValor =
    tipo === "descuento_pct" || tipo === "descuento_monto" || tipo === "precio_especial";
  const usaNxM = tipo === "tres_x_n";
  const usaXY = tipo === "compra_x_lleva_y";
  const valido =
    !!nombre &&
    (usaValor ? !!valor : usaNxM ? Number(compra) > Number(paga) : Number(lleva) > Number(compra));

  function buildAcciones(): Record<string, number> {
    if (usaNxM) return { compra: Number(compra), paga: Number(paga) };
    if (usaXY) return { compra: Number(compra), lleva: Number(lleva) };
    return { valor: Number(valor) };
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
          canales: ["todos"],
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
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="gx-input"
            placeholder="Ej. Buen Fin"
            required
          />
        </label>

        <label className="mb-3 block">
          <span className="gx-label">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="gx-input">
            {TIPOS_CREABLES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

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
          <button type="submit" disabled={guardando || !valido} className="gx-btn-primary">
            {guardando ? "Creando…" : "Crear promoción"}
          </button>
        </div>
      </form>
    </div>
  );
}
