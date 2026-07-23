import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.js";
import type { ConfigTienda, Paged, Producto } from "../lib/types.js";

interface RegistroDns {
  tipo: string;
  host: string;
  valor: string;
}
interface DominioEstado {
  dominioPropio: string | null;
  verificado: boolean;
  instrucciones: { cname: RegistroDns; txt: RegistroDns | null } | null;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function TiendaPage() {
  const [config, setConfig] = useState<ConfigTienda>({});
  const [productos, setProductos] = useState<Producto[]>([]);
  const [buscarPub, setBuscarPub] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [dominioKey, setDominioKey] = useState(0);

  useEffect(() => {
    api<ConfigTienda>("/t/ecommerce/config")
      .then((c) => setConfig(c ?? {}))
      .catch(() => setConfig({}));
  }, []);

  // Lista de productos para publicar, con búsqueda server-side (debounce).
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = buscarPub.trim() ? `&q=${encodeURIComponent(buscarPub.trim())}` : "";
      api<Paged<Producto>>(`/t/productos?pageSize=50${qs}`)
        .then((r) => setProductos(r.items))
        .catch(() => setProductos([]));
    }, 250);
    return () => clearTimeout(t);
  }, [buscarPub]);

  async function guardarConfig() {
    setError(null);
    setMsg(null);
    setGuardando(true);
    try {
      await api("/t/ecommerce/config", {
        method: "PUT",
        body: {
          activa: config.activa ?? false,
          subdominio: config.subdominio ?? "",
          dominioPropio: config.dominioPropio ? config.dominioPropio : null,
          nombre: config.nombre ?? "",
          msiHabilitado: config.msiHabilitado ?? false,
          msiMeses: config.msiMeses ?? [3, 6, 12],
          msiMontoMinimo: String(config.msiMontoMinimo ?? 0),
          galeriaZoom: config.galeriaZoom ?? true,
          mostrarRatingProducto: config.mostrarRatingProducto ?? true,
          cuponEnCheckout: config.cuponEnCheckout ?? true,
          comprarAhora: config.comprarAhora ?? true,
          cancelacionCliente: config.cancelacionCliente ?? true,
          facturacionSelfService: config.facturacionSelfService ?? true,
          preguntasPublicas: config.preguntasPublicas ?? true,
          pasarelaPagoProvider: config.pasarelaPagoProvider ?? null,
          paqueteriaProvider: config.paqueteriaProvider ?? null,
          paqueteriaAutoGuia: config.paqueteriaAutoGuia ?? false,
          tarifasEnVivo: config.tarifasEnVivo ?? false,
          paqueteriaPesoDefaultKg: String(config.paqueteriaPesoDefaultKg ?? 1),
          pushHabilitado: config.pushHabilitado ?? false,
          pushEventos: config.pushEventos ?? ["pago_confirmado", "enviado", "entregado"],
          politicasHtml: config.politicasHtml ?? {},
        },
      });
      setMsg("Configuración guardada");
      setDominioKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function publicar(p: Producto) {
    setError(null);
    setMsg(null);
    try {
      await api("/t/ecommerce/productos-publicados", {
        body: {
          productoId: p.id,
          tituloPublico: p.nombre,
          slugSeo: slugify(p.nombre) || p.skuPadre.toLowerCase(),
          descripcionMd: p.nombre,
          destacadoHome: false,
        },
      });
      setMsg(`"${p.nombre}" publicado en la tienda`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al publicar (¿ya estaba publicado?)");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">Tienda online</h1>

      <section className="mb-8 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-bold text-slate-800">Configuración</h2>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={config.activa ?? false}
            onChange={(e) => setConfig({ ...config, activa: e.target.checked })}
          />
          Tienda activa (visible al público)
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Nombre de la tienda</span>
          <input
            value={config.nombre ?? ""}
            onChange={(e) => setConfig({ ...config, nombre: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Subdominio</span>
          <input
            data-tour="tienda-subdominio"
            value={config.subdominio ?? ""}
            onChange={(e) => setConfig({ ...config, subdominio: e.target.value })}
            placeholder="mi-tienda"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="mb-1 block">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Dominio propio <span className="font-normal text-slate-400">(opcional)</span>
          </span>
          <input
            value={config.dominioPropio ?? ""}
            onChange={(e) =>
              setConfig({ ...config, dominioPropio: e.target.value.trim().toLowerCase() || null })
            }
            placeholder="tienda.minegocio.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-brand focus:outline-none"
          />
          <span className="mt-1 block text-slate-400 text-xs">
            Usa tu propio dominio en vez del subdominio. Tras guardar, sigue las instrucciones de
            DNS para conectarlo y verificarlo.
          </span>
        </label>
        <DominioPropio refreshKey={dominioKey} />
        <button
          type="button"
          data-tour="tienda-guardar"
          onClick={guardarConfig}
          disabled={guardando}
          className="mt-4 rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </section>

      <section className="mb-8 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Funciones de la tienda</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Activa solo lo que quieras mostrar. Se aplican a tu tienda al guardar.
        </p>

        <div className="mb-4 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 font-medium text-slate-800 text-sm">
            <input
              type="checkbox"
              checked={config.msiHabilitado ?? false}
              onChange={(e) => setConfig({ ...config, msiHabilitado: e.target.checked })}
            />
            Meses sin intereses (MSI)
          </label>
          {config.msiHabilitado && (
            <div className="mt-3 pl-6">
              <p className="mb-1 text-slate-500 text-xs">Plazos que ofreces:</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {[3, 6, 9, 12, 18, 24].map((m) => {
                  const activos = config.msiMeses ?? [3, 6, 12];
                  const on = activos.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() =>
                        setConfig({
                          ...config,
                          msiMeses: on
                            ? activos.filter((x) => x !== m)
                            : [...activos, m].sort((a, b) => a - b),
                        })
                      }
                      className={`rounded-lg border px-3 py-1 text-sm ${
                        on
                          ? "border-brand bg-brand text-white"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {m} meses
                    </button>
                  );
                })}
              </div>
              <label className="block">
                <span className="mb-1 block text-slate-500 text-xs">
                  Monto mínimo de compra para ofrecer MSI ($)
                </span>
                <input
                  type="number"
                  min={0}
                  value={Number(config.msiMontoMinimo ?? 0)}
                  onChange={(e) => setConfig({ ...config, msiMontoMinimo: e.target.value })}
                  className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
        </div>

        <Toggle
          label="Galería de fotos con zoom"
          checked={config.galeriaZoom ?? true}
          onChange={(v) => setConfig({ ...config, galeriaZoom: v })}
        />
        <Toggle
          label="Mostrar calificación (estrellas) en el producto"
          checked={config.mostrarRatingProducto ?? true}
          onChange={(v) => setConfig({ ...config, mostrarRatingProducto: v })}
        />
        <Toggle
          label="Campo de cupón en el checkout"
          checked={config.cuponEnCheckout ?? true}
          onChange={(v) => setConfig({ ...config, cuponEnCheckout: v })}
        />
        <Toggle
          label='Botón "Comprar ahora" (compra rápida)'
          checked={config.comprarAhora ?? true}
          onChange={(v) => setConfig({ ...config, comprarAhora: v })}
        />
        <Toggle
          label="Permitir que el cliente cancele su compra (antes de envío)"
          checked={config.cancelacionCliente ?? true}
          onChange={(v) => setConfig({ ...config, cancelacionCliente: v })}
        />
        <Toggle
          label="Factura (CFDI) self-service desde la cuenta del cliente"
          checked={config.facturacionSelfService ?? true}
          onChange={(v) => setConfig({ ...config, facturacionSelfService: v })}
        />
        <Toggle
          label="Preguntas y respuestas públicas en el producto"
          checked={config.preguntasPublicas ?? true}
          onChange={(v) => setConfig({ ...config, preguntasPublicas: v })}
        />

        <button
          type="button"
          onClick={guardarConfig}
          disabled={guardando}
          className="mt-4 rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar funciones"}
        </button>
      </section>

      <section className="mb-8 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Pasarela de pago</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Con qué procesador cobras los pagos en línea (checkout de la tienda y links de cobro).
        </p>
        <div className="mb-1 rounded-lg border border-slate-200 p-3">
          <span className="mb-2 block font-medium text-slate-800 text-sm">Procesador de pago</span>
          <select
            value={config.pasarelaPagoProvider ?? ""}
            onChange={(e) =>
              setConfig({
                ...config,
                pasarelaPagoProvider: (e.target.value || null) as "conekta" | "stripe" | null,
              })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-72"
          >
            <option value="">Sin cobro en línea (solo demo / mock)</option>
            <option value="conekta">Conekta (tarjeta, OXXO, SPEI — México)</option>
            <option value="stripe">Stripe (tarjeta internacional)</option>
          </select>
          {!config.pasarelaPagoProvider && (
            <p className="mt-2 text-amber-600 text-xs">
              Sin procesador, los pagos no se cobran de verdad. Configura las llaves del proveedor
              en el servidor antes de activarlo.
            </p>
          )}
        </div>
      </section>

      <section className="mb-8 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Envíos automáticos y notificaciones</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Conecta una paquetería para generar guías solas y avisar a tus clientes por push.
        </p>

        <div className="mb-4 rounded-lg border border-slate-200 p-3">
          <span className="mb-2 block font-medium text-slate-800 text-sm">
            Paquetería (agregador)
          </span>
          <select
            value={config.paqueteriaProvider ?? ""}
            onChange={(e) =>
              setConfig({
                ...config,
                paqueteriaProvider: (e.target.value || null) as "skydropx" | "envia" | null,
              })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-72"
          >
            <option value="">Sin conectar (alta manual de guías)</option>
            <option value="skydropx">Skydropx</option>
            <option value="envia">Envía.com</option>
          </select>

          {config.paqueteriaProvider && (
            <div className="mt-3 space-y-2 pl-1">
              <Toggle
                label="Generar la guía automáticamente al confirmarse el pago"
                checked={config.paqueteriaAutoGuia ?? false}
                onChange={(v) => setConfig({ ...config, paqueteriaAutoGuia: v })}
              />
              <Toggle
                label="Mostrar tarifas en vivo del proveedor (informativo)"
                checked={config.tarifasEnVivo ?? false}
                onChange={(v) => setConfig({ ...config, tarifasEnVivo: v })}
              />
              <label className="block">
                <span className="mb-1 block text-slate-500 text-xs">
                  Peso por paquete por defecto (kg)
                </span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={Number(config.paqueteriaPesoDefaultKg ?? 1)}
                  onChange={(e) =>
                    setConfig({ ...config, paqueteriaPesoDefaultKg: e.target.value })
                  }
                  className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <Toggle
            label="Notificaciones push a clientes (tienda instalable / PWA)"
            checked={config.pushHabilitado ?? false}
            onChange={(v) => setConfig({ ...config, pushHabilitado: v })}
          />
          {config.pushHabilitado && (
            <div className="mt-2 pl-6">
              <p className="mb-1 text-slate-500 text-xs">Avisar al cliente cuando:</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["pago_confirmado", "Pago confirmado"],
                    ["enviado", "Pedido enviado"],
                    ["entregado", "Pedido entregado"],
                  ] as const
                ).map(([key, label]) => {
                  const activos = config.pushEventos ?? ["pago_confirmado", "enviado", "entregado"];
                  const on = activos.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setConfig({
                          ...config,
                          pushEventos: on ? activos.filter((x) => x !== key) : [...activos, key],
                        })
                      }
                      className={`rounded-lg border px-3 py-1 text-sm ${
                        on
                          ? "border-brand bg-brand text-white"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={guardarConfig}
          disabled={guardando}
          className="mt-4 rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar envíos"}
        </button>
      </section>

      <section className="mb-8 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Políticas de la tienda</h2>
        <p className="mb-4 text-slate-500 text-sm">
          Aparecen en el pie de página de tu tienda. Si dejas un campo vacío se usa un texto base.
        </p>
        {(
          [
            ["envios", "Envíos"],
            ["devoluciones", "Cambios y devoluciones"],
            ["privacidad", "Aviso de privacidad"],
            ["terminos", "Términos y condiciones"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="mb-3 block">
            <span className="mb-1 block font-medium text-slate-700 text-sm">{label}</span>
            <textarea
              value={config.politicasHtml?.[key] ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  politicasHtml: { ...(config.politicasHtml ?? {}), [key]: e.target.value },
                })
              }
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={guardarConfig}
          disabled={guardando}
          className="mt-2 rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar políticas"}
        </button>
      </section>

      <section className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-800">Publicar productos</h2>
        <p className="mb-3 text-sm text-slate-500">
          Pon tus productos a la venta en la tienda online.
        </p>
        <input
          data-tour="tienda-publicar"
          value={buscarPub}
          onChange={(e) => setBuscarPub(e.target.value)}
          placeholder="Buscar producto por nombre o SKU…"
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <div className="max-h-72 overflow-y-auto">
          {productos.map((p) => (
            <div
              key={p.id}
              className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
            >
              <span className="text-sm font-medium text-slate-800">{p.nombre}</span>
              <button
                type="button"
                onClick={() => publicar(p)}
                className="rounded-lg border border-brand px-3 py-1 text-sm font-semibold text-brand hover:bg-teal-50"
              >
                Publicar
              </button>
            </div>
          ))}
          {productos.length === 0 && (
            <p className="text-sm text-slate-400">
              {buscarPub.trim()
                ? `Sin resultados para "${buscarPub.trim()}".`
                : "Crea productos primero en la sección Productos."}
            </p>
          )}
        </div>
      </section>

      {msg && <p className="mt-4 text-sm text-emerald-600">{msg}</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function DnsRow({ registro }: { registro: RegistroDns }) {
  return (
    <div className="flex flex-col gap-0.5 border-slate-100 border-b py-2 last:border-0 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-12 shrink-0 font-semibold text-slate-500 text-xs">{registro.tipo}</span>
      <code className="break-all text-slate-700 text-xs">{registro.host}</code>
      <span className="hidden text-slate-300 sm:inline">→</span>
      <code className="break-all text-slate-700 text-xs">{registro.valor}</code>
    </div>
  );
}

function DominioPropio({ refreshKey }: { refreshKey: number }) {
  const [estado, setEstado] = useState<DominioEstado | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cargar = useCallback(() => {
    api<DominioEstado>("/t/ecommerce/dominio")
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);
  useEffect(() => cargar(), [cargar]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch tras guardar (refreshKey)
  useEffect(() => cargar(), [refreshKey]);

  if (!estado?.dominioPropio || !estado.instrucciones) return null;

  async function verificar() {
    setVerificando(true);
    setMsg(null);
    try {
      const r = await api<{ verificado: boolean }>("/t/ecommerce/dominio/verificar", {
        method: "POST",
      });
      setMsg(
        r.verificado
          ? "¡Dominio verificado! Ya puede usarse para tu tienda."
          : "Todavía no encontramos el registro TXT. La propagación de DNS puede tardar hasta 1 hora; intenta de nuevo más tarde.",
      );
      cargar();
    } catch {
      setMsg("No se pudo verificar el dominio");
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="mt-3 mb-1 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium text-slate-700 text-sm">{estado.dominioPropio}</span>
        {estado.verificado ? (
          <span className="gx-badge-ok">Verificado</span>
        ) : (
          <span className="gx-badge-warn">Sin verificar</span>
        )}
      </div>
      {!estado.verificado && (
        <>
          <p className="mb-2 text-slate-500 text-xs">
            En tu proveedor de DNS agrega estos registros. El sistema recomienda ambos: el CNAME
            enruta el tráfico a tu tienda y el TXT prueba que el dominio es tuyo.
          </p>
          <div className="mb-3 rounded-md bg-white px-3 py-1">
            <DnsRow registro={estado.instrucciones.cname} />
            {estado.instrucciones.txt && <DnsRow registro={estado.instrucciones.txt} />}
          </div>
          <button
            type="button"
            onClick={verificar}
            disabled={verificando}
            className="rounded-lg border border-brand px-4 py-1.5 font-semibold text-brand text-sm hover:bg-teal-50 disabled:opacity-50"
          >
            {verificando ? "Verificando…" : "Verificar dominio"}
          </button>
        </>
      )}
      {msg && <p className="mt-2 text-slate-600 text-xs">{msg}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-2 flex items-center gap-2 text-slate-700 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
