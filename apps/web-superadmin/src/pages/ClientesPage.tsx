import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api, esSuperadmin } from "../lib/api.js";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  planNombre: string;
  vertical: string | null;
  trialEndsAt: string | null;
  createdAt: string;
}

interface Plan {
  code: string;
  name: string;
}

interface Credenciales {
  slug: string;
  name: string;
  ownerEmail: string;
  ownerPassword: string | null;
  passwordGenerada: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  trial: "gx-badge-warn",
  active: "gx-badge-ok",
  past_due: "gx-badge-warn",
  suspended: "gx-badge-danger",
  unpaid: "gx-badge-danger",
  cancelled: "gx-badge-info",
  archived: "gx-badge",
};
const STATUS_LABEL: Record<string, string> = {
  trial: "Prueba",
  active: "Activo",
  past_due: "Vencido",
  suspended: "Suspendido",
  unpaid: "Impago",
  cancelled: "Cancelado",
  archived: "Archivado",
};

interface PaymentMethod {
  id: string;
  type: string;
  isDefault: boolean;
  last4: string | null;
  brand: string | null;
  expMonth: number | null;
  expYear: number | null;
}

const PM_TIPO: Record<string, string> = {
  card: "Tarjeta",
  oxxo: "OXXO",
  spei: "SPEI",
  manual: "Manual",
};

const DUNNING: Record<string, string> = {
  default: "Estándar",
  agresiva: "Agresiva (más reintentos)",
  suave: "Suave (menos reintentos)",
  ninguna: "Sin reintentos",
};

export function ClientesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);
  const [gestionar, setGestionar] = useState<Tenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const puedeGestionar = esSuperadmin();

  const cargar = useCallback(() => {
    api<Tenant[]>("/admin/tenants")
      .then(setTenants)
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => cargar(), [cargar]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Clientes</h1>
          <p className="text-slate-500 text-sm">Negocios dados de alta en la plataforma.</p>
        </div>
        {esSuperadmin() && (
          <button type="button" onClick={() => setNuevo(true)} className="gx-btn-primary">
            + Crear cliente
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-danger text-sm">{error}</p>}

      <div className="gx-table-wrap">
        <table className="gx-table">
          <thead>
            <tr>
              <th className="gx-th">Negocio</th>
              <th className="gx-th">Slug</th>
              <th className="gx-th">Plan</th>
              <th className="gx-th">Estado</th>
              <th className="gx-th">Alta</th>
              {puedeGestionar && <th className="gx-th" />}
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={puedeGestionar ? 6 : 5}>
                  Aún no hay clientes. Crea el primero con “+ Crear cliente”.
                </td>
              </tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id}>
                  <td className="gx-td font-medium">{t.name}</td>
                  <td className="gx-td text-slate-500">{t.slug}</td>
                  <td className="gx-td">
                    <span className="gx-badge-info">{t.planNombre}</span>
                  </td>
                  <td className="gx-td">
                    <span className={STATUS_BADGE[t.status] ?? "gx-badge-info"}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className="gx-td text-slate-500">
                    {new Date(t.createdAt).toLocaleDateString("es-MX")}
                  </td>
                  {puedeGestionar && (
                    <td className="gx-td text-right">
                      <button
                        type="button"
                        onClick={() => setGestionar(t)}
                        className="font-semibold text-brand text-sm hover:underline"
                      >
                        Gestionar
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nuevo && (
        <CrearClienteModal
          onClose={() => setNuevo(false)}
          onDone={(cred) => {
            setNuevo(false);
            setError(null);
            setCredenciales(cred);
            cargar();
          }}
        />
      )}
      {credenciales && (
        <CredencialesModal cred={credenciales} onClose={() => setCredenciales(null)} />
      )}
      {gestionar && (
        <GestionarClienteModal
          tenant={gestionar}
          onClose={() => setGestionar(null)}
          onDone={() => {
            setGestionar(null);
            setError(null);
            cargar();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function GestionarClienteModal({
  tenant,
  onClose,
  onDone,
  onError,
}: {
  tenant: Tenant;
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [planCode, setPlanCode] = useState(tenant.plan);
  const [metodos, setMetodos] = useState<PaymentMethod[]>([]);
  const [dunning, setDunning] = useState("default");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Plan[]>("/admin/tenants/planes")
      .then(setPlanes)
      .catch(() => setPlanes([]));
    api<{ paymentMethods: PaymentMethod[]; dunningPolicy: string }>(
      `/admin/tenants/${tenant.slug}/detalle`,
    )
      .then((d) => {
        setMetodos(d.paymentMethods);
        setDunning(d.dunningPolicy);
      })
      .catch(() => undefined);
  }, [tenant.slug]);

  async function accion<T>(fn: () => Promise<T>) {
    setGuardando(true);
    setErr(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      const m = e instanceof ApiError ? e.message : "Error";
      setErr(m);
      onError(m);
      setGuardando(false);
    }
  }

  const cambiarPlan = () =>
    accion(() =>
      api(`/admin/tenants/${tenant.slug}/plan`, { method: "PATCH", body: { planCode } }),
    );
  const cambiarEstado = (status: string) =>
    accion(() =>
      api(`/admin/tenants/${tenant.slug}/estado`, { method: "PATCH", body: { status } }),
    );
  const guardarDunning = () =>
    accion(() =>
      api(`/admin/tenants/${tenant.slug}/dunning`, { method: "PATCH", body: { policy: dunning } }),
    );

  const activo = tenant.status === "active" || tenant.status === "trial";

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Gestionar cliente</h2>
        <p className="mb-4 text-slate-500 text-sm">
          {tenant.name} · {tenant.slug} ·{" "}
          <span className={STATUS_BADGE[tenant.status] ?? "gx-badge-info"}>
            {STATUS_LABEL[tenant.status] ?? tenant.status}
          </span>
        </p>

        <div className="mb-4">
          <span className="gx-label">Plan</span>
          <div className="flex gap-2">
            <select
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              className="gx-input"
            >
              {planes.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={cambiarPlan}
              disabled={guardando || planCode === tenant.plan}
              className="gx-btn-secondary whitespace-nowrap"
            >
              Cambiar plan
            </button>
          </div>
        </div>

        <hr className="my-4 border-slate-200" />
        <span className="gx-label">Estado del cliente</span>
        <div className="flex flex-wrap gap-2">
          {activo ? (
            <button
              type="button"
              onClick={() => cambiarEstado("suspended")}
              disabled={guardando}
              className="gx-btn-danger"
            >
              Suspender
            </button>
          ) : (
            <button
              type="button"
              onClick={() => cambiarEstado("active")}
              disabled={guardando}
              className="gx-btn-primary"
            >
              Reactivar
            </button>
          )}
          {tenant.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => cambiarEstado("cancelled")}
              disabled={guardando}
              className="gx-btn-ghost"
            >
              Cancelar cuenta
            </button>
          )}
        </div>

        <hr className="my-4 border-slate-200" />
        <span className="gx-label">Métodos de pago</span>
        {metodos.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin métodos de pago registrados.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {metodos.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-slate-700">
                <span className="font-medium">{PM_TIPO[m.type] ?? m.type}</span>
                {m.brand && <span>{m.brand}</span>}
                {m.last4 && <span className="text-slate-500">•••• {m.last4}</span>}
                {m.expMonth && m.expYear && (
                  <span className="text-slate-400">
                    {String(m.expMonth).padStart(2, "0")}/{m.expYear}
                  </span>
                )}
                {m.isDefault && <span className="gx-badge-info">Predet.</span>}
              </li>
            ))}
          </ul>
        )}

        <hr className="my-4 border-slate-200" />
        <span className="gx-label">Cobranza (reintentos)</span>
        <div className="flex gap-2">
          <select value={dunning} onChange={(e) => setDunning(e.target.value)} className="gx-input">
            {Object.entries(DUNNING).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={guardarDunning}
            disabled={guardando}
            className="gx-btn-secondary whitespace-nowrap"
          >
            Guardar política
          </button>
        </div>

        {err && <p className="mt-4 text-danger text-sm">{err}</p>}
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Sugiere un slug a partir del nombre del negocio. */
function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function CrearClienteModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (cred: Credenciales) => void;
}) {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);
  const [planCode, setPlanCode] = useState("");
  const [vertical, setVertical] = useState("retail_mayoreo");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerNombre, setOwnerNombre] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Plan[]>("/admin/tenants/planes")
      .then((p) => {
        setPlanes(p);
        if (p[0]) setPlanCode(p[0].code);
      })
      .catch(() => setPlanes([]));
  }, []);

  function cambiarNombre(v: string) {
    setName(v);
    if (!slugTocado) setSlug(slugify(v));
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErr(null);
    try {
      const cred = await api<Credenciales>("/admin/tenants", {
        body: {
          slug,
          name,
          planCode,
          vertical,
          ownerEmail,
          ...(ownerNombre ? { ownerNombre } : {}),
          ...(ownerPassword ? { ownerPassword } : {}),
        },
      });
      onDone(cred);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "Error al crear el cliente");
      setGuardando(false);
    }
  }

  return (
    <div className="gx-modal-overlay">
      <form onSubmit={guardar} className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">Crear cliente</h2>
        <p className="mb-4 text-slate-500 text-xs">
          Crea el negocio, su tienda y el usuario dueño listo para entrar a web-admin.
        </p>

        <label className="mb-3 block">
          <span className="gx-label">Nombre del negocio</span>
          <input
            value={name}
            onChange={(e) => cambiarNombre(e.target.value)}
            className="gx-input"
            placeholder="Ferretería López"
            required
          />
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Slug (identificador, va en la URL)</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTocado(true);
              setSlug(e.target.value);
            }}
            className="gx-input"
            placeholder="ferreteria-lopez"
            pattern="[a-z0-9-]{3,40}"
            required
          />
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Plan</span>
          <select
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value)}
            className="gx-input"
            required
          >
            {planes.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Giro / vertical (define qué roles verá)</span>
          <select
            value={vertical}
            onChange={(e) => setVertical(e.target.value)}
            className="gx-input"
            required
          >
            <option value="retail_mayoreo">Tienda / Retail / Mayoreo</option>
            <option value="abarrotes">Abarrotes</option>
            <option value="salud_vet">Veterinaria</option>
            <option value="salud_humana">Salud humana / Consultorio</option>
            <option value="despacho_contable">Despacho contable</option>
            <option value="otro">Otro</option>
          </select>
        </label>

        <hr className="my-4 border-slate-200" />
        <p className="mb-3 font-semibold text-slate-700 text-sm">Dueño del negocio</p>

        <label className="mb-3 block">
          <span className="gx-label">Nombre del dueño</span>
          <input
            value={ownerNombre}
            onChange={(e) => setOwnerNombre(e.target.value)}
            className="gx-input"
            placeholder="(opcional)"
          />
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Correo del dueño</span>
          <input
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            className="gx-input"
            placeholder="dueno@negocio.mx"
            required
          />
        </label>
        <label className="mb-3 block">
          <span className="gx-label">Contraseña</span>
          <input
            type="text"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            className="gx-input"
            placeholder="Vacío = se genera una automática"
            minLength={8}
          />
        </label>

        {err && <p className="mb-3 text-danger text-sm">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="gx-btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="gx-btn-primary">
            {guardando ? "Creando… (puede tardar)" : "Crear cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CredencialesModal({ cred, onClose }: { cred: Credenciales; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Negocio: ${cred.name}\nSlug: ${cred.slug}\nCorreo: ${cred.ownerEmail}${
    cred.ownerPassword ? `\nContraseña: ${cred.ownerPassword}` : ""
  }`;

  function copiar() {
    navigator.clipboard?.writeText(texto).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      },
      () => undefined,
    );
  }

  return (
    <div className="gx-modal-overlay">
      <div className="gx-modal-panel">
        <h2 className="mb-1 font-bold text-lg text-slate-800">✅ Cliente creado</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Entrega estos datos al dueño. Entra a <strong>web-admin</strong> con el correo y la
          contraseña.
        </p>

        <div className="mb-4 space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
          <Fila k="Negocio" v={cred.name} />
          <Fila k="Slug" v={cred.slug} />
          <Fila k="Correo" v={cred.ownerEmail} />
          {cred.ownerPassword && <Fila k="Contraseña" v={cred.ownerPassword} />}
        </div>

        {cred.passwordGenerada && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-amber-700 text-xs">
            ⚠️ Esta contraseña se generó automáticamente y <strong>no se vuelve a mostrar</strong>.
            Cópiala ahora.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={copiar} className="gx-btn-secondary">
            {copiado ? "✓ Copiado" : "Copiar datos"}
          </button>
          <button type="button" onClick={onClose} className="gx-btn-primary">
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{k}</span>
      <span className="font-mono font-medium text-slate-800">{v}</span>
    </div>
  );
}
