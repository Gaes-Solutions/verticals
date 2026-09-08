"use client";

import { BarraEnvioGratis } from "@/components/barra-envio-gratis";
import { PagoTarjetaConekta } from "@/components/pago-tarjeta-conekta";
import { type CarritoLineaLocal, leerCarrito, vaciar } from "@/lib/carrito-store";
import {
  type CheckoutAttempt,
  completeAttempt,
  prepareAttempt,
  submitAttempt,
} from "@/lib/checkout-attempt";
import { CreditCard, ImageOff, Store, Truck } from "lucide-react";
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
  const [cuponInfo, setCuponInfo] = useState<{
    valido: boolean;
    mensaje: string;
    descuentoSubtotal: string;
    envioGratis: boolean;
  } | null>(null);
  const [direcciones, setDirecciones] = useState<DireccionGuardada[]>([]);
  const [guardarDir, setGuardarDir] = useState(false);
  const [config, setConfig] = useState<TiendaConfig | null>(null);
  const [modoEntrega, setModoEntrega] = useState<"envio" | "pickup">("envio");
  const [opcionesEnvio, setOpcionesEnvio] = useState<OpcionEnvio[]>([]);
  const [pickups, setPickups] = useState<OpcionPickup[]>([]);
  const [tarifaId, setTarifaId] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [cotizando, setCotizando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [errorPickup, setErrorPickup] = useState<string | null>(null);
  const [cotizacionKey, setCotizacionKey] = useState("");
  const [pickupSubtotal, setPickupSubtotal] = useState<number | null>(null);
  const [reintentoEntrega, setReintentoEntrega] = useState(0);
  const [procesando, setProcesando] = useState(false);
  const [attempt, setAttempt] = useState<CheckoutAttempt | null>(null);
  const [sessionRetry, setSessionRetry] = useState(0);
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

  useEffect(() => {
    let active = true;
    fetch("/api/checkout/session", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { context?: string; message?: string };
        if (!response.ok || !data.context)
          throw new Error(data.message ?? "No se pudo preparar la compra.");
        const next = await prepareAttempt(data.context);
        if (active) setAttempt(next);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "No se pudo preparar la compra.");
      });
    return () => {
      active = false;
    };
  }, [sessionRetry]);

  function usarDireccion(d: DireccionGuardada) {
    setCalle(d.calle);
    setNumero(d.numeroExterior ?? "");
    setColonia(d.colonia ?? "");
    setCiudad(d.municipio ?? "");
    setEstado(d.estado ?? "");
    setCp(d.codigoPostal ?? "");
  }

  const subtotal = items.reduce((acc, i) => acc + Number(i.precio) * i.cantidad, 0);

  const entregaKey = JSON.stringify([cp, estado.trim(), subtotal]);

  useEffect(() => {
    const controller = new AbortController();
    setPickups([]);
    setSucursalId("");
    setPickupSubtotal(null);
    setErrorPickup(null);
    if (subtotal === 0) return;
    fetch(`/api/envios?subtotal=${subtotal}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Entrega no disponible");
        const cot = (await res.json()) as { pickup: OpcionPickup[] };
        if (!Array.isArray(cot.pickup)) throw new Error("Cotización inválida");
        if (controller.signal.aborted) return;
        setPickups(cot.pickup);
        setPickupSubtotal(subtotal);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setErrorPickup("No se pudieron consultar las sucursales para recoger tu pedido.");
        }
      });
    return () => controller.abort();
  }, [subtotal, reintentoEntrega]);

  useEffect(() => {
    const controller = new AbortController();
    setOpcionesEnvio([]);
    setTarifaId("");
    setCotizacionKey("");
    setErrorEnvio(null);
    setCotizando(false);
    if (!/^\d{5}$/.test(cp) || estado.trim().length < 3 || subtotal === 0) return;
    setCotizando(true);
    const t = setTimeout(() => {
      fetch(
        `/api/envios?cp=${cp}&estado=${encodeURIComponent(estado.trim())}&subtotal=${subtotal}`,
        {
          signal: controller.signal,
        },
      )
        .then(async (res) => {
          if (!res.ok) throw new Error("Entrega no disponible");
          const cot = (await res.json()) as { opcionesEnvio: OpcionEnvio[] };
          if (!Array.isArray(cot.opcionesEnvio)) throw new Error("Cotización inválida");
          if (controller.signal.aborted) return;
          setOpcionesEnvio(cot.opcionesEnvio);
          setTarifaId(cot.opcionesEnvio[0]?.tarifaId ?? "");
          setCotizacionKey(entregaKey);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setErrorEnvio("No se pudo calcular el envío. Reintenta antes de pagar.");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setCotizando(false);
        });
    }, 400);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [cp, estado, subtotal, entregaKey, reintentoEntrega]);

  const envioSeleccionado = opcionesEnvio.find((o) => o.tarifaId === tarifaId);
  const entregaLista =
    modoEntrega === "pickup"
      ? pickupSubtotal === subtotal && pickups.some((p) => p.sucursalId === sucursalId)
      : cotizacionKey === entregaKey && !cotizando && Boolean(envioSeleccionado);
  const costoEnvioBase = modoEntrega === "pickup" ? 0 : Number(envioSeleccionado?.costo ?? 0);
  const cuponOk = cuponInfo?.valido ?? false;
  const descuentoCupon = cuponOk ? Number(cuponInfo?.descuentoSubtotal ?? 0) : 0;
  const costoEnvio = cuponOk && cuponInfo?.envioGratis ? 0 : costoEnvioBase;
  const total = Math.max(0, subtotal - descuentoCupon) + costoEnvio;

  async function aplicarCupon() {
    if (!cupon.trim()) {
      setCuponInfo(null);
      return;
    }
    const r = (await fetch(
      `/api/cupon?codigo=${encodeURIComponent(cupon.trim())}&subtotal=${subtotal}`,
    ).then((x) => x.json())) as {
      valido: boolean;
      mensaje: string;
      descuentoSubtotal: string;
      envioGratis: boolean;
    };
    setCuponInfo(r);
  }
  const conektaKey = process.env.NEXT_PUBLIC_CONEKTA_PUBLIC_KEY ?? "";
  const permiteDemo = process.env.NODE_ENV !== "production";
  // MSI ofrecibles para esta compra (activos + total sobre el mínimo).
  const msiOfrecibles =
    config?.msiHabilitado && total >= Number(config.msiMontoMinimo) ? config.msiMeses : [];

  function validar(): boolean {
    if (!entregaLista) {
      setError("Selecciona una opción de entrega disponible antes de pagar.");
      return false;
    }
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

  async function handleCheckoutResponse(response: Response, current: CheckoutAttempt) {
    const data = (await response.json()) as {
      message?: string;
      intentStatus?: string;
      folioPublico?: string;
    };
    if (!response.ok)
      throw new Error(data.message ?? "Estamos verificando el pago. No vuelvas a pagar.");
    if (data.intentStatus !== "confirmado" || !data.folioPublico) {
      setError(
        data.intentStatus === "fallido"
          ? "Este intento no pudo completarse. Contacta a la tienda antes de iniciar otro pago."
          : "Tu pago sigue pendiente de confirmación. Consulta este mismo intento; no vuelvas a pagar.",
      );
      return;
    }
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
    await completeAttempt(current, vaciar);
    router.push(
      `/gracias?folio=${encodeURIComponent(data.folioPublico)}&email=${encodeURIComponent(email)}`,
    );
  }

  async function consultarPedido() {
    if (!attempt) return;
    setProcesando(true);
    setError(null);
    try {
      const params = new URLSearchParams({ context: attempt.context, idempotencyKey: attempt.key });
      const response = await fetch(`/api/checkout?${params}`, { cache: "no-store" });
      await handleCheckoutResponse(response, attempt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo consultar el pago. Tu intento se conserva.",
      );
    } finally {
      setProcesando(false);
    }
  }

  async function procesarPedido(cardTokenId?: string, meses?: number | null) {
    if (!attempt || procesando) return;
    if (attempt.submitted) {
      await consultarPedido();
      return;
    }
    if (!cardTokenId && !permiteDemo) {
      setError("El pago en línea no está disponible en este momento. Intenta más tarde.");
      return;
    }
    if (!validar()) return;
    setProcesando(true);
    setError(null);
    try {
      const firstSubmission = await submitAttempt(attempt);
      const current = { ...attempt, submitted: true };
      setAttempt(current);
      if (!firstSubmission) {
        const params = new URLSearchParams({
          context: current.context,
          idempotencyKey: current.key,
        });
        await handleCheckoutResponse(
          await fetch(`/api/checkout?${params}`, { cache: "no-store" }),
          current,
        );
        return;
      }
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutContext: current.context,
          idempotencyKey: current.key,
          emailComprador: email,
          items: items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })),
          metodoEnvio: modoEntrega === "pickup" ? "click_collect" : "paqueteria",
          ...(cupon.trim() ? { cuponCodigo: cupon.trim() } : {}),
          ...(cardTokenId ? { cardTokenId } : {}),
          ...(meses ? { mesesSinIntereses: meses } : {}),
          ...(modoEntrega === "pickup"
            ? { sucursalPickupId: sucursalId }
            : {
                ...(tarifaId ? { tarifaEnvioId: tarifaId } : {}),
                direccionEnvio: { nombre, calle, numero, colonia, ciudad, estado, cp },
              }),
        }),
      });
      await handleCheckoutResponse(response, current);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Estamos verificando el pago. No vuelvas a pagar.",
      );
    } finally {
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
                  <ImageOff size={20} strokeWidth={1.5} className="text-gray-300" />
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
            label={
              <>
                <Truck size={16} strokeWidth={2} /> Envío a domicilio
              </>
            }
          />
          {pickups.length > 0 && (
            <BotonEntrega
              activo={modoEntrega === "pickup"}
              onClick={() => setModoEntrega("pickup")}
              label={
                <>
                  <Store size={16} strokeWidth={2} /> Recoger en tienda
                </>
              }
            />
          )}
        </div>

        {errorPickup && (
          <div role="alert" className="space-y-2 text-danger text-sm">
            <p>{errorPickup}</p>
            <button
              type="button"
              className="gx-btn-secondary"
              onClick={() => setReintentoEntrega((n) => n + 1)}
            >
              Reintentar entrega
            </button>
          </div>
        )}

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
              error={errorEnvio}
              onRetry={() => setReintentoEntrega((n) => n + 1)}
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
          <div>
            <span className="mb-1 block font-medium text-sm">¿Tienes un cupón?</span>
            <div className="flex gap-2">
              <input
                value={cupon}
                onChange={(e) => {
                  setCupon(e.target.value.toUpperCase());
                  setCuponInfo(null);
                }}
                placeholder="CODIGO"
                className="flex-1 rounded border px-3 py-2 uppercase"
              />
              <button
                type="button"
                onClick={aplicarCupon}
                className="rounded-lg border border-marca px-4 py-2 font-medium text-marca text-sm hover:bg-marca/5"
              >
                Aplicar
              </button>
            </div>
            {cuponInfo && (
              <p className={`mt-1 text-sm ${cuponOk ? "text-emerald-600" : "text-red-600"}`}>
                {cuponOk ? "✓ " : "✕ "}
                {cuponInfo.mensaje}
              </p>
            )}
          </div>
        )}

        <div className="border-t pt-4">
          <div className="mb-1 flex justify-between text-gray-600 text-sm">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {descuentoCupon > 0 && (
            <div className="mb-1 flex justify-between text-emerald-600 text-sm">
              <span>Descuento ({cupon})</span>
              <span>−${descuentoCupon.toFixed(2)}</span>
            </div>
          )}
          <div className="mb-2 flex justify-between text-gray-600 text-sm">
            <span>Envío</span>
            <span>
              {!entregaLista
                ? "Por confirmar"
                : costoEnvio === 0
                  ? "Gratis"
                  : `$${costoEnvio.toFixed(2)}`}
            </span>
          </div>
          <div className="mb-4 flex justify-between text-lg font-bold">
            <span>{entregaLista ? "Total a pagar" : "Subtotal con descuentos"}</span>
            <span className="text-marca">${total.toFixed(2)}</span>
          </div>
          {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

          {!entregaLista && (
            <output className="mb-3 block text-sm text-slate-600">
              Confirma una opción de entrega para habilitar el pago.
            </output>
          )}
          {!attempt && (
            <div className="mb-3 space-y-2 text-sm text-slate-600">
              <p>Preparando sesión segura de compra…</p>
              <button
                type="button"
                className="gx-btn-secondary"
                onClick={() => setSessionRetry((n) => n + 1)}
              >
                Reintentar sesión
              </button>
            </div>
          )}
          {attempt?.submitted && (
            <div className="mb-3 space-y-2 text-sm text-slate-600">
              <p>
                Hay un intento de compra por verificar. El carrito se conserva hasta confirmar el
                pago.
              </p>
              <button
                type="button"
                className="gx-btn-secondary"
                disabled={procesando}
                onClick={consultarPedido}
              >
                {procesando ? "Consultando…" : "Consultar estado del pago"}
              </button>
            </div>
          )}
          <fieldset
            disabled={!entregaLista || !attempt || attempt.submitted || procesando}
            className="min-w-0"
          >
            {conektaKey ? (
              <PagoTarjetaConekta
                publicKey={conektaKey}
                montoTotal={total}
                msiMeses={msiOfrecibles}
                procesando={procesando}
                onPagar={(token, meses) => procesarPedido(token, meses)}
              />
            ) : permiteDemo ? (
              <>
                {msiOfrecibles.length > 0 && (
                  <div className="mb-4 rounded-lg border border-marca/30 bg-marca/5 p-3">
                    <p className="mb-2 flex items-center gap-1.5 font-medium text-marca text-sm">
                      <CreditCard size={16} strokeWidth={2} /> Meses sin intereses
                    </p>
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
                  Pago simulado con proveedor mock (sin cobro real). Configura Conekta para cobrar
                  de verdad con MSI.
                </p>
              </>
            ) : (
              <p
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                El pago en línea no está disponible en este momento. Tu carrito se conserva para que
                puedas intentarlo más tarde.
              </p>
            )}
          </fieldset>
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
  error,
  onRetry,
}: {
  opciones: OpcionEnvio[];
  tarifaId: string;
  onSelect: (id: string) => void;
  cotizando: boolean;
  direccionLista: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (!direccionLista) {
    return <p className="text-xs text-gray-400">Completa estado y CP para cotizar el envío.</p>;
  }
  if (cotizando) {
    return <p className="text-xs text-gray-400">Cotizando envío…</p>;
  }
  if (error) {
    return (
      <div role="alert" className="space-y-2 text-danger text-sm">
        <p>{error}</p>
        <button type="button" className="gx-btn-secondary" onClick={onRetry}>
          Reintentar envío
        </button>
      </div>
    );
  }
  if (opciones.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No hay opciones de envío disponibles para esta dirección. Verifica el código postal y
        estado, elige recoger en tienda o contacta al negocio antes de pagar.
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
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 font-medium text-sm ${
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
