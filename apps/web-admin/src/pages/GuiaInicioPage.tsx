import { ArrowRight, CheckCircle2, Circle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api, puede } from "../lib/api.js";
import { lanzarTour } from "../lib/tours.js";

interface Onboarding {
  vertical: string;
  pasos: Record<string, boolean>;
  conteos: { productos: number; listas: number; clientesB2b: number; ventas: number };
}

interface Paso {
  key: string;
  etapa: string;
  titulo: string;
  descripcion: string;
  accion: string;
  resultado: string;
  seccion: string;
  perm: string;
  tourId?: string;
  opcional?: boolean;
  doneKey?: string;
}

const PASOS_MAYOREO: Paso[] = [
  {
    key: "vendedores",
    etapa: "1. Personas y seguridad",
    titulo: "Crea a tu personal",
    descripcion:
      "Primero agrega a las personas que van a operar: cajeros, vendedores, almacén o administración.",
    accion: "Crear usuarios y asignarles un rol para que cada quien vea solo lo necesario.",
    resultado: "Tu equipo ya puede entrar con su propio usuario.",
    seccion: "usuarios",
    perm: "usuarios.leer",
    tourId: "dar-alta-usuario",
    doneKey: "vendedores",
  },
  {
    key: "seguridad",
    etapa: "1. Personas y seguridad",
    titulo: "Protege el acceso",
    descripcion: "Después de crear usuarios, revisa 2FA, passkeys y reglas de seguridad.",
    accion: "Activar huella/passkey o verificación en dos pasos según lo necesites.",
    resultado: "Las cuentas quedan mejor protegidas antes de vender.",
    seccion: "seguridad",
    perm: "configuracion.leer",
    tourId: "activar-huella",
    opcional: true,
  },
  {
    key: "productos",
    etapa: "2. Catálogo",
    titulo: "Agrega tus productos",
    descripcion: "Carga lo que vendes. Sin productos no hay POS, tienda ni reportes útiles.",
    accion: "Crear productos a mano o importarlos con Carga masiva.",
    resultado: "Tu catálogo queda listo para vender.",
    seccion: "productos",
    perm: "productos.leer",
    tourId: "crear-producto",
    doneKey: "productos",
  },
  {
    key: "inventario",
    etapa: "2. Catálogo",
    titulo: "Carga inventario",
    descripcion: "Si manejas existencias, registra cuántas piezas tienes.",
    accion: "Dar entrada a productos para que el stock sea correcto.",
    resultado: "El sistema descuenta existencias al vender.",
    seccion: "inventario",
    perm: "inventario.leer",
    tourId: "dar-entrada-inventario",
    opcional: true,
  },
  {
    key: "listaPrecios",
    etapa: "3. Mayoreo",
    titulo: "Crea tu lista de precios de mayoreo",
    descripcion: "Define precios especiales por cliente o volumen.",
    accion: "Crear una lista y capturar precios especiales.",
    resultado: "Puedes vender con precios distintos al público.",
    seccion: "precios",
    perm: "precios.leer",
    tourId: "crear-lista-precios",
    doneKey: "listaPrecios",
  },
  {
    key: "clientesB2b",
    etapa: "3. Mayoreo",
    titulo: "Da de alta tus clientes",
    descripcion: "Registra a quién le vendes, con su crédito y su lista de precios.",
    accion: "Crear clientes de mayoreo con datos fiscales y condiciones.",
    resultado: "Cada cliente puede tener crédito y precios propios.",
    seccion: "clientes-b2b",
    perm: "clientes.leer",
    tourId: "dar-alta-cliente-mayoreo",
    doneKey: "clientesB2b",
  },
  {
    key: "comisiones",
    etapa: "3. Mayoreo",
    titulo: "Configura las comisiones",
    descripcion: "Define cuánto gana cada vendedor por venta o por cobro.",
    accion: "Crear reglas de comisión por venta, cobro, producto o categoría.",
    resultado: "Las comisiones se calculan de forma automática.",
    seccion: "comisiones",
    perm: "comisiones.gestionar",
    tourId: "crear-comision",
    doneKey: "comisiones",
  },
  {
    key: "tienda",
    etapa: "4. Canales de venta",
    titulo: "Configura tu tienda online",
    descripcion:
      "Aquí está tu tienda. Desde esta sección defines cómo se ve y qué productos vendes por internet.",
    accion: "Configurar datos de tienda, productos publicados, dominio y pagos cuando aplique.",
    resultado: "Tus clientes ya pueden comprar en línea.",
    seccion: "tienda",
    perm: "ecommerce.configurar",
    opcional: true,
  },
  {
    key: "envios",
    etapa: "4. Canales de venta",
    titulo: "Define envíos y pedidos",
    descripcion:
      "Si usarás tienda online, configura tarifas de envío y revisa dónde llegan los pedidos.",
    accion: "Crear zonas/tarifas de envío y revisar Pedidos online.",
    resultado: "Sabes dónde atender cada pedido que entre por internet.",
    seccion: "envios",
    perm: "ecommerce.envios_gestionar",
    opcional: true,
  },
  {
    key: "primeraVenta",
    etapa: "5. Primera venta",
    titulo: "Haz tu primera venta",
    descripcion: "Abre el POS o levanta un pedido desde la app del vendedor.",
    accion: "Realizar una venta de prueba o revisar una venta ya generada.",
    resultado: "El flujo de venta queda probado y aparece en reportes.",
    seccion: "ventas",
    perm: "ventas.leer",
    doneKey: "primeraVenta",
  },
];

const PASOS_GENERICO: Paso[] = [
  {
    key: "vendedores",
    etapa: "1. Personas y seguridad",
    titulo: "Da de alta a tu equipo",
    descripcion: "Crea los usuarios que operarán el sistema.",
    accion: "Crear personal y asignar permisos por rol.",
    resultado: "Cada persona entra con su propia cuenta.",
    seccion: "usuarios",
    perm: "usuarios.leer",
    tourId: "dar-alta-usuario",
    doneKey: "vendedores",
  },
  {
    key: "seguridad",
    etapa: "1. Personas y seguridad",
    titulo: "Protege el acceso",
    descripcion: "Activa seguridad antes de operar con usuarios reales.",
    accion: "Revisar passkeys, huella y 2FA.",
    resultado: "Tu cuenta y la de tu equipo quedan mejor protegidas.",
    seccion: "seguridad",
    perm: "configuracion.leer",
    tourId: "activar-huella",
    opcional: true,
  },
  {
    key: "productos",
    etapa: "2. Catálogo",
    titulo: "Agrega tus productos",
    descripcion: "Carga lo que vendes. Este es el primer paso comercial.",
    accion: "Crear productos a mano o importarlos.",
    resultado: "Ya tienes catálogo para vender.",
    seccion: "productos",
    perm: "productos.leer",
    tourId: "crear-producto",
    doneKey: "productos",
  },
  {
    key: "inventario",
    etapa: "2. Catálogo",
    titulo: "Carga inventario",
    descripcion: "Registra existencias si necesitas controlar stock.",
    accion: "Dar entradas de inventario.",
    resultado: "El sistema sabe cuántas piezas tienes.",
    seccion: "inventario",
    perm: "inventario.leer",
    tourId: "dar-entrada-inventario",
    opcional: true,
  },
  {
    key: "tienda",
    etapa: "3. Tienda online",
    titulo: "Configura tu tienda online",
    descripcion: "Esta es la sección donde se configura tu tienda para vender por internet.",
    accion: "Entrar a Tienda online y revisar productos publicados, pagos y datos visibles.",
    resultado: "Sabes dónde se configura tu tienda.",
    seccion: "tienda",
    perm: "ecommerce.configurar",
    opcional: true,
  },
  {
    key: "primeraVenta",
    etapa: "4. Primera venta",
    titulo: "Haz tu primera venta",
    descripcion: "Prueba el flujo completo de venta.",
    accion: "Vender desde POS o revisar la venta desde este panel.",
    resultado: "Confirmas que el sistema ya opera.",
    seccion: "ventas",
    perm: "ventas.leer",
    doneKey: "primeraVenta",
  },
];

function pasosDe(vertical: string): Paso[] {
  return vertical === "retail_mayoreo" ? PASOS_MAYOREO : PASOS_GENERICO;
}

function irA(seccion: string) {
  window.dispatchEvent(new CustomEvent("gaes-nav", { detail: seccion }));
}

function puedeVerPaso(paso: Paso): boolean {
  return paso.perm === "public" || puede(paso.perm);
}

function pasoHecho(paso: Paso, pasos: Record<string, boolean>): boolean {
  return paso.doneKey ? Boolean(pasos[paso.doneKey]) : false;
}

export function GuiaInicioPage() {
  const [data, setData] = useState<Onboarding | null>(null);

  useEffect(() => {
    api<Onboarding>("/t/onboarding")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return <p className="text-center text-slate-400">Cargando…</p>;
  }

  const pasos = pasosDe(data.vertical).filter(puedeVerPaso);
  const pasosMedibles = pasos.filter((p) => !p.opcional && p.doneKey);
  const completos = pasosMedibles.filter((p) => pasoHecho(p, data.pasos)).length;
  const total = pasosMedibles.length;
  const pct = total > 0 ? Math.round((completos / total) * 100) : 0;
  const listo = total > 0 && completos === total;
  const siguiente = pasos.find((p) => !p.opcional && !pasoHecho(p, data.pasos)) ?? pasos[0];
  const etapas = [...new Set(pasos.map((p) => p.etapa))];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800">
          {listo ? "🎉 Ya tienes lo básico listo" : "Empieza aquí: te llevo paso a paso"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {listo
            ? "Completaste los pasos base. Puedes seguir con tienda online, reportes y mejoras."
            : "No necesitas entender todo el menú desde el inicio. Haz primero el siguiente paso recomendado y avanza en orden."}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-slate-600">
            {completos} de {total}
          </span>
        </div>
      </div>

      {siguiente && (
        <section className="mb-6 rounded-2xl border border-brand/30 bg-brand/5 p-5">
          <p className="font-semibold text-brand text-xs uppercase tracking-wide">
            Siguiente paso recomendado
          </p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold text-slate-800 text-xl">{siguiente.titulo}</h2>
              <p className="mt-1 text-slate-600 text-sm">{siguiente.descripcion}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {siguiente.tourId && (
                <button
                  type="button"
                  onClick={() => lanzarTour(siguiente.tourId as string)}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark"
                >
                  <Sparkles size={16} />
                  Guíame
                </button>
              )}
              <button
                type="button"
                onClick={() => irA(siguiente.seccion)}
                className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-white px-4 py-2 font-semibold text-brand text-sm hover:bg-brand/10"
              >
                Empezar
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="mb-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-slate-800">¿Dónde está mi tienda?</h2>
          <p className="mt-1 text-slate-500 text-sm">
            La tienda se configura en <b>Tienda online</b>. Si vendes mayoreo con dominio propio,
            usa <b>Portal mayorista</b>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {puede("ecommerce.configurar") && (
              <button
                type="button"
                onClick={() => irA("tienda")}
                className="rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark"
              >
                Ir a mi tienda
              </button>
            )}
            {puede("configuracion.actualizar") && (
              <button
                type="button"
                onClick={() => irA("portal-b2b")}
                className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600 text-sm hover:bg-slate-50"
              >
                Portal mayorista
              </button>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-bold text-slate-800">¿Qué hago primero?</h2>
          <p className="mt-1 text-slate-500 text-sm">
            Primero personal y seguridad. Después productos e inventario. Luego clientes, precios,
            tienda y primera venta.
          </p>
        </div>
      </section>

      <div className="space-y-6">
        {etapas.map((etapa) => (
          <section key={etapa}>
            <h2 className="mb-3 font-bold text-slate-700 text-sm uppercase tracking-wide">
              {etapa}
            </h2>
            <div className="space-y-3">
              {pasos
                .filter((paso) => paso.etapa === etapa)
                .map((paso, i) => {
                  const hecho = pasoHecho(paso, data.pasos);
                  return (
                    <article
                      key={paso.key}
                      className={`rounded-xl border p-4 shadow-sm ${
                        hecho ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {hecho ? (
                          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={24} />
                        ) : (
                          <Circle className="mt-0.5 shrink-0 text-slate-300" size={24} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p
                              className={`font-semibold ${
                                hecho ? "text-slate-500 line-through" : "text-slate-800"
                              }`}
                            >
                              {i + 1}. {paso.titulo}
                            </p>
                            {paso.opcional && (
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500 text-xs">
                                recomendado
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{paso.descripcion}</p>
                          <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <p className="font-semibold text-slate-700">Qué haces</p>
                              <p className="text-slate-500">{paso.accion}</p>
                            </div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2">
                              <p className="font-semibold text-slate-700">Resultado</p>
                              <p className="text-slate-500">{paso.resultado}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      {!hecho && (
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          {paso.tourId && (
                            <button
                              type="button"
                              onClick={() => lanzarTour(paso.tourId as string)}
                              className="inline-flex items-center gap-2 rounded-lg border border-brand/30 px-4 py-2 font-semibold text-brand text-sm hover:bg-brand/5"
                            >
                              <Sparkles size={16} />
                              Guíame paso a paso
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => irA(paso.seccion)}
                            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark"
                          >
                            Ir a esta pantalla
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
