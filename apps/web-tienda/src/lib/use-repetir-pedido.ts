"use client";
import { useEffect, useRef, useState } from "react";
import {
  type CarritoLineaLocal,
  guardarCarrito,
  leerCarrito,
  propietarioCarrito,
} from "./carrito-store";
import { objetoRegistro } from "./producto-registro-contract";
import {
  ERROR_REPETIR,
  type PedidoRepetible,
  combinarPedido,
  leerPedidoRepetible,
} from "./repetir-pedido-contract";
import { type LineaVerificada, leerVerificacionCarrito } from "./verificar-carrito-contract";

type PedidoCuenta = { owner: string; pedido: PedidoRepetible };
type Vista = { base: CarritoLineaLocal[]; precios: LineaVerificada[]; seleccionadas: string[] };
type Fase = "cargando" | "listo" | "consultando" | "confirmando" | "exito";
class AvisoRepetir extends Error {}
async function solicitud(url: string, signal: AbortSignal, items?: CarritoLineaLocal[]) {
  const res = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal,
    ...(items
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
          }),
        }
      : {}),
  });
  const data: unknown = await res.json().catch(() => null);
  signal.throwIfAborted();
  if (!res.ok) throw Object.assign(new Error(ERROR_REPETIR), { status: res.status });
  return data;
}
async function verificar(items: CarritoLineaLocal[], signal: AbortSignal) {
  const rows = leerVerificacionCarrito(
    await solicitud("/api/carrito/verificar", signal, items),
    items,
  );
  if (!rows) throw new Error(ERROR_REPETIR);
  return rows;
}
async function verificarOwner(owner: string, signal: AbortSignal) {
  const data = await solicitud(
    `/api/cuenta/repetir-pedido?sesion=1&owner=${encodeURIComponent(owner)}`,
    signal,
  );
  if (!objetoRegistro(data) || data.owner !== owner)
    throw Object.assign(new Error(ERROR_REPETIR), { status: 409 });
}

/** The preview owns an exact cart/account snapshot. No order, payment or inventory writes. */
export function useRepetirPedido() {
  const [datos, setDatos] = useState<PedidoCuenta | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [fase, setFase] = useState<Fase>("cargando");
  const [aviso, setAviso] = useState("");
  const [actualizarPagina, setActualizarPagina] = useState(false);
  const [revision, setRevision] = useState(0);
  const ultimaRevision = useRef(revision);
  ultimaRevision.current = revision;
  const current = useRef<AbortController | null>(null);
  const ocupado = useRef(false);
  const firma = useRef<string | null>(null);
  const montado = useRef(false);
  const propio = useRef(false);

  useEffect(() => {
    montado.current = true;
    const invalidar = () => {
      current.current?.abort();
      current.current = null;
      ocupado.current = false;
      firma.current = null;
      setVista(null);
      setDatos(null);
      setAviso("");
      setFase("cargando");
      if (document.visibilityState === "visible") setRevision((n) => n + 1);
    };
    const cambio = () => {
      if (propio.current || firma.current === null) return;
      try {
        if (JSON.stringify(leerCarrito()) === firma.current) return;
      } catch {}
      current.current?.abort();
      current.current = null;
      ocupado.current = false;
      firma.current = null;
      setVista(null);
      setFase("listo");
      setAviso("Tu carrito cambió. Vuelve a revisar el pedido antes de agregarlo.");
    };
    window.addEventListener("carrito-contexto-cambiado", invalidar);
    window.addEventListener("carrito-actualizado", cambio);
    window.addEventListener("focus", invalidar);
    document.addEventListener("visibilitychange", invalidar);
    return () => {
      montado.current = false;
      current.current?.abort();
      current.current = null;
      window.removeEventListener("carrito-contexto-cambiado", invalidar);
      window.removeEventListener("carrito-actualizado", cambio);
      window.removeEventListener("focus", invalidar);
      document.removeEventListener("visibilitychange", invalidar);
    };
  }, []);
  useEffect(() => {
    const solicitudRevision = revision;
    const c = new AbortController();
    current.current?.abort();
    current.current = c;
    setDatos(null);
    setVista(null);
    setFase("cargando");
    setAviso("");
    setActualizarPagina(false);
    const signal = AbortSignal.any([c.signal, AbortSignal.timeout(20000)]);
    void solicitud("/api/cuenta/repetir-pedido", signal)
      .then((data) => {
        if (
          current.current !== c ||
          c.signal.aborted ||
          solicitudRevision !== ultimaRevision.current
        )
          return;
        if (
          !objetoRegistro(data) ||
          typeof data.owner !== "string" ||
          data.owner !== propietarioCarrito()
        )
          return;
        if (data.pedido === null) return;
        const pedido = leerPedidoRepetible(data.pedido);
        if (!pedido) throw new Error(ERROR_REPETIR);
        setDatos({ owner: data.owner, pedido });
        setFase("listo");
      })
      .catch((e) => {
        if (
          current.current === c &&
          !c.signal.aborted &&
          propietarioCarrito() &&
          ![401, 403, 409].includes(e?.status)
        ) {
          setAviso(ERROR_REPETIR);
          setFase("listo");
        }
      });
    return () => {
      c.abort();
      if (current.current === c) current.current = null;
    };
  }, [revision]);

  function empezar() {
    const c = new AbortController();
    current.current?.abort();
    current.current = c;
    ocupado.current = true;
    setAviso("");
    return { c, signal: AbortSignal.any([c.signal, AbortSignal.timeout(20000)]) };
  }
  function vigente(c: AbortController, owner: string) {
    if (current.current !== c || c.signal.aborted || !montado.current) return false;
    if (owner !== propietarioCarrito() || firma.current !== JSON.stringify(leerCarrito())) {
      setVista(null);
      firma.current = null;
      throw new AvisoRepetir(
        "Tu carrito o cuenta cambió. Vuelve a revisar antes de agregar productos.",
      );
    }
    return true;
  }
  function fallo(e: unknown, c: AbortController) {
    if (current.current !== c || c.signal.aborted) return;
    if ([401, 403, 409].includes((e as { status?: number })?.status ?? 0)) {
      setActualizarPagina(true);
      setVista(null);
      setDatos(null);
      firma.current = null;
      setAviso("La sesión cambió. Actualiza la página para continuar con tu cuenta.");
    } else setAviso(e instanceof AvisoRepetir ? e.message : ERROR_REPETIR);
    setFase("listo");
  }
  function terminar(c: AbortController) {
    if (current.current === c) ocupado.current = false;
  }

  async function revisar() {
    if (ocupado.current || !datos) return;
    const { c, signal } = empezar();
    setFase("consultando");
    try {
      const base = leerCarrito();
      firma.current = JSON.stringify(base);
      if (!vigente(c, datos.owner)) return;
      const target = combinarPedido(base, datos.pedido.items);
      if (!target)
        throw new AvisoRepetir(
          "La selección supera el límite del carrito. Revisa sus productos y cantidades.",
        );
      await verificarOwner(datos.owner, signal);
      const precios = await verificar(target, signal);
      if (!vigente(c, datos.owner)) return;
      const disponibles = new Set(
        precios.filter((p) => p.estado === "publicado").map((p) => p.varianteId),
      );
      setVista({
        base,
        precios,
        seleccionadas: datos.pedido.items
          .filter((i) => disponibles.has(i.varianteId))
          .map((i) => i.varianteId),
      });
      setFase("listo");
    } catch (e) {
      fallo(e, c);
    } finally {
      terminar(c);
    }
  }
  function cerrar() {
    if (ocupado.current) return;
    firma.current = null;
    setVista(null);
    setAviso("");
  }
  function seleccionar(id: string) {
    if (ocupado.current) return;
    setVista((v) =>
      v
        ? {
            ...v,
            seleccionadas: v.seleccionadas.includes(id)
              ? v.seleccionadas.filter((i) => i !== id)
              : [...v.seleccionadas, id],
          }
        : v,
    );
    setAviso("");
  }
  function persistir(next: CarritoLineaLocal[], owner: string) {
    let falloSync = false;
    propio.current = true;
    try {
      guardarCarrito(next);
    } catch {
      falloSync = true;
    } finally {
      propio.current = false;
    }
    let guardado = false;
    try {
      guardado =
        propietarioCarrito() === owner && JSON.stringify(leerCarrito()) === JSON.stringify(next);
    } catch {}
    if (!guardado) {
      setVista(null);
      firma.current = null;
      throw new AvisoRepetir(
        "No pudimos confirmar el guardado. Revisa tu carrito antes de volver a agregar productos.",
      );
    }
    // An edit callback can fail after the durable local write; do not offer a duplicate add.
    if (falloSync)
      setAviso(
        "Selección guardada en este navegador. Revisa en el carrito cualquier aviso de sincronización.",
      );
  }
  function actualizarPrecios(v: Vista, precios: LineaVerificada[]) {
    const actualizados = new Map(v.precios.map((i) => [i.varianteId, i]));
    const cambio = precios.some(
      (i) => i.precio !== actualizados.get(i.varianteId)?.precio || i.estado !== "publicado",
    );
    if (!cambio) return false;
    for (const row of precios) actualizados.set(row.varianteId, row);
    setVista({
      ...v,
      precios: [...actualizados.values()],
      seleccionadas: v.seleccionadas.filter((id) => actualizados.get(id)?.estado === "publicado"),
    });
    return true;
  }
  async function confirmar() {
    if (ocupado.current || !datos || !vista?.seleccionadas.length) return;
    const { c, signal } = empezar();
    setFase("confirmando");
    try {
      if (!vigente(c, datos.owner)) return;
      const target = combinarPedido(
        vista.base,
        datos.pedido.items.filter((i) => vista.seleccionadas.includes(i.varianteId)),
      );
      if (!target) throw new Error(ERROR_REPETIR);
      const precios = await verificar(target, signal);
      if (!vigente(c, datos.owner)) return;
      if (actualizarPrecios(vista, precios)) {
        throw new AvisoRepetir(
          "Cambió un precio o la disponibilidad. Revisa la selección actualizada y confirma de nuevo. Si el problema está en tu carrito actual, revísalo antes de continuar.",
        );
      }
      await verificarOwner(datos.owner, signal);
      if (!vigente(c, datos.owner)) return;
      const finales = new Map(precios.map((i) => [i.varianteId, i.precio as string]));
      const next = target.map((i) => ({ ...i, precio: finales.get(i.varianteId) as string }));
      persistir(next, datos.owner);
      firma.current = null;
      setVista(null);
      setFase("exito");
    } catch (e) {
      fallo(e, c);
    } finally {
      terminar(c);
    }
  }
  return {
    datos,
    vista,
    fase,
    aviso,
    actualizarPagina,
    revisar,
    confirmar,
    cerrar,
    seleccionar,
    reintentar: () => setRevision((n) => n + 1),
  };
}
