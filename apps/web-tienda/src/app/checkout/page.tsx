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
import type { MedioPagoGuardado } from "@/lib/cliente";
import { Barcode, Clock, CreditCard, ImageOff, Landmark, Plus, Store, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

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
  metodosPago?: string[];
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

const FORM_PAGO_ID = "form-pago-tarjeta";

type MetodoPago = "tarjeta" | "oxxo" | "spei" | "cod";

/**
 * OXXO/SPEI devuelven un pago "pendiente": el pedido queda apartado esperando el
 * pago offline. Guardamos la referencia en localStorage para re-mostrarla si el
 * comprador vuelve antes de que llegue el webhook del proveedor (el intento
 * sigue bloqueado, así que no hay riesgo de doble pedido).
 */
interface PagoPendiente {
  folioPublico: string;
  total: string;
  referenciaPago: string;
  metodo: "oxxo" | "spei";
}
const PAGO_PENDIENTE_KEY = "gaespos_pago_pendiente_v1";

interface RespuestaCheckout {
  message?: string;
  intentStatus?: string;
  folioPublico?: string;
  total?: string;
  referenciaPago?: string;
}

/**
 * Un intento "pendiente" con referencia (OXXO/SPEI) NO es error: el pedido queda
 * apartado esperando el pago offline. Si ya teníamos esa referencia persistida
 * (re-consulta tras recargar), conserva su método; solo una compra nueva usa el
 * método seleccionado. Devuelve null cuando la respuesta no es un pendiente
 * referenciado.
 */
function resolverPagoPendiente(
  data: RespuestaCheckout,
  metodoSeleccionado: MetodoPago,
  previo: PagoPendiente | null,
): PagoPendiente | null {
  if (data.intentStatus !== "pendiente" || !data.referenciaPago) return null;
  const metodo =
    previo?.referenciaPago === data.referenciaPago
      ? previo.metodo
      : metodoSeleccionado === "spei"
        ? "spei"
        : "oxxo";
  return {
    folioPublico: data.folioPublico ?? "",
    total: data.total ?? "",
    referenciaPago: data.referenciaPago,
    metodo,
  };
}

function leerPagoPendiente(): PagoPendiente | null {
  try {
    const raw = localStorage.getItem(PAGO_PENDIENTE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PagoPendiente;
    if (typeof p?.folioPublico !== "string" || typeof p?.referenciaPago !== "string") return null;
    return { ...p, metodo: p.metodo === "spei" ? "spei" : "oxxo" };
  } catch {
    return null;
  }
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
  const [direccionId, setDireccionId] = useState("");
  const [modoDir, setModoDir] = useState<"guardada" | "nueva">("nueva");
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
  const [metodoPago, setMetodoPago] = useState<MetodoPago>("tarjeta");
  const [pagoPendiente, setPagoPendiente] = useState<PagoPendiente | null>(null);
  // "Mis tarjetas": tarjetas guardadas del comprador (pago en 1 toque).
  const [mediosPago, setMediosPago] = useState<MedioPagoGuardado[]>([]);
  // "" = pagar con tarjeta nueva; id = tarjeta guardada seleccionada.
  const [medioPagoSel, setMedioPagoSel] = useState("");
  const [guardarTarjeta, setGuardarTarjeta] = useState(false);
  const [sesionCliente, setSesionCliente] = useState(false);

  function marcarPendiente(p: PagoPendiente) {
    setPagoPendiente(p);
    try {
      localStorage.setItem(PAGO_PENDIENTE_KEY, JSON.stringify(p));
    } catch {
      // Sin persistencia la pantalla sigue funcionando en la sesión actual.
    }
  }

  function limpiarPendiente() {
    setPagoPendiente(null);
    try {
      localStorage.removeItem(PAGO_PENDIENTE_KEY);
    } catch {}
  }

  useEffect(() => {
    setPagoPendiente(leerPagoPendiente());
  }, []);

  useEffect(() => {
    setItems(leerCarrito());
    fetch("/api/tienda-config").then(async (res) => {
      if (res.ok) setConfig((await res.json()) as TiendaConfig);
    });
    // prefill con la sesión del cliente si está logueado
    fetch("/api/cuenta/me").then(async (res) => {
      if (!res.ok) return;
      setSesionCliente(true);
      const me = (await res.json()) as { nombre: string; email: string | null };
      setEmail((prev) => prev || (me.email ?? ""));
      setNombre((prev) => prev || me.nombre);
    });
    // tarjetas guardadas ("Mis tarjetas"): [] para invitado; con al menos una,
    // la primera queda pre-seleccionada para pagar en 1 toque.
    fetch("/api/cuenta/medios-pago").then(async (res) => {
      if (!res.ok) return;
      const medios = (await res.json()) as MedioPagoGuardado[];
      if (!Array.isArray(medios) || medios.length === 0) return;
      setMediosPago(medios);
      setMedioPagoSel(medios[0]?.id ?? "");
    });
    // direcciones guardadas (checkout rápido): la predeterminada queda pre-seleccionada
    fetch("/api/cuenta/direcciones").then(async (res) => {
      if (!res.ok) return;
      const dirs = (await res.json()) as DireccionGuardada[];
      if (!Array.isArray(dirs) || dirs.length === 0) return;
      setDirecciones(dirs);
      const def = dirs.find((d) => d.isDefaultEnvio) ?? dirs[0];
      if (def) {
        setDireccionId(def.id);
        setModoDir("guardada");
        usarDireccion(def);
      }
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
  // Pagar al recoger no necesita proveedor de pagos: el cobro ocurre en el mostrador.
  const permiteDemo = process.env.NODE_ENV !== "production";
  // MSI ofrecibles para esta compra (activos + total sobre el mínimo).
  const msiOfrecibles =
    config?.msiHabilitado && total >= Number(config.msiMontoMinimo) ? config.msiMeses : [];

  function validar(): boolean {
    if (!entregaLista) {
      setError("Selecciona una opción de entrega disponible antes de pagar.");
      return false;
    }
    if (!nombre.trim()) {
      setError("Completa tu nombre");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresa un correo válido para recibir tu confirmación.");
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

  function manejarNoConfirmado(data: RespuestaCheckout) {
    if (data.intentStatus === "fallido") limpiarPendiente();
    setError(
      data.intentStatus === "fallido"
        ? "Este intento no pudo completarse. Contacta a la tienda antes de iniciar otro pago."
        : "Tu pago sigue pendiente de confirmación. Consulta este mismo intento; no vuelvas a pagar.",
    );
  }

  async function handleCheckoutResponse(response: Response, current: CheckoutAttempt) {
    const data = (await response.json()) as RespuestaCheckout;
    if (!response.ok)
      throw new Error(data.message ?? "Estamos verificando el pago. No vuelvas a pagar.");
    // Pago referenciado (OXXO/SPEI): NO es error; el pedido queda apartado
    // esperando el pago offline y el proveedor confirma por webhook.
    const pendiente = resolverPagoPendiente(data, metodoActivo, pagoPendiente);
    if (pendiente) {
      marcarPendiente(pendiente);
      return;
    }
    if (data.intentStatus !== "confirmado" || !data.folioPublico) {
      manejarNoConfirmado(data);
      return;
    }
    limpiarPendiente();
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

  async function procesarPedido(
    metodo: MetodoPago,
    cardTokenId?: string,
    meses?: number | null,
    extra?: { medioPagoGuardadoId?: string; guardarTarjeta?: boolean },
  ) {
    if (!attempt || procesando) return;
    if (attempt.submitted) {
      await consultarPedido();
      return;
    }
    if (metodo === "tarjeta" && !cardTokenId && !extra?.medioPagoGuardadoId && !permiteDemo) {
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
          metodoPago: metodo,
          ...(cupon.trim() ? { cuponCodigo: cupon.trim() } : {}),
          ...(cardTokenId ? { cardTokenId } : {}),
          ...(extra?.medioPagoGuardadoId ? { medioPagoGuardadoId: extra.medioPagoGuardadoId } : {}),
          ...(extra?.guardarTarjeta ? { guardarTarjeta: true } : {}),
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

  if (pagoPendiente) {
    return (
      <PantallaPagoPendiente
        pago={pagoPendiente}
        email={email}
        procesando={procesando}
        onConsultar={consultarPedido}
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center">
        <h1 className="font-bold text-2xl">Tu carrito está vacío</h1>
        <Link href="/" className="mt-4 inline-block text-marca">
          Ver catálogo
        </Link>
      </div>
    );
  }

  const pagoDeshabilitado = !entregaLista || !attempt || attempt.submitted || procesando;
  const maxMsi = msiOfrecibles.length > 0 ? Math.max(...msiOfrecibles) : 0;
  // Métodos que el tenant ofrece (los anuncia el API según su proveedor). El
  // método activo siempre pertenece a la lista: si la config aún no carga, solo
  // existe tarjeta (comportamiento previo a OXXO/SPEI).
  // Pagar al recoger no depende del proveedor: se ofrece cuando el pedido se
  // recoge en tienda, porque el cobro ocurre en el mostrador.
  const metodosDisponibles = [
    ...(config?.metodosPago ?? ["tarjeta"]),
    ...(modoEntrega === "pickup" ? ["cod"] : []),
  ];
  const metodoActivo = (
    metodosDisponibles.includes(metodoPago) ? metodoPago : (metodosDisponibles[0] ?? "tarjeta")
  ) as MetodoPago;
  const mostrarSelector = metodosDisponibles.length > 1;
  const opcionesPago = (
    [
      {
        id: "tarjeta",
        titulo: "Tarjeta de crédito o débito",
        descripcion: `Visa · Mastercard · AMEX${maxMsi > 0 ? ` · hasta ${maxMsi} meses sin intereses` : ""}`,
        icon: <CreditCard size={16} strokeWidth={2} />,
      },
      {
        id: "oxxo",
        titulo: "OXXO",
        descripcion: "Paga en efectivo en cualquier OXXO",
        icon: <Barcode size={16} strokeWidth={2} />,
      },
      {
        id: "spei",
        titulo: "SPEI",
        descripcion: "Transferencia desde tu banco",
        icon: <Landmark size={16} strokeWidth={2} />,
      },
      {
        id: "cod",
        titulo: "Paga al recoger en la tienda",
        descripcion: "Apartamos tu pedido y pagas cuando lo recojas",
        icon: <Store size={16} strokeWidth={2} />,
      },
    ] satisfies Array<{ id: MetodoPago; titulo: string; descripcion: string; icon: ReactNode }>
  ).filter((o) => metodosDisponibles.includes(o.id));

  // "Mis tarjetas": tarjeta guardada seleccionada (pago en 1 toque) o tarjeta nueva.
  const tarjetaGuardadaSel = mediosPago.find((m) => m.id === medioPagoSel) ?? null;
  const pagarConTarjetaNueva = !tarjetaGuardadaSel;

  return (
    <div className="mx-auto max-w-5xl pb-32 lg:pb-10">
      <h1 className="mb-6 font-bold text-2xl">Finalizar compra</h1>

      <div className="lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          {/* ① Entrega */}
          <SeccionCheckout paso={1} titulo="¿A dónde lo llevas?">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Email" value={email} onChange={setEmail} type="email" required />
              <Campo label="Nombre completo" value={nombre} onChange={setNombre} required />
            </div>

            <div className="mt-4 flex gap-2">
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
              <div role="alert" className="mt-3 space-y-2 text-danger text-sm">
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
              <div className="mt-4 space-y-3">
                {direcciones.length > 0 && (
                  <div className="space-y-2" role="radiogroup" aria-label="Dirección de envío">
                    {direcciones.map((d) => {
                      const seleccionada = modoDir === "guardada" && direccionId === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          // biome-ignore lint/a11y/useSemanticElements: radiogroup WAI-ARIA con botones (focusables y operables con Enter/Espacio); input radio nativo no permite el contenido rico de la tarjeta
                          role="radio"
                          aria-checked={seleccionada}
                          onClick={() => {
                            setModoDir("guardada");
                            setDireccionId(d.id);
                            usarDireccion(d);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${
                            seleccionada
                              ? "border-marca bg-marca/5 ring-1 ring-marca"
                              : "border-slate-300 hover:border-marca"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                              seleccionada ? "border-marca" : "border-slate-300"
                            }`}
                          >
                            {seleccionada && <span className="h-2 w-2 rounded-full bg-marca" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {d.etiqueta}
                              {d.isDefaultEnvio && (
                                <span className="ml-1 font-normal text-marca text-xs">
                                  · predeterminada
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-slate-500 text-xs">
                              {d.calle} {d.numeroExterior}
                              {d.colonia ? `, ${d.colonia}` : ""} {d.municipio} · CP{" "}
                              {d.codigoPostal}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      // biome-ignore lint/a11y/useSemanticElements: radiogroup WAI-ARIA con botones — ver nota del button de direccion guardada
                      role="radio"
                      aria-checked={modoDir === "nueva"}
                      onClick={() => {
                        setModoDir("nueva");
                        setDireccionId("");
                        setCalle("");
                        setNumero("");
                        setColonia("");
                        setCiudad("");
                        setEstado("");
                        setCp("");
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${
                        modoDir === "nueva"
                          ? "border-marca bg-marca/5 ring-1 ring-marca"
                          : "border-slate-300 hover:border-marca"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          modoDir === "nueva" ? "border-marca" : "border-slate-300"
                        }`}
                      >
                        {modoDir === "nueva" && <span className="h-2 w-2 rounded-full bg-marca" />}
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <Plus size={14} strokeWidth={2.5} /> Nueva dirección
                      </span>
                    </button>
                  </div>
                )}

                {modoDir === "nueva" && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <Campo label="Calle" value={calle} onChange={setCalle} required />
                      </div>
                      <Campo label="Número" value={numero} onChange={setNumero} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Campo label="Colonia" value={colonia} onChange={setColonia} />
                      <Campo label="Ciudad" value={ciudad} onChange={setCiudad} required />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Campo label="Estado" value={estado} onChange={setEstado} required />
                      <Campo label="Código postal" value={cp} onChange={setCp} required />
                    </div>
                    <label className="flex items-center gap-2 text-slate-600 text-sm">
                      <input
                        type="checkbox"
                        checked={guardarDir}
                        onChange={(e) => setGuardarDir(e.target.checked)}
                      />
                      Guardar esta dirección para próximas compras
                    </label>
                  </>
                )}

                <OpcionesEnvio
                  opciones={opcionesEnvio}
                  tarifaId={tarifaId}
                  onSelect={setTarifaId}
                  cotizando={cotizando}
                  error={errorEnvio}
                  onRetry={() => setReintentoEntrega((n) => n + 1)}
                  direccionLista={cp.length === 5 && estado.trim().length >= 3}
                />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
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
                    <span className="text-slate-500">
                      listo en ~{p.tiempoPreparacionPromedioMin} min
                    </span>
                    <span className="font-semibold text-ok">Gratis</span>
                  </label>
                ))}
              </div>
            )}
          </SeccionCheckout>

          {/* ② Pago */}
          <SeccionCheckout paso={2} titulo="¿Cómo pagas?">
            {mostrarSelector ? (
              <div className="space-y-2" role="radiogroup" aria-label="Método de pago">
                {opcionesPago.map((o) => {
                  const activa = metodoActivo === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      // biome-ignore lint/a11y/useSemanticElements: radiogroup WAI-ARIA con botones (focusables y operables con Enter/Espacio); input radio nativo no permite el contenido rico de la tarjeta — mismo patrón que direcciones guardadas
                      role="radio"
                      aria-checked={activa}
                      onClick={() => setMetodoPago(o.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${
                        activa
                          ? "border-marca bg-marca/5 ring-1 ring-marca"
                          : "border-slate-300 hover:border-marca"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          activa ? "border-marca" : "border-slate-300"
                        }`}
                      >
                        {activa && <span className="h-2 w-2 rounded-full bg-marca" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-medium">
                          {o.icon} {o.titulo}
                        </span>
                        <span className="block text-slate-500 text-xs">{o.descripcion}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-marca bg-marca/5 p-3 ring-1 ring-marca">
                <p className="flex items-center gap-2 font-medium text-sm">
                  <CreditCard size={16} strokeWidth={2} /> Tarjeta de crédito o débito
                </p>
                <p className="mt-0.5 text-slate-500 text-xs">
                  Visa · Mastercard · AMEX
                  {maxMsi > 0 && ` · hasta ${maxMsi} meses sin intereses`}
                </p>
              </div>
            )}

            {!attempt && (
              <div className="mt-3 space-y-2 text-sm text-slate-600">
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
              <div className="mt-3 space-y-2 text-sm text-slate-600">
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
            {metodoActivo === "tarjeta" ? (
              <fieldset disabled={pagoDeshabilitado} className="mt-3 min-w-0">
                {mediosPago.length > 0 && (
                  <div className="mb-3 space-y-2" role="radiogroup" aria-label="Tu tarjeta">
                    <p className="gx-label">Tu tarjeta</p>
                    {mediosPago.map((m) => {
                      const seleccionada = tarjetaGuardadaSel?.id === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          // biome-ignore lint/a11y/useSemanticElements: radiogroup WAI-ARIA con botones (mismo patrón que direcciones guardadas)
                          role="radio"
                          aria-checked={seleccionada}
                          onClick={() => setMedioPagoSel(m.id)}
                          className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${
                            seleccionada
                              ? "border-marca bg-marca/5 ring-1 ring-marca"
                              : "border-slate-300 hover:border-marca"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                              seleccionada ? "border-marca" : "border-slate-300"
                            }`}
                          >
                            {seleccionada && <span className="h-2 w-2 rounded-full bg-marca" />}
                          </span>
                          <CreditCard size={16} strokeWidth={2} className="flex-shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium capitalize">{m.marca}</span>
                            <span className="block text-slate-500 text-xs">
                              •••• {m.last4} · exp {String(m.expMes).padStart(2, "0")}/{m.expAnio}
                            </span>
                          </span>
                          <span className="text-marca text-xs">1 toque</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      // biome-ignore lint/a11y/useSemanticElements: radiogroup WAI-ARIA con botones — ver nota del selector de tarjetas guardadas
                      role="radio"
                      aria-checked={pagarConTarjetaNueva}
                      onClick={() => setMedioPagoSel("")}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${
                        pagarConTarjetaNueva
                          ? "border-marca bg-marca/5 ring-1 ring-marca"
                          : "border-slate-300 hover:border-marca"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                          pagarConTarjetaNueva ? "border-marca" : "border-slate-300"
                        }`}
                      >
                        {pagarConTarjetaNueva && <span className="h-2 w-2 rounded-full bg-marca" />}
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <Plus size={14} strokeWidth={2.5} /> Usar otra tarjeta
                      </span>
                    </button>
                  </div>
                )}

                {tarjetaGuardadaSel ? (
                  <div className="rounded-lg border border-marca bg-marca/5 p-3 ring-1 ring-marca">
                    <p className="flex items-center gap-2 font-medium text-sm">
                      <CreditCard size={16} strokeWidth={2} />
                      <span className="capitalize">{tarjetaGuardadaSel.marca}</span> ••••{" "}
                      {tarjetaGuardadaSel.last4}
                    </p>
                    <p className="mt-0.5 text-slate-500 text-xs">
                      Expira {String(tarjetaGuardadaSel.expMes).padStart(2, "0")}/
                      {tarjetaGuardadaSel.expAnio} · pagas en un paso sin volver a capturar tu
                      tarjeta
                    </p>
                  </div>
                ) : conektaKey ? (
                  <>
                    <PagoTarjetaConekta
                      publicKey={conektaKey}
                      montoTotal={total}
                      msiMeses={msiOfrecibles}
                      procesando={procesando}
                      formId={FORM_PAGO_ID}
                      onPagar={(token, meses) =>
                        procesarPedido("tarjeta", token, meses, {
                          ...(guardarTarjeta ? { guardarTarjeta: true } : {}),
                        })
                      }
                    />
                    {sesionCliente && (
                      <label className="mt-3 flex items-center gap-2 text-slate-600 text-sm">
                        <input
                          type="checkbox"
                          checked={guardarTarjeta}
                          onChange={(e) => setGuardarTarjeta(e.target.checked)}
                        />
                        Guardar mi tarjeta para la próxima vez
                      </label>
                    )}
                  </>
                ) : permiteDemo ? (
                  <>
                    {msiOfrecibles.length > 0 && (
                      <div className="mb-4 rounded-lg border border-marca/30 bg-marca/5 p-3">
                        <p className="mb-2 flex items-center gap-1.5 font-medium text-marca text-sm">
                          <CreditCard size={16} strokeWidth={2} /> Meses sin intereses
                        </p>
                        <div className="space-y-1 text-slate-600 text-sm">
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
                      onClick={() => procesarPedido("tarjeta")}
                      disabled={procesando}
                      className="gx-btn-primary w-full !py-3"
                    >
                      {procesando ? "Procesando pago…" : `Pagar $${total.toFixed(2)} (demo)`}
                    </button>
                    <p className="mt-2 text-center text-slate-400 text-xs">
                      Pago simulado con proveedor mock (sin cobro real). Configura Conekta para
                      cobrar de verdad con MSI.
                    </p>
                  </>
                ) : (
                  <p
                    role="alert"
                    className="rounded-lg border border-warn/40 bg-warn-light p-3 text-sm text-warn"
                  >
                    El pago en línea no está disponible en este momento. Tu carrito se conserva para
                    que puedas intentarlo más tarde.
                  </p>
                )}
              </fieldset>
            ) : (
              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {opcionesPago.find((o) => o.id === metodoActivo)?.icon}
                  {opcionesPago.find((o) => o.id === metodoActivo)?.titulo}
                </p>
                <p className="text-slate-600">
                  {metodoActivo === "oxxo"
                    ? "Al confirmar tu compra te mostraremos la referencia para pagar en efectivo en cualquier OXXO. Tu pedido queda apartado mientras realizas tu pago."
                    : metodoActivo === "spei"
                      ? "Al confirmar tu compra te mostraremos la CLABE para transferir desde tu banca en línea. Tu pedido queda apartado mientras realizas tu pago."
                      : "No se te cobra nada ahora. Apartamos tu pedido y pagas en la tienda cuando lo recojas."}
                </p>
              </div>
            )}
          </SeccionCheckout>
        </div>

        {/* ③ Resumen */}
        <aside className="mt-4 lg:sticky lg:top-32 lg:mt-0">
          <div className="gx-card !p-4">
            <p className="mb-3 font-medium text-sm">Tu pedido ({items.length})</p>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {items.map((i) => (
                <div key={i.varianteId} className="flex items-center gap-3 text-sm">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-lg">
                    {i.imagenUrl ? (
                      <img
                        src={i.imagenUrl}
                        alt={i.titulo}
                        className="h-full w-full rounded object-cover"
                      />
                    ) : (
                      <ImageOff size={20} strokeWidth={1.5} className="text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.titulo}</p>
                    <p className="text-slate-500">
                      {i.cantidad} × ${Number(i.precio).toFixed(2)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-semibold">
                    ${(Number(i.precio) * i.cantidad).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {config?.envioGratisDesde && (
              <div className="mt-3">
                <BarraEnvioGratis subtotal={subtotal} umbral={Number(config.envioGratisDesde)} />
              </div>
            )}

            {config?.cuponEnCheckout && (
              <div className="mt-3">
                <span className="gx-label">¿Tienes un cupón?</span>
                <div className="flex gap-2">
                  <input
                    value={cupon}
                    onChange={(e) => {
                      setCupon(e.target.value.toUpperCase());
                      setCuponInfo(null);
                    }}
                    placeholder="CODIGO"
                    className="gx-input flex-1 uppercase"
                  />
                  <button type="button" onClick={aplicarCupon} className="gx-btn-secondary">
                    Aplicar
                  </button>
                </div>
                {cuponInfo && (
                  <p className={`mt-1 text-sm ${cuponOk ? "text-ok" : "text-danger"}`}>
                    {cuponOk ? "✓ " : "✕ "}
                    {cuponInfo.mensaje}
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 border-t pt-3">
              <div className="mb-1 flex justify-between text-slate-600 text-sm">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {descuentoCupon > 0 && (
                <div className="mb-1 flex justify-between text-ok text-sm">
                  <span>Descuento ({cupon})</span>
                  <span>−${descuentoCupon.toFixed(2)}</span>
                </div>
              )}
              <div className="mb-2 flex justify-between text-slate-600 text-sm">
                <span>Envío</span>
                <span>
                  {!entregaLista
                    ? "Por confirmar"
                    : costoEnvio === 0
                      ? "Gratis"
                      : `$${costoEnvio.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>{entregaLista ? "Total con envío" : "Subtotal con descuentos"}</span>
                <span className="text-marca">${total.toFixed(2)}</span>
              </div>
            </div>

            {!entregaLista && (
              <output className="mt-2 block text-sm text-slate-600">
                Confirma una opción de entrega para habilitar el pago.
              </output>
            )}
            {error && (
              <p role="alert" className="mt-2 rounded bg-danger-light p-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* Total negro siempre visible */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-800 text-white shadow-[0_-4px_12px_rgb(0_0_0/0.25)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-white/70 text-xs">
              {entregaLista ? "Total con envío" : "Subtotal (envío por confirmar)"}
            </p>
            <p className="font-bold text-xl leading-tight">${total.toFixed(2)}</p>
          </div>
          {attempt?.submitted ? (
            <button
              type="button"
              onClick={consultarPedido}
              disabled={procesando}
              className="gx-btn bg-ok !py-3 !px-6 text-base text-white hover:bg-ok/85"
            >
              {procesando ? "Consultando…" : "Consultar pago"}
            </button>
          ) : metodoActivo !== "tarjeta" ? (
            <button
              type="button"
              onClick={() => procesarPedido(metodoActivo)}
              disabled={pagoDeshabilitado}
              className="gx-btn bg-ok !py-3 !px-8 text-base text-white hover:bg-ok/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {procesando
                ? "Procesando…"
                : metodoActivo === "cod"
                  ? `Apartar pedido · $${total.toFixed(2)}`
                  : `Pagar $${total.toFixed(2)}`}
            </button>
          ) : tarjetaGuardadaSel ? (
            <button
              type="button"
              onClick={() =>
                procesarPedido("tarjeta", undefined, undefined, {
                  medioPagoGuardadoId: tarjetaGuardadaSel.id,
                })
              }
              disabled={pagoDeshabilitado}
              className="gx-btn bg-ok !py-3 !px-8 text-base text-white hover:bg-ok/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {procesando ? "Procesando…" : `Pagar $${total.toFixed(2)}`}
            </button>
          ) : conektaKey ? (
            <button
              type="submit"
              form={FORM_PAGO_ID}
              disabled={pagoDeshabilitado}
              className="gx-btn bg-ok !py-3 !px-8 text-base text-white hover:bg-ok/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {procesando ? "Procesando…" : "Pagar"}
            </button>
          ) : permiteDemo ? (
            <button
              type="button"
              onClick={() => procesarPedido("tarjeta")}
              disabled={pagoDeshabilitado}
              className="gx-btn bg-ok !py-3 !px-6 text-base text-white hover:bg-ok/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {procesando ? "Procesando…" : `Pagar $${total.toFixed(2)} (demo)`}
            </button>
          ) : (
            <button
              type="button"
              disabled
              title="El pago en línea no está disponible en este momento"
              className="gx-btn bg-ok !py-3 !px-8 text-base text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pagar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Resultado de OXXO/SPEI: el intento queda "pendiente" y el proveedor confirma
 * por webhook al recibir el pago. Mostramos folio, total y la referencia/CLABE
 * para que el comprador pague offline; NO es un error ni se descarta el pedido.
 */
function PantallaPagoPendiente({
  pago,
  email,
  procesando,
  onConsultar,
}: {
  pago: PagoPendiente;
  email: string;
  procesando: boolean;
  onConsultar: () => Promise<void>;
}) {
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState(false);
  const esSpei = pago.metodo === "spei";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pago.referenciaPago);
      setCopiado(true);
      setErrorCopia(false);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErrorCopia(true);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="gx-card !p-6 text-center">
        <span className="gx-badge-warn inline-flex items-center gap-1.5">
          <Clock size={14} strokeWidth={2} /> Pago pendiente
        </span>
        <h1 className="mt-3 font-bold text-2xl text-slate-900">Tu pedido quedó apartado</h1>
        <p className="mt-1 text-slate-600 text-sm">
          Realiza tu pago para que la tienda confirme tu pedido.
        </p>

        <div className="mx-auto mt-5 flex max-w-md justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-left">
            <p className="gx-label">Folio del pedido</p>
            <p className="font-semibold">{pago.folioPublico || "—"}</p>
          </div>
          <div className="text-right">
            <p className="gx-label">Total a pagar</p>
            <p className="font-semibold">{pago.total ? `$${pago.total}` : "—"}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-marca/30 bg-marca/5 p-4">
          <p className="gx-label">
            {esSpei ? "CLABE interbancaria (18 dígitos)" : "Referencia OXXO"}
          </p>
          <p className="mt-1 flex items-center justify-center gap-2 font-mono text-xl font-bold tracking-wider text-marca">
            {esSpei ? (
              <Landmark size={20} strokeWidth={2} />
            ) : (
              <Barcode size={20} strokeWidth={2} />
            )}
            {pago.referenciaPago}
          </p>
          <button type="button" onClick={copiar} className="gx-btn-secondary mt-3 w-full sm:w-auto">
            {copiado ? "Copiado ✓" : "Copiar"}
          </button>
          {errorCopia && (
            <p role="alert" className="mt-2 text-danger text-xs">
              No se pudo copiar automáticamente; anota la {esSpei ? "CLABE" : "referencia"}.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-sm text-slate-600">
          {esSpei ? (
            <p>
              Transfiere el monto exacto desde la app o la banca en línea de tu banco usando la
              CLABE de arriba. Como concepto puedes indicar el folio de tu pedido.
            </p>
          ) : (
            <p>Ve a cualquier OXXO, muestra la referencia en caja y paga el monto en efectivo.</p>
          )}
        </div>

        <p className="mt-4 text-slate-600 text-sm">
          La tienda confirma tu pago al recibirlo y te avisará por correo. Conserva tu folio para el
          seguimiento.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onConsultar}
            disabled={procesando}
            className="gx-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {procesando ? "Consultando…" : "Ya pagué · consultar estado"}
          </button>
          <Link
            href={`/seguimiento?folio=${encodeURIComponent(pago.folioPublico)}&email=${encodeURIComponent(email)}`}
            className="gx-btn-secondary"
          >
            Seguir mi pedido
          </Link>
          <Link href="/cuenta" className="gx-btn-ghost">
            Mis pedidos
          </Link>
        </div>
      </div>
    </div>
  );
}

function SeccionCheckout({
  paso,
  titulo,
  children,
}: {
  paso: number;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="gx-card mb-4 !p-4 sm:!p-5">
      <h2 className="mb-4 flex items-center gap-2.5 font-bold text-lg text-slate-900">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-marca text-sm text-white font-bold">
          {paso}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
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
    return <p className="text-xs text-slate-400">Completa estado y CP para cotizar el envío.</p>;
  }
  if (cotizando) {
    return <p className="text-xs text-slate-400">Cotizando envío…</p>;
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
      <p className="text-xs text-slate-500">
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
            <span className="text-slate-500">{o.diasEntregaEstimados} días</span>
          )}
          <span className={o.gratis ? "font-semibold text-ok" : "font-semibold"}>
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
  label: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={activo ? "gx-btn-primary flex-1" : "gx-btn-secondary flex-1"}
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
      <span className="gx-label">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="gx-input"
      />
    </label>
  );
}
