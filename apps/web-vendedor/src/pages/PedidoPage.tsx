import { useCallback, useEffect, useRef, useState } from "react";
import { SignaturePad } from "../components/SignaturePad.js";
import { ApiError, OfflineError, api, money } from "../lib/api.js";
import {
  buscarCatalogoLocal,
  encolarPedido,
  guardarCatalogo,
  guardarDraft,
  leerDraft,
  limpiarDraft,
} from "../lib/offline.js";
import type {
  ClienteDetalle,
  ConfigVendedores,
  LineaCarrito,
  MiCliente,
  PreviewTicket,
  ProductoCatalogo,
} from "../lib/types.js";

interface ProductosResp {
  items: Array<{
    id: string;
    nombre: string;
    skuPadre: string;
    variantes: Array<{
      id: string;
      sku: string;
      nombreVariante: string | null;
      precioBase: string;
    }>;
  }>;
}

export function PedidoPage({
  clienteInicial,
  onEnviado,
}: {
  clienteInicial: string | null;
  onEnviado: () => void;
}) {
  const draft = useRef(leerDraft());
  const [clientes, setClientes] = useState<MiCliente[]>([]);
  const [clienteB2bId, setClienteB2bId] = useState<string>(
    clienteInicial ?? draft.current?.clienteB2bId ?? "",
  );
  const [listaPrecio, setListaPrecio] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaCarrito[]>(draft.current?.lineas ?? []);
  const [notas, setNotas] = useState(draft.current?.notas ?? "");
  const [firma, setFirma] = useState<string | null>(draft.current?.firmaDataUrl ?? null);
  const [config, setConfig] = useState<ConfigVendedores | null>(null);
  const [sucursalId, setSucursalId] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ProductoCatalogo[]>([]);
  const [preview, setPreview] = useState<PreviewTicket | null>(null);
  const [previewOffline, setPreviewOffline] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: MiCliente[] }>("/t/vendedor/clientes")
      .then((r) => setClientes(r.items))
      .catch(() => setClientes([]));
    api<ConfigVendedores>("/t/comisiones/config")
      .then(setConfig)
      .catch(() => setConfig(null));
    api<Array<{ id: string; isDefault?: boolean }>>("/t/sucursales")
      .then((sucs) => {
        const s = sucs.find((x) => x.isDefault) ?? sucs[0];
        if (s) setSucursalId(s.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!clienteB2bId) {
      setListaPrecio(null);
      return;
    }
    api<ClienteDetalle>(`/t/vendedor/clientes/${clienteB2bId}`)
      .then((d) => setListaPrecio(d.cliente.listaPrecioPrincipalCodigo))
      .catch(() => setListaPrecio(null));
  }, [clienteB2bId]);

  // borrador persistente: el pedido sobrevive cierres de app y falta de señal
  useEffect(() => {
    guardarDraft({ clienteB2bId: clienteB2bId || null, lineas, notas, firmaDataUrl: firma });
  }, [clienteB2bId, lineas, notas, firma]);

  const buscar = useCallback(async (q: string) => {
    setBusqueda(q);
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    try {
      const r = await api<ProductosResp>(`/t/productos?q=${encodeURIComponent(q)}&pageSize=20`);
      const items: ProductoCatalogo[] = r.items.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        skuPadre: p.skuPadre,
        variantes: p.variantes.map((v) => ({
          id: v.id,
          sku: v.sku,
          nombreVariante: v.nombreVariante,
          precioBase: v.precioBase,
        })),
      }));
      guardarCatalogo(items);
      setResultados(items);
    } catch {
      setResultados(buscarCatalogoLocal(q));
    }
  }, []);

  // totales reales del motor de precios; sin señal caemos a suma local marcada
  useEffect(() => {
    if (lineas.length === 0) {
      setPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const ticket = await api<PreviewTicket>("/t/precios/preview", {
          body: {
            lineas: lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
            ...(listaPrecio ? { listaPrecioCodigo: listaPrecio } : {}),
          },
        });
        setPreview(ticket);
        setPreviewOffline(false);
      } catch {
        const total = lineas.reduce((acc, l) => acc + Number(l.precioBase) * Number(l.cantidad), 0);
        setPreview({ subtotal: String(total), total: String(total), lineas: [] });
        setPreviewOffline(true);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [lineas, listaPrecio]);

  function agregar(p: ProductoCatalogo, varianteId: string) {
    const v = p.variantes.find((x) => x.id === varianteId);
    if (!v) return;
    setLineas((prev) => {
      const existe = prev.find((l) => l.varianteId === v.id);
      if (existe) {
        return prev.map((l) =>
          l.varianteId === v.id ? { ...l, cantidad: String(Number(l.cantidad) + 1) } : l,
        );
      }
      return [
        ...prev,
        {
          varianteId: v.id,
          sku: v.sku,
          nombre: p.nombre + (v.nombreVariante ? ` · ${v.nombreVariante}` : ""),
          cantidad: "1",
          precioBase: v.precioBase,
        },
      ];
    });
    setBusqueda("");
    setResultados([]);
  }

  function cambiarCantidad(varianteId: string, cantidad: string) {
    if (Number(cantidad) <= 0 || Number.isNaN(Number(cantidad))) {
      setLineas((prev) => prev.filter((l) => l.varianteId !== varianteId));
    } else {
      setLineas((prev) => prev.map((l) => (l.varianteId === varianteId ? { ...l, cantidad } : l)));
    }
  }

  function reset() {
    setLineas([]);
    setNotas("");
    setFirma(null);
    setClienteB2bId("");
    limpiarDraft();
    onEnviado();
  }

  async function enviar() {
    if (!clienteB2bId || lineas.length === 0 || !sucursalId) return;
    if (config?.firmaPedidoModo === "obligatoria" && !firma) {
      setFirmando(true);
      return;
    }
    setEnviando(true);
    setMsg(null);
    const payload = {
      sucursalId,
      clienteB2bId,
      lineas: lineas.map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidad })),
      ...(listaPrecio ? { listaPrecioCodigo: listaPrecio } : {}),
      ...(notas.trim() ? { notas: notas.trim() } : {}),
      ...(firma ? { firmaDataUrl: firma } : {}),
    };
    const clienteNombre =
      clientes.find((c) => c.id === clienteB2bId)?.nombreComercial ??
      clientes.find((c) => c.id === clienteB2bId)?.razonSocial ??
      "cliente";
    try {
      const res = await api<{ folio: string; total: string }>("/t/pedidos", { body: payload });
      setMsg(`✅ Pedido ${res.folio} levantado por ${money(res.total)}`);
      reset();
    } catch (err) {
      if (err instanceof OfflineError) {
        encolarPedido({ payload, clienteNombre, total: preview?.total ?? "0" });
        setMsg("📡 Sin señal: el pedido quedó en cola y se enviará solo al volver la conexión.");
        reset();
      } else {
        setMsg(`⚠️ ${err instanceof ApiError ? err.message : "No se pudo levantar el pedido"}`);
      }
    } finally {
      setEnviando(false);
    }
  }

  const puedeEnviar = clienteB2bId && lineas.length > 0 && sucursalId && !enviando;

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-slate-800">Levantar pedido</h2>
      {msg && <p className="rounded-xl bg-white p-3 text-slate-700 text-sm shadow-sm">{msg}</p>}

      <div className="gx-card p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Cliente</span>
          <select
            value={clienteB2bId}
            onChange={(e) => setClienteB2bId(e.target.value)}
            className="gx-input w-full"
          >
            <option value="">Elegir cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombreComercial ?? c.razonSocial}
              </option>
            ))}
          </select>
        </label>
        {listaPrecio && (
          <p className="mt-1 text-slate-400 text-xs">Precios de su lista: {listaPrecio}</p>
        )}
      </div>

      <div className="gx-card p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Agregar producto</span>
          <input
            value={busqueda}
            onChange={(e) => void buscar(e.target.value)}
            className="gx-input w-full"
            placeholder="Nombre o SKU…"
          />
        </label>
        {resultados.length > 0 && (
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {resultados.map((p) =>
              p.variantes.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => agregar(p, v.id)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-brand/5"
                  >
                    <span className="text-slate-700">
                      {p.nombre}
                      {v.nombreVariante ? ` · ${v.nombreVariante}` : ""}
                      <span className="ml-1 text-slate-400 text-xs">({v.sku})</span>
                    </span>
                    <span className="font-medium text-slate-800">{money(v.precioBase)}</span>
                  </button>
                </li>
              )),
            )}
          </ul>
        )}
      </div>

      {lineas.length > 0 && (
        <div className="gx-card p-4">
          <p className="mb-2 font-semibold text-slate-800">Carrito ({lineas.length})</p>
          <ul className="divide-y divide-slate-100">
            {lineas.map((l) => (
              <li key={l.varianteId} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-700 text-sm">{l.nombre}</p>
                  <p className="text-slate-400 text-xs">{l.sku}</p>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={l.cantidad}
                  onChange={(e) => cambiarCantidad(l.varianteId, e.target.value)}
                  className="gx-input w-20 text-center"
                />
                <button
                  type="button"
                  onClick={() => cambiarCantidad(l.varianteId, "0")}
                  aria-label="Quitar"
                  className="px-1 text-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-slate-100 border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Total</span>
              <span className="font-bold text-lg text-slate-900">
                {preview ? money(preview.total) : "…"}
              </span>
            </div>
            {previewOffline && (
              <p className="text-amber-600 text-xs">
                Sin señal: total estimado con precio base, se confirma al enviar.
              </p>
            )}
          </div>

          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Notas del pedido</span>
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="gx-input w-full"
              placeholder="Entregar en bodega, horario…"
            />
          </label>

          {config && config.firmaPedidoModo !== "off" && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 p-3">
              <span className="text-slate-600 text-sm">
                Firma del cliente{" "}
                {config.firmaPedidoModo === "obligatoria" ? "(obligatoria)" : "(sugerida)"}
              </span>
              {firma ? (
                <span className="flex items-center gap-2">
                  <img
                    src={firma}
                    alt="Firma"
                    className="h-8 rounded border border-slate-200 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setFirma(null)}
                    className="text-red-500 text-xs hover:underline"
                  >
                    Quitar
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setFirmando(true)}
                  className="gx-btn-secondary text-sm"
                >
                  ✍️ Firmar
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={enviar}
            disabled={!puedeEnviar}
            className="gx-btn-primary mt-4 w-full py-3"
          >
            {enviando ? "Enviando…" : "Levantar pedido"}
          </button>
        </div>
      )}

      {firmando && (
        <SignaturePad
          titulo="El cliente firma de conformidad con el pedido"
          procesando={false}
          onCancel={() => setFirmando(false)}
          onConfirm={(dataUrl) => {
            setFirma(dataUrl);
            setFirmando(false);
          }}
        />
      )}
    </div>
  );
}
