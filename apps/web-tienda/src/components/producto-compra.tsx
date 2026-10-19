"use client";

import { cantidadCompra } from "@/lib/cantidad-compra";
import {
  type CarritoLineaLocal,
  agregar,
  leerCarrito,
  propietarioCarrito,
} from "@/lib/carrito-store";
import { etiquetaUnidad } from "@/lib/etiquetas";
import { Check, Minus, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Dispatch, type SetStateAction, useEffect, useId, useRef, useState } from "react";
import { AvisoStock } from "./aviso-stock";
import { CalculadoraEnvio } from "./calculadora-envio";

export interface VarianteCompra {
  id: string;
  precioBase: string;
  nombreVariante: string | null;
  opciones?: Record<string, string> | null;
}

interface MsiConfig {
  habilitado: boolean;
  meses: number[];
  montoMinimo: string;
}

function etiquetaVariante(v: VarianteCompra, i: number): string {
  if (v.nombreVariante) return v.nombreVariante;
  const ops = v.opciones ? Object.values(v.opciones) : [];
  return ops.length ? ops.join(" · ") : `Opción ${i + 1}`;
}

export interface OfertaCompra {
  precioPromocion: string;
  descuentoPct: number;
}

export function ProductoCompra(props: Parameters<typeof CompraContexto>[0]) {
  const identidad = JSON.stringify([
    props.productoPublicadoId ?? props.slugSeo ?? props.titulo,
    props.variantes.map((v) => v.id),
  ]);
  return <CompraContexto key={identidad} {...props} />;
}

function CompraContexto({
  variantes,
  precioOverride,
  titulo,
  comprarAhora,
  msi,
  oferta,
  stockPublico,
  stockBajo,
  envioGratis,
  unidadMedida,
  imagenUrl,
  slugSeo,
  productoPublicadoId,
  stockPorVariante,
  tipoVenta = "unidad",
  mostrarCotizacion = false,
}: {
  variantes: VarianteCompra[];
  precioOverride: string | null;
  titulo: string;
  comprarAhora: boolean;
  msi: MsiConfig;
  oferta?: OfertaCompra | null;
  stockPublico?: number | null;
  stockBajo?: boolean;
  envioGratis?: boolean;
  unidadMedida?: string | null;
  imagenUrl?: string;
  slugSeo?: string;
  productoPublicadoId?: string;
  stockPorVariante?: Record<string, number> | null;
  tipoVenta?: string;
  mostrarCotizacion?: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(() =>
    Math.max(
      0,
      variantes.findIndex((v) => !stockPorVariante || (stockPorVariante[v.id] ?? 0) > 0),
    ),
  );
  const [cantidadTexto, setCantidadTexto] = useState("1");
  const [enCarrito, setEnCarrito] = useState<Record<string, number>>({});
  const [errorCantidad, setErrorCantidad] = useState<string | null>(null);
  const [agregado, setAgregado] = useState(false);
  const [lista, setLista] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [contextoMostrado, setContextoMostrado] = useState(0);
  const contextoActual = useRef(0);
  const activo = useRef(false);
  const bloqueado = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const owner = useRef<string | null>(null);
  const confirmacion = useRef<string | null>(null);
  const errorId = useId();
  useEffect(() => {
    activo.current = true;
    const limpiar = () => {
      if (timer.current) clearTimeout(timer.current);
      bloqueado.current = false;
      confirmacion.current = null;
      setAgregado(false);
      setGuardando(false);
    };
    const actualizar = () => {
      try {
        const items = leerCarrito();
        if (confirmacion.current !== null && confirmacion.current !== JSON.stringify(items))
          limpiar();
        setEnCarrito(Object.fromEntries(items.map((i) => [i.varianteId, i.cantidad])));
        owner.current = propietarioCarrito();
        setLista(true);
      } catch {
        setLista(false);
        limpiar();
        setErrorCantidad(
          "No pudimos leer tu carrito. Revisa que el navegador permita guardar datos.",
        );
      }
    };
    const contexto = () => {
      contextoActual.current++;
      setContextoMostrado(contextoActual.current);
      limpiar();
      setCantidadTexto("1");
      setErrorCantidad(null);
      actualizar();
    };
    actualizar();
    window.addEventListener("carrito-actualizado", actualizar);
    window.addEventListener("carrito-contexto-cambiado", contexto);
    return () => {
      activo.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("carrito-actualizado", actualizar);
      window.removeEventListener("carrito-contexto-cambiado", contexto);
    };
  }, []);

  const variante = variantes[sel] ?? variantes[0];
  if (!variante) return null;
  const {
    precioLista,
    precioNum,
    precio,
    stockElegido,
    paso,
    sinStock,
    cantidad,
    restante,
    limiteAlcanzado,
    fraccion,
    cantidadFormatoValido,
    cantidadValida,
    precioValido,
  } = calcularCompra(variante, enCarrito[variante.id] ?? 0, cantidadTexto, {
    precioOverride,
    oferta,
    stockPorVariante,
    stockPublico,
    tipoVenta,
  });

  function validarAdicion(items: CarritoLineaLocal[], variante: VarianteCompra) {
    const actual = items.find((i) => i.varianteId === variante.id);
    const validacion = cantidadCompra(
      cantidadTexto,
      fraccion,
      actual?.cantidad ?? 0,
      stockElegido ?? null,
    );
    if (!validacion.ok) {
      setErrorCantidad(validacion.mensaje);
      return null;
    }
    if (!actual && items.length >= 100) {
      setErrorCantidad(
        "Tu carrito admite hasta 100 productos distintos. Revísalo antes de agregar otro.",
      );
      return null;
    }
    return validacion;
  }
  function guardarLinea(
    variante: VarianteCompra,
    propietario: string | null,
    validacion: { cantidad: number; total: number },
  ) {
    try {
      agregar({
        varianteId: variante.id,
        titulo: variantes.length > 1 ? `${titulo} · ${etiquetaVariante(variante, sel)}` : titulo,
        precio,
        cantidad: validacion.cantidad,
        ...(imagenUrl ? { imagenUrl } : {}),
        ...(slugSeo ? { slugSeo } : {}),
      });
    } catch {
      // The local write can succeed before the sync callback fails. Never add again automatically.
      const guardado = leerCarrito().find((i) => i.varianteId === variante.id);
      if (
        propietario !== propietarioCarrito() ||
        guardado?.cantidad !== validacion.total ||
        guardado.precio !== precio
      )
        throw new Error();
      setErrorCantidad(
        "Selección guardada en este navegador. Revisa cualquier aviso de sincronización en tu carrito.",
      );
    }
  }
  function contextoEscribible() {
    return (
      activo.current && lista && !bloqueado.current && contextoMostrado === contextoActual.current
    );
  }
  function alCarrito() {
    if (!variante || !contextoEscribible()) return false;
    if (owner.current !== propietarioCarrito()) return false;
    if (!precioValido) {
      setErrorCantidad("No pudimos confirmar el precio de esta opción.");
      return false;
    }
    try {
      const items = leerCarrito();
      const propietario = owner.current;
      const validacion = validarAdicion(items, variante);
      if (!validacion) return false;
      bloqueado.current = true;
      setGuardando(true);
      setErrorCantidad(null);
      guardarLinea(variante, propietario, validacion);
      if (propietario !== propietarioCarrito()) throw new Error();
      confirmacion.current = JSON.stringify(leerCarrito());
      return true;
    } catch {
      bloqueado.current = false;
      setGuardando(false);
      setErrorCantidad(
        "No pudimos confirmar el cambio. Revisa tu carrito antes de volver a intentar.",
      );
      return false;
    }
  }
  function seleccionarVariante(i: number) {
    if (timer.current) clearTimeout(timer.current);
    bloqueado.current = false;
    confirmacion.current = null;
    setGuardando(false);
    setSel(i);
    setCantidadTexto("1");
    setErrorCantidad(null);
    setAgregado(false);
  }
  function cambiarCantidad(value: SetStateAction<string>) {
    setCantidadTexto(value);
    setErrorCantidad(null);
  }
  function onAgregar() {
    if (!alCarrito()) return;
    setAgregado(true);
    timer.current = setTimeout(() => {
      bloqueado.current = false;
      setGuardando(false);
      setAgregado(false);
      confirmacion.current = null;
    }, 1500);
  }
  function onComprarAhora() {
    if (!alCarrito()) return;
    router.push("/checkout");
  }

  const mostrarMsi =
    precioValido && msi.habilitado && msi.meses.length > 0 && precioNum >= Number(msi.montoMinimo);
  const mejorPlazo = mostrarMsi ? Math.max(...msi.meses) : 0;
  const unidad = etiquetaUnidad(unidadMedida);

  return (
    <div className="mt-4">
      <PrecioProducto
        oferta={oferta}
        precioLista={precioLista}
        precioValido={precioValido}
        precioNum={precioNum}
        unidad={unidad}
        envioGratis={envioGratis}
        stockPorVariante={stockPorVariante}
        stockElegido={stockElegido}
        stockBajo={stockBajo}
        sinStock={sinStock}
        mostrarMsi={mostrarMsi}
        mejorPlazo={mejorPlazo}
      />

      <VariantesProducto
        variantes={variantes}
        sel={sel}
        stockPorVariante={stockPorVariante}
        seleccionar={seleccionarVariante}
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <CantidadProducto
          cantidad={cantidad}
          paso={paso}
          cantidadTexto={cantidadTexto}
          restante={restante}
          cantidadValida={cantidadValida}
          cantidadFormatoValido={cantidadFormatoValido}
          errorCantidad={errorCantidad}
          errorId={errorId}
          cambiarCantidad={cambiarCantidad}
        />
        <AccionesCompra
          contextoMostrado={contextoMostrado}
          onAgregar={onAgregar}
          onComprarAhora={onComprarAhora}
          bloqueado={!lista || !precioValido || guardando || sinStock || limiteAlcanzado}
          agregado={agregado}
          comprarAhora={comprarAhora}
        />
      </div>
      {errorCantidad && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-danger">
          {errorCantidad}
        </p>
      )}
      {!lista && (
        <button
          type="button"
          className="gx-btn-secondary mt-3 min-h-11"
          onClick={() => {
            setErrorCantidad(null);
            window.dispatchEvent(new Event("carrito-actualizado"));
          }}
        >
          Volver a leer carrito
        </button>
      )}
      {limiteAlcanzado && !sinStock && (
        <p className="mt-3 text-sm text-slate-600">
          Ya tienes en el carrito todas las unidades disponibles de esta opción.
        </p>
      )}

      <div aria-live="polite">
        {agregado && (
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 font-medium text-ok">
              <Check size={16} strokeWidth={2.5} /> Agregado al carrito
            </span>
            <Link
              href="/carrito"
              className="inline-flex min-h-11 items-center font-medium text-marca hover:underline"
            >
              Ver carrito
            </Link>
          </p>
        )}
      </div>

      {sinStock && productoPublicadoId && <AvisoStock productoPublicadoId={productoPublicadoId} />}
      {mostrarCotizacion && (
        <CalculadoraEnvio
          subtotal={precioValido && cantidadFormatoValido ? precioNum * cantidad : Number.NaN}
        />
      )}
    </div>
  );
}

function PrecioProducto({
  oferta,
  precioLista,
  precioValido,
  precioNum,
  unidad,
  envioGratis,
  stockPorVariante,
  stockElegido,
  stockBajo,
  sinStock,
  mostrarMsi,
  mejorPlazo,
}: {
  oferta: OfertaCompra | null | undefined;
  precioLista: number;
  precioValido: boolean;
  precioNum: number;
  unidad: string | null;
  envioGratis: boolean | undefined;
  stockPorVariante: Record<string, number> | null | undefined;
  stockElegido: number | null | undefined;
  stockBajo: boolean | undefined;
  sinStock: boolean;
  mostrarMsi: boolean;
  mejorPlazo: number;
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-2">
        {oferta && Number.isFinite(precioLista) && precioLista >= 0 && (
          <span className="text-slate-400 text-lg line-through">${precioLista.toFixed(2)}</span>
        )}
        <p className="max-w-full break-all font-bold text-3xl text-marca">
          {precioValido ? `$${precioNum.toFixed(2)}` : "Precio no disponible"}
          {unidad && <span className="ml-1 font-normal text-slate-400 text-sm">{unidad}</span>}
        </p>
        {oferta && oferta.descuentoPct > 0 && (
          <span className="rounded bg-danger px-2 py-0.5 font-bold text-sm text-white">
            -{oferta.descuentoPct}%
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-sm">
        {envioGratis && (
          <span className="gx-badge-ok flex items-center gap-1">
            <Truck aria-hidden="true" className="shrink-0" size={14} strokeWidth={2} /> Envío gratis
            según zona y tarifa
          </span>
        )}
        {(stockPorVariante
          ? stockElegido != null && stockElegido > 0 && stockElegido <= 5
          : stockBajo) &&
          stockElegido != null &&
          Number.isFinite(stockElegido) &&
          stockElegido > 0 && (
            <span className="gx-badge-warn">
              Disponibles: {stockElegido} {unidad ?? ""}
            </span>
          )}
        {sinStock && <span className="gx-badge-danger">Sin stock</span>}
      </div>
      {mostrarMsi && (
        <p className="mt-1 text-slate-600 text-sm">
          o hasta <span className="font-semibold text-marca">{mejorPlazo} meses sin intereses</span>{" "}
          de ${(precioNum / mejorPlazo).toFixed(2)}
        </p>
      )}
    </>
  );
}

function VariantesProducto({
  variantes,
  sel,
  stockPorVariante,
  seleccionar,
}: {
  variantes: VarianteCompra[];
  sel: number;
  stockPorVariante: Record<string, number> | null | undefined;
  seleccionar: (i: number) => void;
}) {
  return (
    <>
      {variantes.length > 1 && (
        <div className="mt-4">
          <p className="mb-1 font-medium text-slate-700 text-sm">Elige una opción:</p>
          <div className="flex flex-wrap gap-2">
            {variantes.map((v, i) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={i === sel}
                onClick={() => seleccionar(i)}
                className={`min-h-11 rounded-lg border px-3 py-1.5 text-sm ${
                  i === sel
                    ? "border-marca bg-marca/10 font-medium text-marca"
                    : "border-slate-300 text-slate-700 hover:border-marca"
                }`}
              >
                {etiquetaVariante(v, i)}
                {stockPorVariante && (stockPorVariante[v.id] ?? 0) <= 0 && (
                  <span className="ml-1 text-xs text-slate-500">· Agotado</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CantidadProducto({
  cantidad,
  paso,
  cantidadTexto,
  restante,
  cantidadValida,
  cantidadFormatoValido,
  errorCantidad,
  errorId,
  cambiarCantidad,
}: {
  cantidad: number;
  paso: number;
  cantidadTexto: string;
  restante: number | null;
  cantidadValida: boolean;
  cantidadFormatoValido: boolean;
  errorCantidad: string | null;
  errorId: string;
  cambiarCantidad: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="flex items-center rounded-lg border border-slate-300">
      <button
        type="button"
        aria-label="Reducir cantidad"
        disabled={cantidad <= paso || !Number.isFinite(cantidad)}
        className="min-h-11 min-w-11 p-3 disabled:opacity-30"
        onClick={() => {
          cambiarCantidad((texto) =>
            String(
              Math.max(paso, (Math.round(Number(texto) * 1000) - Math.round(paso * 1000)) / 1000),
            ),
          );
        }}
      >
        <Minus size={16} />
      </button>
      <input
        type="number"
        min={paso}
        step={paso}
        max={Math.min(100000, restante ?? 100000)}
        value={cantidadTexto}
        onChange={(e) => {
          cambiarCantidad(e.target.value);
        }}
        aria-label="Cantidad"
        aria-invalid={!cantidadValida}
        aria-describedby={errorCantidad ? errorId : undefined}
        className="w-16 bg-transparent py-3 text-center outline-none focus:ring-2 focus:ring-marca"
      />
      <button
        type="button"
        aria-label="Aumentar cantidad"
        disabled={!cantidadFormatoValido || cantidad + paso > Math.min(100000, restante ?? 100000)}
        className="min-h-11 min-w-11 p-3 disabled:opacity-30"
        onClick={() => {
          cambiarCantidad((texto) =>
            String(
              Math.min(
                100000,
                Math.min(
                  restante ?? 100000,
                  (Math.round(Number(texto) * 1000) + Math.round(paso * 1000)) / 1000,
                ),
              ),
            ),
          );
        }}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function cantidadRestante(stockElegido: number | null | undefined, actual: number) {
  return stockElegido == null
    ? null
    : !Number.isFinite(stockElegido)
      ? 0
      : Math.max(
          0,
          (Math.floor(stockElegido * 1000 + 0.000001) - Math.round(actual * 1000)) / 1000,
        );
}

function calcularCompra(
  variante: VarianteCompra,
  actual: number,
  cantidadTexto: string,
  {
    precioOverride,
    oferta,
    stockPorVariante,
    stockPublico,
    tipoVenta,
  }: {
    precioOverride: string | null;
    oferta: OfertaCompra | null | undefined;
    stockPorVariante: Record<string, number> | null | undefined;
    stockPublico: number | null | undefined;
    tipoVenta: string;
  },
) {
  const precioLista = Number(precioOverride ?? variante.precioBase);
  const precioNum = oferta ? Number(oferta.precioPromocion) : precioLista;
  const precio = String(precioNum);
  const stockElegido = stockPorVariante ? (stockPorVariante[variante.id] ?? 0) : stockPublico;
  const paso = tipoVenta === "unidad" ? 1 : 0.001;
  const sinStock = stockElegido != null && (!Number.isFinite(stockElegido) || stockElegido < paso);
  const cantidad = Number(cantidadTexto);
  const restante = cantidadRestante(stockElegido, actual);
  const limiteAlcanzado = restante != null && restante < paso;
  const fraccion = tipoVenta !== "unidad";
  const formato = cantidadCompra(cantidadTexto, fraccion, 0, null);
  const cantidadFormatoValido = formato.ok;
  const cantidadValida = cantidadCompra(cantidadTexto, fraccion, actual, stockElegido ?? null).ok;
  const precioCrudo = oferta?.precioPromocion ?? precioOverride ?? variante.precioBase;
  const precioValido =
    /^\d{1,12}(?:\.\d{1,8})?$/.test(precioCrudo) && Number.isFinite(precioNum) && precioNum >= 0;

  return {
    precioLista,
    precioNum,
    precio,
    stockElegido,
    paso,
    sinStock,
    cantidad,
    restante,
    limiteAlcanzado,
    fraccion,
    cantidadFormatoValido,
    cantidadValida,
    precioValido,
  };
}

function AccionesCompra({
  contextoMostrado,
  onAgregar,
  onComprarAhora,
  bloqueado,
  agregado,
  comprarAhora,
}: {
  contextoMostrado: number;
  onAgregar: () => void;
  onComprarAhora: () => void;
  bloqueado: boolean;
  agregado: boolean;
  comprarAhora: boolean;
}) {
  return (
    <>
      <button
        key={`agregar:${contextoMostrado}`}
        type="button"
        onClick={onAgregar}
        disabled={bloqueado}
        className="gx-btn-secondary min-h-11 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {agregado && <Check size={16} strokeWidth={2.5} />}
        {agregado ? "Agregado" : "Agregar al carrito"}
      </button>
      {comprarAhora && (
        <button
          key={`comprar:${contextoMostrado}`}
          type="button"
          onClick={onComprarAhora}
          disabled={bloqueado}
          className="gx-btn-primary min-h-11 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Comprar ahora
        </button>
      )}
    </>
  );
}
