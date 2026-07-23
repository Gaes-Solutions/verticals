import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";

interface Tarifa {
  id: string;
  paqueteria: string;
  nombrePublico: string;
  tipoCalculo: string;
  montoFijo: string | null;
  montoMinimoEnvioGratis: string | null;
  diasEntregaEstimados: number | null;
  isActive: boolean;
}

interface Zona {
  id: string;
  nombre: string;
  cpsIncluidos: string[];
  estadosIncluidos: string[];
  isActive: boolean;
  tarifas: Tarifa[];
}

interface PickupRow {
  sucursal: { id: string; nombre: string };
  config: { activa: boolean; tiempoPreparacionPromedioMin: number } | null;
}

const PAQUETERIAS = ["estafeta", "fedex", "paquete_express", "huipix", "propio"] as const;

export function EnviosPage() {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [pickups, setPickups] = useState<PickupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<Zona[]>("/t/envios/zonas")
      .then(setZonas)
      .catch(() => setZonas([]));
    api<PickupRow[]>("/t/envios/pickup")
      .then(setPickups)
      .catch(() => setPickups([]));
  }, []);

  useEffect(() => cargar(), [cargar]);

  function notify(texto: string) {
    setError(null);
    setMsg(texto);
    cargar();
  }

  function fail(err: unknown) {
    setMsg(null);
    setError(err instanceof ApiError ? err.message : "Error");
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Envíos</h1>

      <NuevaZona onCreated={() => notify("Zona creada")} onError={fail} />

      {zonas.map((z) => (
        <ZonaCard key={z.id} zona={z} onChanged={() => notify("Guardado")} onError={fail} />
      ))}
      {zonas.length === 0 && (
        <p className="mb-6 text-sm text-slate-400">
          Sin zonas de envío. Crea una zona (deja estados y CPs vacíos para cubrir todo el país) y
          agrégale tarifas.
        </p>
      )}

      <section className="mt-8 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Recoger en tienda (click & collect)</h2>
        <p className="mb-4 text-sm text-slate-500">
          Activa las sucursales donde los clientes pueden recoger sus pedidos online.
        </p>
        {pickups.map((p) => (
          <PickupRowItem
            key={p.sucursal.id}
            row={p}
            onChanged={() => notify("Pickup actualizado")}
            onError={fail}
          />
        ))}
      </section>

      {msg && <p className="mt-4 text-sm text-emerald-600">{msg}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function NuevaZona({
  onCreated,
  onError,
}: { onCreated: () => void; onError: (e: unknown) => void }) {
  const [nombre, setNombre] = useState("");
  const [estados, setEstados] = useState("");

  async function crear() {
    if (!nombre.trim()) return;
    try {
      await api("/t/envios/zonas", {
        body: {
          nombre: nombre.trim(),
          estadosIncluidos: estados
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      setNombre("");
      setEstados("");
      onCreated();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <section className="mb-6 rounded-xl bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-bold text-slate-800">Nueva zona de envío</h2>
      <div className="flex flex-wrap gap-2">
        <input
          data-tour="env-zona-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre (ej. Nacional, Occidente)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          data-tour="env-zona-estados"
          value={estados}
          onChange={(e) => setEstados(e.target.value)}
          placeholder="Estados separados por coma (vacío = todo MX)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          data-tour="env-zona-crear"
          onClick={crear}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Crear zona
        </button>
      </div>
    </section>
  );
}

function ZonaCard({
  zona,
  onChanged,
  onError,
}: {
  zona: Zona;
  onChanged: () => void;
  onError: (e: unknown) => void;
}) {
  async function eliminarZona() {
    try {
      await api(`/t/envios/zonas/${zona.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      onError(err);
    }
  }

  async function eliminarTarifa(id: string) {
    try {
      await api(`/t/envios/tarifas/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <section className="mb-4 rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800">{zona.nombre}</h3>
          <p className="text-xs text-slate-500">
            {zona.estadosIncluidos.length > 0
              ? `Estados: ${zona.estadosIncluidos.join(", ")}`
              : zona.cpsIncluidos.length > 0
                ? `CPs: ${zona.cpsIncluidos.join(", ")}`
                : "Cobertura: todo México"}
          </p>
        </div>
        <button
          type="button"
          onClick={eliminarZona}
          className="text-xs text-slate-400 hover:text-red-500"
        >
          Eliminar zona
        </button>
      </div>

      {zona.tarifas.map((t) => (
        <div
          key={t.id}
          className="mb-1 flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
        >
          <span className="font-medium">{t.nombrePublico}</span>
          <span className="text-slate-500">{t.paqueteria}</span>
          <span>
            ${Number(t.montoFijo ?? 0).toFixed(2)}
            {t.montoMinimoEnvioGratis &&
              ` · gratis desde $${Number(t.montoMinimoEnvioGratis).toFixed(0)}`}
            {t.diasEntregaEstimados && ` · ${t.diasEntregaEstimados} días`}
          </span>
          <button
            type="button"
            onClick={() => eliminarTarifa(t.id)}
            className="text-xs text-slate-400 hover:text-red-500"
          >
            Quitar
          </button>
        </div>
      ))}

      <NuevaTarifa zonaId={zona.id} onCreated={onChanged} onError={onError} />
    </section>
  );
}

function NuevaTarifa({
  zonaId,
  onCreated,
  onError,
}: {
  zonaId: string;
  onCreated: () => void;
  onError: (e: unknown) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [paqueteria, setPaqueteria] = useState<string>("estafeta");
  const [monto, setMonto] = useState("");
  const [gratisDesde, setGratisDesde] = useState("");
  const [dias, setDias] = useState("");

  async function crear() {
    if (!nombre.trim() || !monto) return;
    try {
      await api("/t/envios/tarifas", {
        body: {
          zonaEnvioId: zonaId,
          paqueteria,
          nombrePublico: nombre.trim(),
          tipoCalculo: "fija",
          montoFijo: Number(monto),
          ...(gratisDesde ? { montoMinimoEnvioGratis: Number(gratisDesde) } : {}),
          ...(dias ? { diasEntregaEstimados: Number(dias) } : {}),
        },
      });
      setNombre("");
      setMonto("");
      setGratisDesde("");
      setDias("");
      onCreated();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre tarifa"
        className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      <select
        value={paqueteria}
        onChange={(e) => setPaqueteria(e.target.value)}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      >
        {PAQUETERIAS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
        placeholder="$ costo"
        type="number"
        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        value={gratisDesde}
        onChange={(e) => setGratisDesde(e.target.value)}
        placeholder="gratis desde $"
        type="number"
        className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      <input
        value={dias}
        onChange={(e) => setDias(e.target.value)}
        placeholder="días"
        type="number"
        className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={crear}
        className="rounded-lg border border-brand px-3 py-1.5 text-sm font-semibold text-brand hover:bg-teal-50"
      >
        + Tarifa
      </button>
    </div>
  );
}

function PickupRowItem({
  row,
  onChanged,
  onError,
}: {
  row: PickupRow;
  onChanged: () => void;
  onError: (e: unknown) => void;
}) {
  const [activa, setActiva] = useState(row.config?.activa ?? false);
  const [minutos, setMinutos] = useState(String(row.config?.tiempoPreparacionPromedioMin ?? 60));

  async function guardar(nuevaActiva: boolean) {
    setActiva(nuevaActiva);
    try {
      await api(`/t/envios/pickup/${row.sucursal.id}`, {
        method: "PUT",
        body: { activa: nuevaActiva, tiempoPreparacionPromedioMin: Number(minutos) || 60 },
      });
      onChanged();
    } catch (err) {
      setActiva(!nuevaActiva);
      onError(err);
    }
  }

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
      <label className="flex flex-1 items-center gap-2">
        <input type="checkbox" checked={activa} onChange={(e) => guardar(e.target.checked)} />
        <span className="font-medium">{row.sucursal.nombre}</span>
      </label>
      <label className="flex items-center gap-1 text-slate-500">
        listo en
        <input
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
          onBlur={() => activa && guardar(true)}
          type="number"
          className="w-16 rounded border border-slate-300 px-1 py-0.5 text-sm"
        />
        min
      </label>
    </div>
  );
}
