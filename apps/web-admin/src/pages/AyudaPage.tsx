import { useMemo, useState } from "react";
import { TOURS, lanzarTour } from "../lib/tours.js";

interface Articulo {
  categoria: string;
  titulo: string;
  cuerpo: string[];
}

const ARTICULOS: Articulo[] = [
  {
    categoria: "Primeros pasos",
    titulo: "¿Por dónde empiezo?",
    cuerpo: [
      "Al entrar verás la Guía de inicio: una lista de pasos que deja tu negocio listo para vender.",
      "Se palomean solos conforme los completas. No tienes que hacerlos en orden, pero el primero siempre es cargar tus productos.",
      "Si prefieres que te lleve de la mano, usa el recorrido guiado “Crear tu primer producto” de más abajo.",
    ],
  },
  {
    categoria: "Productos",
    titulo: "Agregar y editar productos",
    cuerpo: [
      "Ve a Productos y toca “+ Nuevo producto”. Con nombre y precio ya puedes vender; lo demás es opcional.",
      "Si manejas código de barras, captura su clave para poder escanearlo en el POS.",
      "¿Muchos productos? Usa “Carga masiva” para importarlos desde un archivo.",
    ],
  },
  {
    categoria: "Ventas",
    titulo: "Cobrar en el punto de venta",
    cuerpo: [
      "Abre la app de POS, busca o escanea el producto, y cobra con efectivo, tarjeta o los métodos que tengas activos.",
      "Cada venta descuenta inventario y queda registrada en Reportes.",
    ],
  },
  {
    categoria: "Pagos y suscripción",
    titulo: "Método de pago y cobros a clientes",
    cuerpo: [
      "En “Mi suscripción” guardas la tarjeta con la que se cobra tu plan.",
      "También ahí puedes “Conectar con Stripe” para aceptar tarjetas de tus propios clientes y recibir el dinero directo a tu banco.",
    ],
  },
  {
    categoria: "Equipo",
    titulo: "Dar de alta a tu equipo",
    cuerpo: [
      "En Usuarios y permisos creas cuentas para quienes operan el sistema (cajeros, vendedores, etc.).",
      "A cada uno le asignas un rol; el sistema solo le muestra lo que su rol permite.",
    ],
  },
];

export function AyudaPage() {
  const [q, setQ] = useState("");

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ARTICULOS;
    return ARTICULOS.filter(
      (a) =>
        a.titulo.toLowerCase().includes(t) ||
        a.categoria.toLowerCase().includes(t) ||
        a.cuerpo.some((c) => c.toLowerCase().includes(t)),
    );
  }, [q]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-bold text-2xl text-slate-800">Ayuda</h1>
      <p className="mt-1 text-slate-500 text-sm">
        Manual de uso y recorridos guiados. Aquí puedes volver a lanzar cualquier recorrido cuando
        quieras.
      </p>

      <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-semibold text-slate-800">Recorridos guiados ✨</h2>
        <p className="mb-3 text-slate-500 text-sm">
          Te resaltan los botones en pantalla y te dicen qué hacer, paso a paso.
        </p>
        <div className="space-y-2">
          {TOURS.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800 text-sm">{t.nombre}</p>
                <p className="text-slate-500 text-xs">{t.descripcion}</p>
              </div>
              <button
                type="button"
                onClick={() => lanzarTour(t.id)}
                className="shrink-0 rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark"
              >
                Iniciar
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en el manual…"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-brand focus:outline-none"
        />
      </div>

      <div className="mt-4 space-y-3 pb-6">
        {filtrados.length === 0 ? (
          <p className="rounded-xl bg-white p-6 text-center text-slate-400 text-sm shadow-sm">
            No encontramos nada para “{q}”. Prueba con otra palabra.
          </p>
        ) : (
          filtrados.map((a) => (
            <details
              key={a.titulo}
              className="group rounded-2xl bg-white p-4 shadow-sm [&_summary]:cursor-pointer"
            >
              <summary className="flex items-center justify-between gap-3 list-none">
                <span>
                  <span className="block text-brand text-xs uppercase tracking-wide">
                    {a.categoria}
                  </span>
                  <span className="font-semibold text-slate-800">{a.titulo}</span>
                </span>
                <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="mt-3 space-y-2 border-slate-100 border-t pt-3">
                {a.cuerpo.map((c) => (
                  <p key={c} className="text-slate-600 text-sm">
                    {c}
                  </p>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
