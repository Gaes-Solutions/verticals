import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

type Tab = "partners" | "comisiones" | "payouts";

interface Partner {
  id: string;
  codigo: string;
  razonSocial: string;
  emailContacto: string;
  tipo: string;
  nivel: string;
  estado: string;
  isAcceptingNewReferrals: boolean;
  comisionPctOverride: string | null;
  _count?: { referrals: number; links: number; commissions: number };
}

interface Commission {
  id: string;
  periodoYyyymm: string;
  montoComision: string;
  porcentajeAplicado: string;
  moneda: string;
  estado: string;
  partner: { codigo: string; razonSocial: string } | null;
}

interface Payout {
  id: string;
  periodoYyyymm: string;
  montoTotal: string;
  montoNeto: string;
  moneda: string;
  metodoPago: string;
  estado: string;
  folioBancario: string | null;
  partner: { codigo: string; razonSocial: string } | null;
  _count?: { commissions: number };
}

const TIPO: Record<string, string> = {
  contador: "Contador",
  integrador: "Integrador",
  consultor: "Consultor",
  agencia: "Agencia",
  otro: "Otro",
};
const NIVEL: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  diamond: "Diamond",
};
const P_ESTADO: Record<string, string> = {
  invitado: "Invitado",
  activo: "Activo",
  pausado: "Pausado",
  terminado: "Terminado",
};
const C_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  pagada: "Pagada",
  rechazada: "Rechazada",
  disputada: "Disputada",
};
const METODO: Record<string, string> = {
  spei: "SPEI",
  paypal: "PayPal",
  stripe_connect: "Stripe Connect",
  otro: "Otro",
};

function money(v: string, moneda = "MXN"): string {
  return `$${Number(v).toLocaleString("es-MX", { minimumFractionDigits: 2 })} ${moneda}`;
}
function periodo(yyyymm: string): string {
  if (!/^\d{6}$/.test(yyyymm)) return yyyymm;
  return `${yyyymm.slice(4, 6)}/${yyyymm.slice(0, 4)}`;
}
function partnerBadge(estado: string): string {
  if (estado === "activo") return "gx-badge-ok";
  if (estado === "pausado") return "gx-badge-warn";
  if (estado === "terminado") return "gx-badge-danger";
  return "gx-badge-info";
}
function commissionBadge(estado: string): string {
  if (estado === "aprobada" || estado === "pagada") return "gx-badge-ok";
  if (estado === "rechazada") return "gx-badge-danger";
  if (estado === "disputada") return "gx-badge-warn";
  return "gx-badge-info";
}
function payoutBadge(estado: string): string {
  if (estado === "pagado") return "gx-badge-ok";
  if (estado === "fallido") return "gx-badge-danger";
  return "gx-badge-info";
}

export function PartnersPage() {
  const [tab, setTab] = useState<Tab>("partners");
  const tabs: { key: Tab; label: string }[] = [
    { key: "partners", label: "Partners" },
    { key: "comisiones", label: "Comisiones" },
    { key: "payouts", label: "Payouts" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 font-bold text-2xl text-slate-800">Partners</h1>
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
      {tab === "partners" && <PartnersTab />}
      {tab === "comisiones" && <ComisionesTab />}
      {tab === "payouts" && <PayoutsTab />}
    </div>
  );
}

// ── Tab: Partners ───────────────────────────────────────────────────────────

function PartnersTab() {
  const [items, setItems] = useState<Partner[]>([]);
  const [estado, setEstado] = useState("");
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Partner | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const qs = estado ? `?estado=${estado}` : "";
    api<Partner[]>(`/partners${qs}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [estado]);

  useEffect(() => cargar(), [cargar]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="gx-input w-auto"
        >
          <option value="">Todos los estados</option>
          {Object.entries(P_ESTADO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setCreando(true)} className="gx-btn-primary">
          + Nuevo partner
        </button>
      </div>
      {error && <p className="mb-3 text-danger text-sm">{error}</p>}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Código</th>
              <th className="gx-th">Razón social</th>
              <th className="gx-th">Tipo</th>
              <th className="gx-th">Nivel</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th text-right">Referidos</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td className="gx-td font-medium">{p.codigo}</td>
                <td className="gx-td">
                  {p.razonSocial}
                  <span className="block text-slate-400 text-xs">{p.emailContacto}</span>
                </td>
                <td className="gx-td">{TIPO[p.tipo] ?? p.tipo}</td>
                <td className="gx-td">{NIVEL[p.nivel] ?? p.nivel}</td>
                <td className="gx-td">
                  <span className={partnerBadge(p.estado)}>{P_ESTADO[p.estado] ?? p.estado}</span>
                </td>
                <td className="gx-td text-right">{p._count?.referrals ?? 0}</td>
                <td className="gx-td text-right">
                  <button
                    type="button"
                    onClick={() => setEditando(p)}
                    className="font-semibold text-brand text-sm hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={7}>
                  Sin partners.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creando && (
        <CrearPartnerModal
          onClose={() => setCreando(false)}
          onDone={() => {
            setCreando(false);
            setError(null);
            cargar();
          }}
        />
      )}
      {editando && (
        <EditarPartnerModal
          partner={editando}
          onClose={() => setEditando(null)}
          onDone={() => {
            setEditando(null);
            setError(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function CrearPartnerModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    codigo: "",
    razonSocial: "",
    emailContacto: "",
    tipo: "contador",
    telefonoContacto: "",
    rfc: "",
    ciudad: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set(k: keyof typeof f, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function guardar() {
    if (!f.codigo.trim() || !f.razonSocial.trim() || !f.emailContacto.trim()) {
      setErr("Código, razón social y correo son obligatorios");
      return;
    }
    setGuardando(true);
    setErr(null);
    try {
      await api("/partners", {
        body: {
          codigo: f.codigo.trim(),
          razonSocial: f.razonSocial.trim(),
          emailContacto: f.emailContacto.trim(),
          tipo: f.tipo,
          ...(f.telefonoContacto ? { telefonoContacto: f.telefonoContacto } : {}),
          ...(f.rfc ? { rfc: f.rfc.trim().toUpperCase() } : {}),
          ...(f.ciudad ? { ciudad: f.ciudad } : {}),
        },
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-4 font-bold text-lg text-slate-800">Nuevo partner</h2>
        <div className="space-y-3">
          <Field label="Código">
            <input
              value={f.codigo}
              onChange={(e) => set("codigo", e.target.value)}
              className="gx-input"
            />
          </Field>
          <Field label="Razón social">
            <input
              value={f.razonSocial}
              onChange={(e) => set("razonSocial", e.target.value)}
              className="gx-input"
            />
          </Field>
          <Field label="Correo de contacto">
            <input
              type="email"
              value={f.emailContacto}
              onChange={(e) => set("emailContacto", e.target.value)}
              className="gx-input"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tipo">
              <select
                value={f.tipo}
                onChange={(e) => set("tipo", e.target.value)}
                className="gx-input"
              >
                {Object.entries(TIPO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Teléfono (opcional)">
              <input
                value={f.telefonoContacto}
                onChange={(e) => set("telefonoContacto", e.target.value)}
                className="gx-input"
              />
            </Field>
            <Field label="RFC (opcional)">
              <input
                value={f.rfc}
                onChange={(e) => set("rfc", e.target.value)}
                className="gx-input"
              />
            </Field>
            <Field label="Ciudad (opcional)">
              <input
                value={f.ciudad}
                onChange={(e) => set("ciudad", e.target.value)}
                className="gx-input"
              />
            </Field>
          </div>
          {err && <p className="text-danger text-sm">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="gx-btn-primary">
            {guardando ? "Guardando…" : "Crear partner"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditarPartnerModal({
  partner,
  onClose,
  onDone,
}: {
  partner: Partner;
  onClose: () => void;
  onDone: () => void;
}) {
  const [estado, setEstado] = useState(partner.estado);
  const [nivel, setNivel] = useState(partner.nivel);
  const [override, setOverride] = useState(partner.comisionPctOverride ?? "");
  const [aceptaReferidos, setAceptaReferidos] = useState(partner.isAcceptingNewReferrals);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setErr(null);
    try {
      await api(`/partners/${partner.id}`, {
        method: "PATCH",
        body: {
          estado,
          nivel,
          isAcceptingNewReferrals: aceptaReferidos,
          ...(override.trim() ? { comisionPctOverride: override.trim() } : {}),
        },
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Editar partner</h2>
        <p className="mb-4 text-slate-500 text-sm">
          {partner.codigo} · {partner.razonSocial}
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Estado">
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="gx-input"
              >
                {["activo", "pausado", "terminado"].map((k) => (
                  <option key={k} value={k}>
                    {P_ESTADO[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nivel">
              <select value={nivel} onChange={(e) => setNivel(e.target.value)} className="gx-input">
                {Object.entries(NIVEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Comisión % override (opcional)">
            <input
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="Ej. 30"
              className="gx-input"
            />
          </Field>
          <label className="flex items-center gap-2 text-slate-700 text-sm">
            <input
              type="checkbox"
              checked={aceptaReferidos}
              onChange={(e) => setAceptaReferidos(e.target.checked)}
            />
            Acepta nuevos referidos
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

// ── Tab: Comisiones ─────────────────────────────────────────────────────────

function ComisionesTab() {
  const [items, setItems] = useState<Commission[]>([]);
  const [estado, setEstado] = useState("");
  const [rechazando, setRechazando] = useState<Commission | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const qs = estado ? `?estado=${estado}` : "";
    api<Commission[]>(`/partners/commissions/all${qs}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [estado]);

  useEffect(() => cargar(), [cargar]);

  async function aprobar(c: Commission) {
    setError(null);
    try {
      await api(`/partners/commissions/${c.id}/aprobar`, { body: {} });
      cargar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="gx-input w-auto"
        >
          <option value="">Todas</option>
          {Object.entries(C_ESTADO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mb-3 text-danger text-sm">{error}</p>}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Partner</th>
              <th className="gx-th">Periodo</th>
              <th className="gx-th text-right">%</th>
              <th className="gx-th text-right">Monto</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td className="gx-td">{c.partner?.razonSocial ?? c.partner?.codigo ?? "—"}</td>
                <td className="gx-td">{periodo(c.periodoYyyymm)}</td>
                <td className="gx-td text-right">{Number(c.porcentajeAplicado)}%</td>
                <td className="gx-td text-right font-semibold">
                  {money(c.montoComision, c.moneda)}
                </td>
                <td className="gx-td">
                  <span className={commissionBadge(c.estado)}>
                    {C_ESTADO[c.estado] ?? c.estado}
                  </span>
                </td>
                <td className="gx-td text-right">
                  {c.estado === "pendiente" && (
                    <span className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => aprobar(c)}
                        className="font-semibold text-ok text-sm hover:underline"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={() => setRechazando(c)}
                        className="font-semibold text-danger text-sm hover:underline"
                      >
                        Rechazar
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={6}>
                  Sin comisiones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rechazando && (
        <RechazarComisionModal
          comision={rechazando}
          onClose={() => setRechazando(null)}
          onDone={() => {
            setRechazando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function RechazarComisionModal({
  comision,
  onClose,
  onDone,
}: {
  comision: Commission;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function rechazar() {
    if (motivo.trim().length < 1) {
      setErr("Escribe el motivo");
      return;
    }
    setGuardando(true);
    setErr(null);
    try {
      await api(`/partners/commissions/${comision.id}/rechazar`, {
        body: { motivo: motivo.trim() },
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Rechazar comisión</h2>
        <p className="mb-4 text-slate-500 text-sm">
          {comision.partner?.razonSocial} · {money(comision.montoComision, comision.moneda)}
        </p>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo del rechazo (queda en auditoría)"
          rows={3}
          className="gx-input mb-4"
        />
        {err && <p className="mb-3 text-danger text-sm">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={rechazar} disabled={guardando} className="gx-btn-danger">
            {guardando ? "Rechazando…" : "Rechazar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Payouts ────────────────────────────────────────────────────────────

function PayoutsTab() {
  const [items, setItems] = useState<Payout[]>([]);
  const [estado, setEstado] = useState("");
  const [creando, setCreando] = useState(false);
  const [pagando, setPagando] = useState<Payout | null>(null);

  const cargar = useCallback(() => {
    const qs = estado ? `?estado=${estado}` : "";
    api<Payout[]>(`/partners/payouts/all${qs}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [estado]);

  useEffect(() => cargar(), [cargar]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="gx-input w-auto"
        >
          <option value="">Todos</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
          <option value="fallido">Fallido</option>
        </select>
        <button type="button" onClick={() => setCreando(true)} className="gx-btn-primary">
          + Generar payout
        </button>
      </div>

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Partner</th>
              <th className="gx-th">Periodo</th>
              <th className="gx-th text-right">Comisiones</th>
              <th className="gx-th text-right">Neto</th>
              <th className="gx-th">Método</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td className="gx-td">{p.partner?.razonSocial ?? p.partner?.codigo ?? "—"}</td>
                <td className="gx-td">{periodo(p.periodoYyyymm)}</td>
                <td className="gx-td text-right">{p._count?.commissions ?? 0}</td>
                <td className="gx-td text-right font-semibold">{money(p.montoNeto, p.moneda)}</td>
                <td className="gx-td">{METODO[p.metodoPago] ?? p.metodoPago}</td>
                <td className="gx-td">
                  <span className={payoutBadge(p.estado)}>{p.estado}</span>
                </td>
                <td className="gx-td text-right">
                  {p.estado !== "pagado" && (
                    <button
                      type="button"
                      onClick={() => setPagando(p)}
                      className="font-semibold text-brand text-sm hover:underline"
                    >
                      Marcar pagado
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="gx-td text-center text-slate-400" colSpan={7}>
                  Sin payouts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creando && (
        <CrearPayoutModal
          onClose={() => setCreando(false)}
          onDone={() => {
            setCreando(false);
            cargar();
          }}
        />
      )}
      {pagando && (
        <MarcarPagadoModal
          payout={pagando}
          onClose={() => setPagando(null)}
          onDone={() => {
            setPagando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function CrearPayoutModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [periodoYyyymm, setPeriodoYyyymm] = useState("");
  const [metodoPago, setMetodoPago] = useState("spei");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Partner[]>("/partners?estado=activo")
      .then(setPartners)
      .catch(() => setPartners([]));
  }, []);

  async function guardar() {
    if (!partnerId || !/^\d{6}$/.test(periodoYyyymm)) {
      setErr("Elige partner y un periodo válido (AAAAMM)");
      return;
    }
    setGuardando(true);
    setErr(null);
    try {
      await api("/partners/payouts", { body: { partnerId, periodoYyyymm, metodoPago } });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-4 font-bold text-lg text-slate-800">Generar payout</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Agrupa las comisiones aprobadas del partner en ese periodo.
        </p>
        <div className="space-y-3">
          <Field label="Partner">
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              className="gx-input"
            >
              <option value="">Selecciona…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} · {p.razonSocial}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Periodo (AAAAMM)">
              <input
                value={periodoYyyymm}
                onChange={(e) => setPeriodoYyyymm(e.target.value)}
                placeholder="202606"
                className="gx-input"
              />
            </Field>
            <Field label="Método de pago">
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                className="gx-input"
              >
                {Object.entries(METODO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {err && <p className="text-danger text-sm">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando} className="gx-btn-primary">
            {guardando ? "Generando…" : "Generar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MarcarPagadoModal({
  payout,
  onClose,
  onDone,
}: {
  payout: Payout;
  onClose: () => void;
  onDone: () => void;
}) {
  const [folioBancario, setFolio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function marcar() {
    if (!folioBancario.trim()) {
      setErr("Escribe el folio bancario");
      return;
    }
    setGuardando(true);
    setErr(null);
    try {
      await api(`/partners/payouts/${payout.id}/marcar-pagado`, {
        body: { folioBancario: folioBancario.trim() },
      });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Marcar payout como pagado</h2>
        <p className="mb-4 text-slate-500 text-sm">
          {payout.partner?.razonSocial} · {money(payout.montoNeto, payout.moneda)}
        </p>
        <Field label="Folio bancario">
          <input
            value={folioBancario}
            onChange={(e) => setFolio(e.target.value)}
            placeholder="Referencia de la transferencia"
            className="gx-input"
          />
        </Field>
        {err && <p className="mt-3 text-danger text-sm">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={marcar} disabled={guardando} className="gx-btn-primary">
            {guardando ? "Guardando…" : "Confirmar pago"}
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
