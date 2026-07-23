import { CheckCircle2, Circle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

interface Onboarding {
  vertical: string;
  pasos: Record<string, boolean>;
  conteos: { productos: number; listas: number; clientesB2b: number; ventas: number };
}

interface Paso {
  key: string;
  titulo: string;
  descripcion: string;
  seccion: string;
}

const PASOS_MAYOREO: Paso[] = [
  {
    key: "productos",
    titulo: "Agrega tus productos",
    descripcion: "Carga tu catálogo a mano o impórtalo con 'Carga masiva'.",
    seccion: "productos",
  },
  {
    key: "listaPrecios",
    titulo: "Crea tu lista de precios de mayoreo",
    descripcion: "Define precios especiales por cliente o volumen.",
    seccion: "precios",
  },
  {
    key: "clientesB2b",
    titulo: "Da de alta tus clientes",
    descripcion: "Registra a quién le vendes, con su crédito y su lista de precios.",
    seccion: "clientes-b2b",
  },
  {
    key: "vendedores",
    titulo: "Da de alta tu equipo de vendedores",
    descripcion: "Crea usuarios con el rol de vendedor para que usen la app de campo.",
    seccion: "usuarios",
  },
  {
    key: "comisiones",
    titulo: "Configura las comisiones",
    descripcion: "Define cuánto gana cada vendedor por venta o por cobro.",
    seccion: "comisiones",
  },
  {
    key: "primeraVenta",
    titulo: "Haz tu primera venta",
    descripcion: "Abre el POS o levanta un pedido desde la app del vendedor.",
    seccion: "ventas",
  },
];

const PASOS_GENERICO: Paso[] = [
  PASOS_MAYOREO[0]!,
  {
    key: "vendedores",
    titulo: "Da de alta a tu equipo",
    descripcion: "Crea los usuarios que operarán el sistema.",
    seccion: "usuarios",
  },
  PASOS_MAYOREO[5]!,
];

function pasosDe(vertical: string): Paso[] {
  return vertical === "retail_mayoreo" ? PASOS_MAYOREO : PASOS_GENERICO;
}

function irA(seccion: string) {
  window.dispatchEvent(new CustomEvent("gaes-nav", { detail: seccion }));
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

  const pasos = pasosDe(data.vertical);
  const completos = pasos.filter((p) => data.pasos[p.key]).length;
  const total = pasos.length;
  const pct = Math.round((completos / total) * 100);
  const listo = completos === total;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-800">
          {listo ? "🎉 ¡Todo listo, ya puedes vender!" : "🚀 Configura tu negocio"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {listo
            ? "Completaste la configuración inicial. Puedes seguir afinando cuando quieras."
            : "Sigue estos pasos para dejar tu tienda lista. Se palomean solos conforme los completas."}
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

      <div className="space-y-3">
        {pasos.map((paso, i) => {
          const hecho = data.pasos[paso.key];
          return (
            <div
              key={paso.key}
              className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${
                hecho ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
              }`}
            >
              {hecho ? (
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-500" size={24} />
              ) : (
                <Circle className="mt-0.5 shrink-0 text-slate-300" size={24} />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`font-semibold ${hecho ? "text-slate-500 line-through" : "text-slate-800"}`}
                >
                  {i + 1}. {paso.titulo}
                </p>
                <p className="text-sm text-slate-500">{paso.descripcion}</p>
              </div>
              {!hecho && (
                <button
                  type="button"
                  onClick={() => irA(paso.seccion)}
                  className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  Ir →
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
