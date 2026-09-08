import { useEffect, useRef, useState } from "react";
import type { Session } from "../App.js";
import { api, setPermisos } from "../lib/api.js";
import {
  type CashierIdentity,
  openRegister,
  readSelection,
  resolverSession,
  saveSelection,
  verifyOpening,
} from "../lib/session.js";
import type { Caja, Sucursal } from "../lib/types.js";

export function RegisterSetup({
  onReady,
  onLogout,
}: { onReady: (session: Session) => void; onLogout: () => void }) {
  const openingInFlight = useRef(false);
  const [identity, setIdentity] = useState<CashierIdentity | null>(null);
  const [branches, setBranches] = useState<Sucursal[]>([]);
  const [registers, setRegisters] = useState<Caja[]>([]);
  const [branchId, setBranchId] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [opening, setOpening] = useState<"unknown" | "open" | "closed">("unknown");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const can = (permission: string) =>
    identity?.permissions.some((value) => value === "*" || value === permission) ?? false;
  const canRead = can("sucursales.leer") && can("cajas.leer") && can("corte.consultar");

  useEffect(() => {
    let active = true;
    setIdentity(null);
    setBranches([]);
    setRegisters([]);
    setBranchId("");
    setRegisterId("");
    setOpening("unknown");
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const user = await api<CashierIdentity>("/auth/tenant/me");
        if (!active) return;
        setIdentity(user);
        setPermisos(user.permissions);
        if (
          !["sucursales.leer", "cajas.leer", "corte.consultar"].every(
            (p) => user.permissions.includes("*") || user.permissions.includes(p),
          )
        )
          return;
        const list = await api<Sucursal[]>("/t/sucursales");
        if (!active) return;
        setBranches(list.filter((item) => item.isActive && !item.archivedAt));
        const saved = readSelection(user);
        if (saved) {
          try {
            const session = await resolverSession(user.nombre, saved);
            if (active) onReady(session);
          } catch (failure) {
            if (active)
              setError(
                failure instanceof Error ? failure.message : "Selecciona una caja para continuar.",
              );
          }
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error ? failure.message : "No se pudo cargar la configuración.",
          );
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [version, onReady]);

  async function chooseBranch(id: string) {
    setBranchId(id);
    setRegisterId("");
    setRegisters([]);
    setOpening("unknown");
    setAmount("");
    setError(null);
    if (!id) return;
    setBusy(true);
    try {
      const list = await api<Caja[]>(`/t/cajas?sucursalId=${encodeURIComponent(id)}`);
      setRegisters(list.filter((item) => item.isActive && item.sucursalId === id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudieron consultar las cajas.");
    } finally {
      setBusy(false);
    }
  }
  async function checkOpening() {
    setBusy(true);
    setError(null);
    setOpening("unknown");
    try {
      setOpening(
        (await verifyOpening({ sucursalId: branchId, cajaId: registerId })) ? "open" : "closed",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo consultar la apertura.");
    } finally {
      setBusy(false);
    }
  }
  async function open() {
    if (openingInFlight.current) return;
    openingInFlight.current = true;
    setBusy(true);
    setError(null);
    setOpening("unknown");
    try {
      await openRegister({ sucursalId: branchId, cajaId: registerId }, amount);
      setOpening("open");
    } catch (failure) {
      setError(
        `${failure instanceof Error ? failure.message : "No se pudo verificar la apertura."} Consulta el estado de la caja antes de continuar.`,
      );
    } finally {
      openingInFlight.current = false;
      setBusy(false);
    }
  }
  async function enter() {
    if (!identity) return;
    setBusy(true);
    setError(null);
    try {
      const selection = { sucursalId: branchId, cajaId: registerId };
      const session = await resolverSession(identity.nombre, selection);
      saveSelection(identity, selection);
      onReady(session);
    } catch (failure) {
      setOpening("unknown");
      setError(failure instanceof Error ? failure.message : "No se pudo verificar la caja.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <section className="gx-card w-full max-w-lg min-w-0">
        <h1 className="text-2xl font-bold text-slate-800">Prepara tu punto de venta</h1>
        {identity && (
          <p className="mt-2 break-words text-sm text-slate-600">
            {identity.nombre} · {identity.tenantSlug}
          </p>
        )}
        <p className="my-4 text-sm text-slate-600">
          Elige dónde vas a cobrar. La apertura debe reflejar el efectivo que hay en caja.
        </p>
        {error && (
          <p role="alert" className="mb-4 break-words text-sm text-danger">
            {error}
          </p>
        )}
        {identity && !canRead && (
          <p role="alert" className="mb-4 text-sm text-danger">
            Necesitas permisos para consultar sucursales, cajas y aperturas. Solicítalos al
            administrador.
          </p>
        )}
        {canRead && (
          <div className="space-y-4">
            <label className="gx-label block">
              Sucursal
              <select
                className="gx-input mt-1 min-h-10 w-full"
                value={branchId}
                disabled={busy}
                onChange={(e) => void chooseBranch(e.target.value)}
              >
                <option value="">Selecciona una sucursal</option>
                {branches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </label>
            {!busy && !branches.length && (
              <p className="text-sm text-slate-600">No hay sucursales activas configuradas.</p>
            )}
            <label className="gx-label block">
              Caja
              <select
                className="gx-input mt-1 min-h-10 w-full"
                value={registerId}
                disabled={busy || !branchId}
                onChange={(e) => {
                  setRegisterId(e.target.value);
                  setOpening("unknown");
                  setAmount("");
                  setError(null);
                }}
              >
                <option value="">Selecciona una caja</option>
                {registers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre ?? item.codigo}
                  </option>
                ))}
              </select>
            </label>
            {branchId && !busy && !registers.length && (
              <p className="text-sm text-slate-600">La sucursal no tiene cajas activas.</p>
            )}
            {registerId && (
              <button
                type="button"
                className="gx-btn-secondary min-h-10"
                disabled={busy}
                onClick={() => void checkOpening()}
              >
                Consultar estado de caja
              </button>
            )}
            {opening === "open" && (
              <div>
                <output className="mb-3 text-sm text-ok">Caja abierta y verificada.</output>
                <button
                  type="button"
                  className="gx-btn-primary min-h-10"
                  disabled={busy}
                  onClick={() => void enter()}
                >
                  Entrar a vender
                </button>
              </div>
            )}
            {opening === "closed" && (
              <div className="space-y-3">
                <output className="text-sm text-slate-700">La caja está cerrada.</output>
                {can("caja.abrir") ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void open();
                    }}
                    className="space-y-3"
                  >
                    <label className="gx-label block">
                      Fondo inicial (MXN)
                      <input
                        className="gx-input mt-1 min-h-10 w-full"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        placeholder="Escribe el efectivo contado"
                        pattern="[0-9]{1,9}(\.[0-9]{1,2})?"
                        required
                        disabled={busy}
                      />
                    </label>
                    <button
                      className="gx-btn-primary min-h-10"
                      type="submit"
                      disabled={busy || !amount}
                    >
                      Abrir caja con este fondo
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-slate-600">
                    Un usuario con permiso de apertura debe abrir esta caja antes de continuar.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {busy && <output className="my-3 text-sm text-slate-600">Verificando…</output>}
        <div className="mt-5 flex flex-wrap gap-3">
          {!busy && (
            <button
              type="button"
              className="gx-btn-secondary min-h-10"
              onClick={() => setVersion((v) => v + 1)}
            >
              Recargar configuración
            </button>
          )}
          <button
            type="button"
            className="gx-btn-ghost min-h-10"
            disabled={busy}
            onClick={onLogout}
          >
            Cerrar sesión
          </button>
        </div>
      </section>
    </main>
  );
}
