import { useCallback, useEffect, useState } from "react";
import { ApiError, api, esSuperadmin } from "../lib/api.js";

type Tab = "planes" | "cupones";

interface Plan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  description: string | null;
  tierOrder: number;
  isPublic: boolean;
  active: boolean;
}

interface Coupon {
  id: string;
  code: string;
  name: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
}

const DURACION: Record<string, string> = {
  once: "Una vez",
  repeating: "Recurrente",
  forever: "Siempre",
};

function pesos(cents: number, moneda = "MXN"): string {
  return `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${moneda}`;
}
function descuentoTxt(c: Coupon): string {
  return c.discountType === "percent"
    ? `${c.discountValue}%`
    : pesos(c.discountValue, c.currency ?? "MXN");
}
function fecha(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("es-MX") : "—";
}

export function CatalogoPage() {
  const [tab, setTab] = useState<Tab>("planes");
  const tabs: { key: Tab; label: string }[] = [
    { key: "planes", label: "Planes" },
    { key: "cupones", label: "Cupones" },
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 font-bold text-2xl text-slate-800">Planes y cupones</h1>
      <div className="mb-5 flex gap-2 border-slate-200 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 font-medium text-sm ${
              tab === t.key
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "planes" ? <PlanesTab /> : <CuponesTab />}
    </div>
  );
}

// ── Planes ───────────────────────────────────────────────────────────────────

function PlanesTab() {
  const [items, setItems] = useState<Plan[]>([]);
  const [editando, setEditando] = useState<Plan | "nuevo" | null>(null);
  const puede = esSuperadmin();

  const cargar = useCallback(() => {
    api<Plan[]>("/admin/catalogo/planes")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(() => cargar(), [cargar]);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {puede && (
          <button type="button" onClick={() => setEditando("nuevo")} className="gx-btn-primary">
            + Nuevo plan
          </button>
        )}
      </div>
      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Plan</th>
              <th className="gx-th">Código</th>
              <th className="gx-th text-right">Precio</th>
              <th className="gx-th">Público</th>
              <th className="gx-th">Estado</th>
              {puede && <th className="gx-th" />}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td className="gx-td font-medium">{p.name}</td>
                <td className="gx-td text-slate-500">{p.code}</td>
                <td className="gx-td text-right">{pesos(p.priceCents, p.currency)}</td>
                <td className="gx-td">{p.isPublic ? "Sí" : "No"}</td>
                <td className="gx-td">
                  <span className={p.active ? "gx-badge-ok" : "gx-badge"}>
                    {p.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                {puede && (
                  <td className="gx-td text-right">
                    <button
                      type="button"
                      onClick={() => setEditando(p)}
                      className="font-semibold text-brand text-sm hover:underline"
                    >
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={puede ? 6 : 5}>
                  Sin planes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <PlanModal
          plan={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onDone={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function PlanModal({
  plan,
  onClose,
  onDone,
}: {
  plan: Plan | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const editar = plan !== null;
  const [code, setCode] = useState(plan?.code ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [precio, setPrecio] = useState(plan ? String(plan.priceCents / 100) : "");
  const [currency, setCurrency] = useState(plan?.currency ?? "MXN");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [tierOrder, setTierOrder] = useState(String(plan?.tierOrder ?? 0));
  const [isPublic, setIsPublic] = useState(plan?.isPublic ?? true);
  const [active, setActive] = useState(plan?.active ?? true);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    const priceCents = Math.round(Number(precio) * 100);
    if (!name.trim() || Number.isNaN(priceCents) || priceCents < 0) {
      setErr("Nombre y precio válidos son obligatorios");
      return;
    }
    if (!editar && !/^[a-z0-9_-]{2,40}$/.test(code)) {
      setErr("Código: minúsculas, números, - o _ (2-40)");
      return;
    }
    setGuardando(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        priceCents,
        currency,
        description: description.trim() || null,
        tierOrder: Number(tierOrder) || 0,
        isPublic,
        active,
      };
      if (editar && plan) {
        await api(`/admin/catalogo/planes/${plan.id}`, { method: "PATCH", body: payload });
      } else {
        await api("/admin/catalogo/planes", { body: { code, ...payload } });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-4 font-bold text-lg text-slate-800">
          {editar ? "Editar plan" : "Nuevo plan"}
        </h2>
        <div className="space-y-3">
          {!editar && (
            <Field label="Código (identificador, va en el alta de clientes)">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="gx-input"
                placeholder="pro"
              />
            </Field>
          )}
          <Field label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)} className="gx-input" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Precio (por mes)">
              <input
                type="number"
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="gx-input"
              />
            </Field>
            <Field label="Moneda">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="gx-input"
              >
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            </Field>
            <Field label="Orden">
              <input
                type="number"
                value={tierOrder}
                onChange={(e) => setTierOrder(e.target.value)}
                className="gx-input"
              />
            </Field>
          </div>
          <Field label="Descripción (opcional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="gx-input"
            />
          </Field>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-slate-700 text-sm">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Público (visible en pricing)
            </label>
            <label className="flex items-center gap-2 text-slate-700 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Activo
            </label>
          </div>
          {err && <p className="text-danger text-sm">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="gx-btn-primary">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cupones ──────────────────────────────────────────────────────────────────

function CuponesTab() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [editando, setEditando] = useState<Coupon | "nuevo" | null>(null);
  const puede = esSuperadmin();

  const cargar = useCallback(() => {
    api<Coupon[]>("/admin/catalogo/cupones")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  useEffect(() => cargar(), [cargar]);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {puede && (
          <button type="button" onClick={() => setEditando("nuevo")} className="gx-btn-primary">
            + Nuevo cupón
          </button>
        )}
      </div>
      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Código</th>
              <th className="gx-th">Nombre</th>
              <th className="gx-th text-right">Descuento</th>
              <th className="gx-th">Duración</th>
              <th className="gx-th text-right">Usos</th>
              <th className="gx-th">Vigencia</th>
              <th className="gx-th">Estado</th>
              {puede && <th className="gx-th" />}
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="gx-td font-medium">{c.code}</td>
                <td className="gx-td">{c.name}</td>
                <td className="gx-td text-right font-semibold">{descuentoTxt(c)}</td>
                <td className="gx-td">{DURACION[c.duration] ?? c.duration}</td>
                <td className="gx-td text-right">
                  {c.timesRedeemed}
                  {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ""}
                </td>
                <td className="gx-td text-slate-500 text-xs">
                  {fecha(c.validFrom)} – {fecha(c.validUntil)}
                </td>
                <td className="gx-td">
                  <span className={c.isActive ? "gx-badge-ok" : "gx-badge"}>
                    {c.isActive ? "Activo" : "Inactivo"}
                  </span>
                </td>
                {puede && (
                  <td className="gx-td text-right">
                    <button
                      type="button"
                      onClick={() => setEditando(c)}
                      className="font-semibold text-brand text-sm hover:underline"
                    >
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={puede ? 8 : 7}>
                  Sin cupones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <CuponModal
          coupon={editando === "nuevo" ? null : editando}
          onClose={() => setEditando(null)}
          onDone={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function CuponModal({
  coupon,
  onClose,
  onDone,
}: {
  coupon: Coupon | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const editar = coupon !== null;
  const [code, setCode] = useState(coupon?.code ?? "");
  const [name, setName] = useState(coupon?.name ?? "");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(
    coupon?.discountType ?? "percent",
  );
  const [valor, setValor] = useState(
    coupon
      ? String(coupon.discountType === "fixed" ? coupon.discountValue / 100 : coupon.discountValue)
      : "",
  );
  const [currency, setCurrency] = useState(coupon?.currency ?? "MXN");
  const [duration, setDuration] = useState(coupon?.duration ?? "once");
  const [durationInMonths, setDurationInMonths] = useState(
    coupon?.durationInMonths ? String(coupon.durationInMonths) : "",
  );
  const [maxRedemptions, setMaxRedemptions] = useState(
    coupon?.maxRedemptions ? String(coupon.maxRedemptions) : "",
  );
  const [validUntil, setValidUntil] = useState(
    coupon?.validUntil ? coupon.validUntil.slice(0, 10) : "",
  );
  const [isActive, setIsActive] = useState(coupon?.isActive ?? true);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    const raw = Number(valor);
    if (!name.trim() || Number.isNaN(raw) || raw <= 0) {
      setErr("Nombre y valor válidos son obligatorios");
      return;
    }
    if (!editar && !/^[A-Za-z0-9_-]{2,40}$/.test(code)) {
      setErr("Código inválido (2-40, letras/números/-/_)");
      return;
    }
    const discountValue = discountType === "fixed" ? Math.round(raw * 100) : Math.round(raw);
    if (discountType === "percent" && (discountValue < 1 || discountValue > 100)) {
      setErr("El porcentaje debe estar entre 1 y 100");
      return;
    }
    setGuardando(true);
    setErr(null);
    try {
      const payload = {
        name: name.trim(),
        discountType,
        discountValue,
        duration,
        isActive,
        ...(discountType === "fixed" ? { currency } : {}),
        ...(duration === "repeating" && durationInMonths
          ? { durationInMonths: Number(durationInMonths) }
          : {}),
        ...(maxRedemptions ? { maxRedemptions: Number(maxRedemptions) } : {}),
        ...(validUntil ? { validUntil: new Date(`${validUntil}T23:59:59`).toISOString() } : {}),
      };
      if (editar && coupon) {
        await api(`/admin/catalogo/cupones/${coupon.id}`, { method: "PATCH", body: payload });
      } else {
        await api("/admin/catalogo/cupones", { body: { code, ...payload } });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-4 font-bold text-lg text-slate-800">
          {editar ? "Editar cupón" : "Nuevo cupón"}
        </h2>
        <div className="space-y-3">
          {!editar && (
            <Field label="Código (lo que teclea el cliente)">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="gx-input"
                placeholder="BIENVENIDA20"
              />
            </Field>
          )}
          <Field label="Nombre interno">
            <input value={name} onChange={(e) => setName(e.target.value)} className="gx-input" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Tipo">
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
                className="gx-input"
              >
                <option value="percent">Porcentaje</option>
                <option value="fixed">Monto fijo</option>
              </select>
            </Field>
            <Field label={discountType === "percent" ? "Porcentaje" : "Monto"}>
              <input
                type="number"
                step={discountType === "percent" ? "1" : "0.01"}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="gx-input"
              />
            </Field>
            {discountType === "fixed" && (
              <Field label="Moneda">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="gx-input"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Duración">
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="gx-input"
              >
                {Object.entries(DURACION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            {duration === "repeating" && (
              <Field label="Meses">
                <input
                  type="number"
                  value={durationInMonths}
                  onChange={(e) => setDurationInMonths(e.target.value)}
                  className="gx-input"
                />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Máx. usos (opcional)">
              <input
                type="number"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                className="gx-input"
              />
            </Field>
            <Field label="Vence (opcional)">
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="gx-input"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-slate-700 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Activo
          </label>
          {err && <p className="text-danger text-sm">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="gx-btn-primary">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block font-medium text-slate-600 text-sm">{label}</span>
      {children}
    </div>
  );
}
