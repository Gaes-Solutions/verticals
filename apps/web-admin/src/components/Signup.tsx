import { type FormEvent, useEffect, useState } from "react";
import {
  ApiError,
  type PlanPublico,
  planesPublicos,
  signupTenant,
  verticalesActivas,
} from "../lib/api.js";
import { FormField as Campo } from "./FormField.js";

const VERTICALES: { value: string; label: string }[] = [
  { value: "retail_mayoreo", label: "Retail / Mayoreo" },
  { value: "abarrotes", label: "Abarrotes" },
  { value: "salud_vet", label: "Veterinaria" },
  { value: "salud_humana", label: "Salud humana" },
  { value: "despacho_contable", label: "Despacho contable" },
  { value: "otro", label: "Otro" },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function Signup({ onVolver }: { onVolver: () => void }) {
  const [planes, setPlanes] = useState<PlanPublico[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);
  const [vertical, setVertical] = useState("retail_mayoreo");
  const [activas, setActivas] = useState<string[] | null>(null);
  const [catalogoIntento, setCatalogoIntento] = useState(0);
  const [catalogoCargando, setCatalogoCargando] = useState(true);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [planCode, setPlanCode] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creado, setCreado] = useState<{ slug: string; trialEndsAt: string | null } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: el contador permite volver a solicitar el mismo catálogo sin perder el formulario
  useEffect(() => {
    let vigente = true;
    setCatalogoCargando(true);
    setCatalogoError(null);
    Promise.all([planesPublicos(), verticalesActivas()])
      .then(([p, r]) => {
        if (!vigente) return;
        const giros = r.verticales.filter((value) => VERTICALES.some((v) => v.value === value));
        if (!p.length || !giros.length) {
          throw new Error("El registro no está disponible por el momento. Intenta de nuevo.");
        }
        setPlanes(p);
        setPlanCode((actual) =>
          p.some((plan) => plan.code === actual) ? actual : (p[0]?.code ?? ""),
        );
        setActivas(giros);
        setVertical((actual) => (giros.includes(actual) ? actual : (giros[0] ?? actual)));
      })
      .catch(() => {
        if (vigente)
          setCatalogoError(
            "No pudimos cargar las opciones de registro. Reintenta sin borrar tus datos.",
          );
      })
      .finally(() => {
        if (vigente) setCatalogoCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [catalogoIntento]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (loading || catalogoCargando || catalogoError || !planCode) return;
    setError(null);
    setLoading(true);
    try {
      const res = await signupTenant({
        slug,
        name,
        vertical,
        planCode,
        adminName,
        adminEmail: email,
        adminPassword: password,
        billingEmail: email,
      });
      setCreado({ slug: res.tenant.slug, trialEndsAt: res.tenant.trialEndsAt });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  if (creado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <h1 className="mb-2 text-2xl font-bold text-slate-800">¡Cuenta creada! 🎉</h1>
          <p className="mb-1 text-slate-600">
            Tu negocio <span className="font-semibold">{creado.slug}</span> está listo.
          </p>
          <p className="mb-6 text-sm text-slate-500">
            Inicia sesión con tu correo y contraseña para empezar.
          </p>
          <button
            type="button"
            onClick={onVolver}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form onSubmit={enviar} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-bold text-slate-800">Crea tu cuenta</h1>
        <p className="mb-6 text-sm text-slate-500">Empieza gratis con un periodo de prueba.</p>

        <fieldset disabled={loading} className="space-y-3">
          <Campo label="Nombre del negocio">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTocado) setSlug(slugify(e.target.value));
              }}
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              className="gx-input"
            />
          </Campo>
          <Campo label="Identificador (URL)">
            <input
              value={slug}
              onChange={(e) => {
                setSlugTocado(true);
                setSlug(slugify(e.target.value));
              }}
              required
              minLength={3}
              maxLength={40}
              className="gx-input"
            />
          </Campo>
          <Campo label="Giro">
            <select
              value={vertical}
              disabled={catalogoCargando || Boolean(catalogoError)}
              onChange={(e) => setVertical(e.target.value)}
              className="gx-input"
            >
              {VERTICALES.filter((v) => activas?.includes(v.value)).map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </Campo>
          {planes.length > 0 && (
            <Campo label="Plan">
              <select
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                className="gx-input"
              >
                {planes.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.name} ·{" "}
                    {new Intl.NumberFormat("es-MX", {
                      style: "currency",
                      currency: p.currency,
                    }).format(p.priceCents / 100)}{" "}
                    {p.currency}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo label="Tu nombre">
            <input
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className="gx-input"
            />
          </Campo>
          <Campo label="Correo">
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="gx-input"
            />
          </Campo>
          <Campo label="Contraseña (mín. 8)">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={120}
              className="gx-input"
            />
          </Campo>
        </fieldset>

        {loading && (
          <output className="mt-3 block text-sm text-slate-500">
            Estamos preparando tu negocio. Mantén esta pantalla abierta hasta terminar.
          </output>
        )}
        {catalogoCargando && (
          <output className="mt-3 block text-sm text-slate-500">
            Cargando opciones de registro…
          </output>
        )}
        {catalogoError && (
          <div className="mt-3 text-sm text-danger">
            <p role="alert">{catalogoError}</p>
            <button
              type="button"
              onClick={() => setCatalogoIntento((n) => n + 1)}
              className="gx-btn-secondary mt-2"
            >
              Reintentar opciones
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !planCode || catalogoCargando || Boolean(catalogoError)}
          className="mt-5 w-full rounded-lg bg-brand py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? "Creando…" : "Crear cuenta"}
        </button>
        <button
          type="button"
          onClick={onVolver}
          className="mt-3 w-full text-center text-sm text-slate-500 hover:text-brand"
        >
          Ya tengo cuenta — iniciar sesión
        </button>
      </form>
    </div>
  );
}
