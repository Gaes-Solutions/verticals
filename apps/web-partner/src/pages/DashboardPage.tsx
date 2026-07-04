import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { ApiError, type PerfilPartner, api } from "../lib/api.js";

function ActivarMfa({ onActivo }: { onActivo: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function iniciar() {
    setBusy(true);
    setError(null);
    try {
      setSetup(await api("/partner/auth/mfa/setup", { method: "POST" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar");
    } finally {
      setBusy(false);
    }
  }

  async function activar() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ backupCodes: string[] }>("/partner/auth/mfa/activate", {
        body: { code },
      });
      setBackupCodes(res.backupCodes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código incorrecto");
    } finally {
      setBusy(false);
    }
  }

  if (backupCodes) {
    return (
      <div>
        <p className="mb-2 font-medium text-emerald-700 text-sm">✅ 2FA activado</p>
        <p className="mb-2 text-slate-500 text-xs">
          Guarda tus códigos de respaldo (cada uno entra UNA vez):
        </p>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-50 p-3 font-mono text-slate-700 text-xs">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <button type="button" onClick={onActivo} className="gx-btn-primary text-sm">
          Listo
        </button>
      </div>
    );
  }

  if (setup) {
    return (
      <div>
        <p className="mb-2 text-slate-600 text-sm">
          Escanea con tu app autenticadora y escribe el código:
        </p>
        <div className="mb-2 flex justify-center">
          <QRCodeSVG value={setup.otpauthUrl} size={140} />
        </div>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="gx-input flex-1 text-center font-mono"
          />
          <button
            type="button"
            onClick={activar}
            disabled={busy || code.length !== 6}
            className="gx-btn-primary text-sm"
          >
            Activar
          </button>
        </div>
        {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <p className="text-slate-600 text-sm">
        Protege tu cuenta con verificación en dos pasos (TOTP).
      </p>
      <button type="button" onClick={iniciar} disabled={busy} className="gx-btn-secondary text-sm">
        Activar 2FA
      </button>
    </div>
  );
}

export function DashboardPage({
  perfil,
  onPerfil,
}: {
  perfil: PerfilPartner;
  onPerfil: (p: PerfilPartner) => void;
}) {
  const [copiado, setCopiado] = useState<string | null>(null);

  async function refrescar() {
    onPerfil(await api<PerfilPartner>("/partner/me"));
  }

  function copiar(slug: string) {
    const url = `${window.location.origin.replace(":5180", ":3000")}/r/${slug}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiado(slug);
    setTimeout(() => setCopiado(null), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="gx-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-bold text-slate-800 text-xl">{perfil.razonSocial}</h1>
            <p className="text-slate-500 text-sm">
              Código {perfil.codigo} · {perfil.tipo}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold text-2xl text-brand">{perfil.comisionPct}%</p>
            <p className="text-slate-500 text-xs">comisión lifetime</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="font-bold text-lg text-slate-800">{perfil.totales.referrals}</p>
            <p className="text-slate-500 text-xs">Referidos</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="font-bold text-lg text-slate-800">{perfil.totales.tenantsActivos}</p>
            <p className="text-slate-500 text-xs">Negocios activos</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="font-bold text-lg text-slate-800 capitalize">{perfil.nivel}</p>
            <p className="text-slate-500 text-xs">Nivel</p>
          </div>
        </div>
      </div>

      <div className="gx-card p-5">
        <h2 className="mb-2 font-semibold text-slate-800">Mis links de referido</h2>
        {perfil.links.length === 0 ? (
          <p className="text-slate-400 text-sm">
            Aún no tienes links. Pídelos a tu contacto GaesSoft.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {perfil.links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <p className="text-slate-700 text-sm">{l.nombre}</p>
                  <p className="font-mono text-slate-400 text-xs">/r/{l.slug}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copiar(l.slug)}
                  className="gx-btn-secondary text-sm"
                >
                  {copiado === l.slug ? "¡Copiado!" : "Copiar link"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="gx-card p-5">
        <h2 className="mb-2 font-semibold text-slate-800">Seguridad</h2>
        {perfil.mfaActivo ? (
          <p className="text-emerald-700 text-sm">✅ Verificación en dos pasos activa</p>
        ) : (
          <ActivarMfa onActivo={() => void refrescar()} />
        )}
      </div>
    </div>
  );
}
