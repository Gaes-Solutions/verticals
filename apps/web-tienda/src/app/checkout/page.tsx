"use client";

import { BarraEnvioGratis } from "@/components/barra-envio-gratis";
import { PagoTarjetaConekta } from "@/components/pago-tarjeta-conekta";
import { type CarritoLineaLocal, leerCarrito, sessionId, vaciar } from "@/lib/carrito-store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface OpcionEnvio {
  tarifaId: string;
  nombrePublico: string;
  costo: string;
  gratis: boolean;
  diasEntregaEstimados: number | null;
}

interface OpcionPickup {
  sucursalId: string;
  nombre: string;
  tiempoPreparacionPromedioMin: number;
}

interface TiendaConfig {
  msiHabilitado: boolean;
  msiMeses: number[];
  msiMontoMinimo: string;
  cuponEnCheckout: boolean;
  envioGratisDesde: string | null;
}

interface DireccionGuardada {
  id: string;
  etiqueta: string;
  calle: string;
  numeroExterior: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string | null;
  codigoPostal: string | null;
  isDefaultEnvio: boolean;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CarritoLineaLocal[]>([]);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [calle, setCalle] = useState("");
  const [numero, setNumero] = useState("");
  const [colonia, setColonia] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [estado, setEstado] = useState("");
  const [cp, setCp] = useState("");
  const [cupon, setCupon] = useState("");
  const [direcciones, setDirecciones] = useState<DireccionGuardada[]>([]);
  const [guardarDir, setGuardarDir] = useState(false);
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [modoEntrega, setModoEntrega] = useState<"envio" | "pickup">("envio");
  const [opcionesEnvio, setOpcionesEnvio] = useState<OpcionEnvio[]>([]);
  const [pickups, setPickups] = useState<OpcionPickup[]>([]);
  const [tarifaId, setTarifaId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [cotizando, setCotizando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(leerCarrito());
    fetch("/api/tienda-config").then(async (res) => {
      if (res.ok) setConfig((await res.json()) as TiendaConfig);
    });
    // prefill con la sesión del cliente si está logueado
    fetch("/api/cuenta/me").then(async (res) => {
      if (!res.ok) return;
      const me = (await res.json()) as { nombre: string; email: string | null };
      setEmail((prev) => prev || (me.email ?? ""));
      setNombre((prev) => prev || me.nombre);
    });
    // direcciones guardadas (checkout rápido)
    fetch("/api/cuenta/direcciones").then(async (res) => {
      if (!res.ok) return;
      const dirs = (await res.json()) as DireccionGuardada[];
      if (!Array.isArray(dirs) || dirs.length === 0) return;
      setDirecciones(dirs);
      const def = dirs.find((d) => d.isDefaultEnvio) ?? dirs[0];
      if (def) usarDireccion(def);
    });
  }, []);

  function usarDireccion(d: DireccionGuardada) {
    setCalle(d.calle);
    setNumero(d.numeroExterior ?? "");
    setColonia(d.colonia ?? "");
    setCiudad(d.municipio ?? "");
    setEstado(d.estado ?? "");
    setCp(d.codigoPostal ?? "");
  }

  const subtotal = items.reduce((acc, i) => acc + Number(i.precio) * i.cantidad, 0);

  // sucursales con pickup disponibles (no dependen de la dirección)
  useEffect(() => {
    if (subtotal === 0) return;
    fetch(`/api/envios?subtotal=${subtotal}`).then(async (res) => {
      const cot = (await res.json()) as { pickup: OpcionPickup[] };
      setPickups(cot.pickup);
    });
  }, [subtotal]);

  // cotiza paquetería cuando hay CP completo + estado
  useEffect(() => {
    if (cp.length !== 5 || estado.trim().length < 3 || subtotal === 0) {
      setOpcionesEnvio([]);
      setTarifaId("");
      return;
    }
    setCotizando(true);
    const t = setTimeout(() => {
      fetch(`/api/envios?cp=${cp}&estado=${encodeURIComponent(estado.trim())}&subtotal=${subtotal}`)
        .then(async (res) => {
          const cot = (await res.json()) as { opcionesEnvio: OpcionEnvio[] };
          setOpcionesEnvio(cot.opcionesEnvio);
          setTarifaId(cot.opcionesEnvio[0]?.tarifaId ?? "");
        })
        .finally(() => setCotizando(false));
    }, 400);
    return () => clearTimeout(t);
  }, [cp, estado, subtotal]);

  const envioSeleccionado = opcionesEnvio.find((o) => o.tarifaId === tarifaId);
  const costoEnvio = modoEntrega === "pickup" ? 0 : Number(envioSeleccionado?.costo ?? 0);
  const total = subtotal + costoEnvio;
  const conektaKey = process.env.NEXT_PUBLIC_CONEKTA_PUBLIC_KEY ?? "";
  // MSI ofrecibles para esta compra (activos + total sobre el mínimo).
  const msiOfrecibles =
    config?.msiHabilitado && total >= Number(config.msiMontoMinimo) ? config.msiMeses : [];

  function validar(): boolean {
    if (!email.trim() || !nombre.trim()) {
      setError("Completa tu correo y nombre");
      return false;
    }
    if (modoEntrega === "pickup" && !sucursalId) {
      setError("Elige la sucursal donde recogerás tu pedido");
      return false;
    }
    if (
      modoEntrega === "envio" &&
      (cp.length !== 5 || !calle.trim() || !ciudad.trim() || estado.trim().length < 3)
    ) {
      setError("Completa la dirección de envío");
      return false;
    }
    return true;
  }

  async function procesarPedido(cardTokenId?: string, meses?: number | null) {
    if (!validar()) return;
    setProcesando(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionIdAnonimo: sessionId(),
          emailComprador: email,
          items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })),
          metodoEnvio: modoEntrega === "pickup" ? "click_collect" : "paqueteria",
          ...(cupon.trim() ? { cuponCodigo: cupon.trim() } : {}),
          ...(cardTokenId ? { cardTokenId, proveedorPago: "conekta" } : {}),
          ...(meses ? { mesesSinIntereses: meses } : {}),
          ...(modoEntrega === "pickup"
            ? { sucursalPickupId: sucursalId }
            : {
                ...(tarifaId ? { tarifaEnvioId: tarifaId } : {}),
                direccionEnvio: {
                  nombre,
                  calle,
                  numero,
                  colonia,
                  ciudad,
                  estado,
                  cp,
                },
              }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Error en el pago");
      if (guardarDir && modoEntrega === "envio") {
        await fetch("/api/cuenta/direcciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            etiqueta: "Mi dirección",
            calle,
            numeroExterior: numero || undefined,
            colonia: colonia || undefined,
            municipio: ciudad || undefined,
            estado,
            codigoPostal: cp,
          }),
        }).catch(() => {});
      }
      vaciar();
      router.push(
        `/seguimiento?folio=${data.folioPublico}&email=${encodeURIComponent(email)}&ok=1`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setProcesando(false);
    }
  }

  if (items.length === 0) {
    return <p className="text-center text-gray-500">Tu carrito está vacío.</p>;
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Finalizar compra</h1>

      <div className="mb-4 rounded-lg border bg-white p-4">
        <p className="mb-3 font-medium text-sm">Tu pedido ({items.length})</p>
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.varianteId} className="flex items-center gap-3 text-sm">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-lg">
                {i.imagenUrl ? (
                  <img
                    src={i.imagenUrl}
                    alt={i.titulo}
                    className="h-full w-full rounded object-cover"
                  />
                ) : (
                  "📦"
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">{i.titulo}</p>
                <p className="text-gray-500">
                  {i.cantidad} × ${Number(i.precio).toFixed(2)}
                </p>
              </div>
              <span className="font-semibold">${(Number(i.precio) * i.cantidad).toFixed(2)}</span>
            </div>
          ))}
        </div>
        {config?.envioGratisDesde && (
          <div className="mt-3">
            <BarraEnvioGratis subtotal={subtotal} umbral={Number(config.envioGratisDesde)} />
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-lg border bg-white p-6">
        <Campo label="Email" value={email} onChange={setEmail} type="email" required />
        <Campo label="Nombre completo" value={nombre} onChange={setNombre} required />

        <div className="flex gap-2">
          <BotonEntrega
            activo={modoEntrega === "envio"}
            onClick={() => setModoEntrega("envio")}
            label="🚚 Envío a domicilio"
          />
          {pickups.length > 0 && (
            <BotonEntrega
              activo={modoEntrega === "pickup"}
              onClick={() => setModoEntrega("pickup")}
              label="🏬 Recoger en tienda"
            />
          )}
        </div>

        {modoEntrega === "envio" ? (
          <>
            {direcciones.length > 0 && (
              <label className="block">
                <span className="mb-1 block font-medium text-gray-700 text-sm">
                  Dirección guardada
                </span>
                <select
                  onChange={(e) => {
                    const d = direcciones.find((x) => x.id === e.target.value);
                    if (d) usarDireccion(d);
                  }}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {direcciones.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.etiqueta} — {d.calle} {d.numeroExterior}, {d.municipio}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Campo label="Calle" value={calle} onChange={setCalle} required />
              </div>
              <Campo label="Número" value={numero} onChange={setNumero} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Colonia" value={colonia} onChange={setColonia} />
              <Campo label="Ciudad" value={ciudad} onChange={setCiudad} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Estado" value={estado} onChange={setEstado} required />
              <Campo label="Código postal" value={cp} onChange={setCp} required />
            </div>
            <OpcionesEnvio
              opciones={opcionesEnvio}
              tarifaId={tarifaId}
              onSelect={setTarifaId}
              cotizando={cotizando}
              direccionLista={cp.length === 5 && estado.trim().length >= 3}
            />
            <label className="flex items-center gap-2 text-gray-600 text-sm">
              <input
                type="checkbox"
                checked={guardarDir}
                onChange={(e) => setGuardarDir(e.target.checked)}
              />
              Guardar esta dirección para próximas compras
            </label>
          </>
        ) : (
          <div className="space-y-2">
            {pickups.map((p) => (
              <label
                key={p.sucursalId}
                className="flex cursor-pointer items-center gap-3 rounded border p-3 text-sm has-[:checked]:border-marca"
              >
                <input
                  type="radio"
                  name="pickup"
                  checked={sucursalId === p.sucursalId}
                  onChange={() => setSucursalId(p.sucursalId)}
                />
                <span className="flex-1 font-medium">{p.nombre}</span>
                <span className="text-gray-500">
                  listo en ~{p.tiempoPreparacionPromedioMin} min
                </span>
                <span className="font-semibold text-green-600">Gratis</span>
              </label>
            ))}
          </div>
        )}

        {config?.cuponEnCheckout && (
          <label className="block">
            <span className="mb-1 block font-medium text-sm">¿Tienes un cupón?</span>
            <input
              value={cupon}
              onChange={(e) => setCupon(e.target.value.toUpperCase())}
              placeholder="CODIGO"
              className="w-full rounded border px-3 py-2 uppercase"
            />
          </label>
        )}

        <div className="border-t pt-4">
          <div className="mb-1 flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="mb-2 flex justify-between text-sm text-gray-600">
            <span>Envío</span>
            <span>{costoEnvio === 0 ? "Gratis" : `$${costoEnvio.toFixed(2)}`}</span>
          </div>
          <div className="mb-4 flex justify-between text-lg font-bold">
            <span>Total a pagar</span>
            <span className="text-marca">${total.toFixed(2)}</span>
          </div>
          {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

          {conektaKey ? (
            <PagoTarjetaConekta
              publicKey={conektaKey}
              montoTotal={total}
              msiMeses={msiOfrecibles}
              procesando={procesando}
              onPagar={(token, meses) => procesarPedido(token, meses)}
            />
          ) : (
            <>
              {msiOfrecibles.length > 0 && (
                <div className="mb-4 rounded-lg border border-marca/30 bg-marca/5 p-3">
                  <p className="mb-2 font-medium text-marca text-sm">💳 Meses sin intereses</p>
                  <div className="space-y-1 text-gray-600 text-sm">
                    {[...msiOfrecibles]
                      .sort((a, b) => a - b)
                      .map((m) => (
                        <div key={m} className="flex justify-between">
                          <span>{m} pagos de</span>
                          <span className="font-semibold">${(total / m).toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => procesarPedido()}
                disabled={procesando}
                className="w-full rounded bg-marca py-3 font-medium text-white hover:bg-marca-dark disabled:opacity-50"
              >
                {procesando ? "Procesando pago…" : `Pagar $${total.toFixed(2)} (demo)`}
              </button>
              <p className="mt-2 text-center text-gray-400 text-xs">
                Pago simulado con proveedor mock (sin cobro real). Configura Conekta para cobrar de
                verdad con MSI.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OpcionesEnvio({
  opciones,
  tarifaId,
  onSelect,
  cotizando,
  direccionLista,
}: {
  opciones: OpcionEnvio[];
  tarifaId: string;
  onSelect: (id: string) => void;
  cotizando: boolean;
  direccionLista: boolean;
}) {
  if (!direccionLista) {
    return <p className="text-xs text-gray-400">Completa estado y CP para cotizar el envío.</p>;
  }
  if (cotizando) {
    return <p className="text-xs text-gray-400">Cotizando envío…</p>;
  }
  if (opciones.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        Sin tarifas para tu zona — la tienda coordinará el envío contigo (sin costo adicional al
        pagar).
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {opciones.map((o) => (
        <label
          key={o.tarifaId}
          className="flex cursor-pointer items-center gap-3 rounded border p-3 text-sm has-[:checked]:border-marca"
        >
          <input
            type="radio"
            name="envio"
            checked={tarifaId === o.tarifaId}
            onChange={() => onSelect(o.tarifaId)}
          />
          <span className="flex-1 font-medium">{o.nombrePublico}</span>
          {o.diasEntregaEstimados && (
            <span className="text-gray-500">{o.diasEntregaEstimados} días</span>
          )}
          <span className={o.gratis ? "font-semibold text-green-600" : "font-semibold"}>
            {o.gratis ? "Gratis" : `$${Number(o.costo).toFixed(2)}`}
          </span>
        </label>
      ))}
    </div>
  );
}

function BotonEntrega({
  activo,
  onClick,
  label,
}: {
  activo: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
        activo ? "border-marca bg-marca/5 text-marca" : "border-gray-200 text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border px-3 py-2"
      />
    </label>
  );
}
