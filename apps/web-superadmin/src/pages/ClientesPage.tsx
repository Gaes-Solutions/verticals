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
  suspended: "gx-badge-warn",
  cancelled: "gx-badge-info",
};

export function ClientesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [credenciales, setCredenciales] = useState<Credenciales | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td className="gx-td text-slate-400" colSpan={5}>
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
                    <span className={STATUS_BADGE[t.status] ?? "gx-badge-info"}>{t.status}</span>
                  </td>
                  <td className="gx-td text-slate-500">
                    {new Date(t.createdAt).toLocaleDateString("es-MX")}
                  </td>
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
