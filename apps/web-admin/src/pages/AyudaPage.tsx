import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { puede } from "../lib/api.js";
import { lanzarTour } from "../lib/tours.js";

interface ModuloAyuda {
  seccion: string;
  /** Permiso que exige el módulo (igual que el NAV). "*" = solo dueño. */
  perm: string;
  titulo: string;
  resumen: string;
  guia: string[];
  /** Recorrido interactivo que hace el proceso paso a paso. */
  tourId?: string;
}

const MODULOS: ModuloAyuda[] = [
  {
    seccion: "inicio",
    perm: "reportes.ventas",
    titulo: "Guía de inicio",
    resumen: "Los pasos para dejar tu negocio listo para vender.",
    guia: [
      "Al entrar aterrizas aquí: una lista de pasos que se palomean solos.",
      "Toca “Ir →” en cada paso para que te lleve a la pantalla correcta.",
      "Cuando estén todos, ¡ya puedes vender!",
    ],
    tourId: "bienvenida",
  },
  {
    seccion: "productos",
    perm: "productos.leer",
    titulo: "Productos",
    resumen: "Da de alta y edita todo lo que vendes.",
    guia: [
      "Toca “+ Nuevo producto”. Con nombre y precio ya puedes vender.",
      "Si usas código de barras, captura su clave para escanearlo.",
      "¿Muchos productos? Usa “Carga masiva” para importarlos de un archivo.",
    ],
    tourId: "crear-producto",
  },
  {
    seccion: "inventario",
    perm: "inventario.leer",
    titulo: "Inventario",
    resumen: "Controla las existencias de cada producto.",
    guia: [
      "Toca “+ Entrada de inventario” para sumar mercancía que llegó.",
      "Elige el producto, la cantidad y el motivo.",
      "Tu stock se actualiza al instante y queda registrado el movimiento.",
    ],
    tourId: "dar-entrada-inventario",
  },
  {
    seccion: "ventas",
    perm: "ventas.leer",
    titulo: "Ventas",
    resumen: "Consulta y administra tus ventas.",
    guia: [
      "Aquí ves el historial de ventas con su detalle.",
      "Para cobrar en mostrador se usa la app de POS.",
      "Cada venta descuenta inventario y aparece en Reportes.",
    ],
  },
  {
    seccion: "cobros",
    perm: "ventas.crear",
    titulo: "Cobros / Links de pago",
    resumen: "Cobra a distancia con un link por WhatsApp.",
    guia: [
      "Toca “+ Nuevo cobro”, pon el monto y el concepto.",
      "Se genera un link que le mandas a tu cliente.",
      "Cuando pague, te enteras y queda registrado.",
    ],
    tourId: "crear-cobro",
  },
  {
    seccion: "clientes-b2b",
    perm: "clientes.leer",
    titulo: "Clientes de mayoreo",
    resumen: "Registra a quién le vendes al por mayor.",
    guia: [
      "Toca “+ Nuevo cliente”. Razón social, RFC y régimen son obligatorios.",
      "Puedes fijarle su lista de precios y sus días de crédito.",
      "Al venderle se aplican sus precios y condiciones.",
    ],
    tourId: "dar-alta-cliente-mayoreo",
  },
  {
    seccion: "precios",
    perm: "precios.leer",
    titulo: "Listas de precios",
    resumen: "Precios especiales (mayoreo, por cliente…).",
    guia: [
      "Toca “+ Nueva lista” y ponle nombre (ej. “Mayoreo”).",
      "Define el precio especial de cada producto.",
      "Asigna la lista a tus clientes de mayoreo.",
    ],
    tourId: "crear-lista-precios",
  },
  {
    seccion: "comisiones",
    perm: "comisiones.gestionar",
    titulo: "Comisiones",
    resumen: "Cuánto gana cada vendedor por vender o cobrar.",
    guia: [
      "Toca “+ Nueva regla” y define el porcentaje (ej. 5%).",
      "Elige si es sobre la venta o sobre el cobro.",
      "Puedes limitarla a una categoría o producto.",
    ],
    tourId: "crear-comision",
  },
  {
    seccion: "usuarios",
    perm: "usuarios.leer",
    titulo: "Usuarios y permisos",
    resumen: "Da de alta a tu equipo y define qué ve cada quien.",
    guia: [
      "Toca “+ Nuevo usuario”: nombre, correo y contraseña.",
      "Asígnale un rol; solo verá lo que su rol permite.",
      "En la pestaña Roles puedes crear roles a tu medida.",
    ],
    tourId: "dar-alta-usuario",
  },
  {
    seccion: "suscripcion",
    perm: "*",
    titulo: "Mi suscripción y cobros a clientes",
    resumen: "Tu plan, tu tarjeta y cómo aceptar pagos.",
    guia: [
      "Guarda la tarjeta con la que se cobra tu plan.",
      "Con “Conectar con Stripe” aceptas tarjetas de tus clientes.",
      "El dinero de esas ventas llega directo a tu cuenta.",
    ],
  },
  {
    seccion: "seguridad",
    perm: "configuracion.leer",
    titulo: "Seguridad y huella",
    resumen: "Entra con huella y protege tu cuenta.",
    guia: [
      "Toca “Activar huella en este dispositivo” y confirma con tu dedo.",
      "Luego podrás entrar sin contraseña, solo con tu huella.",
      "También puedes activar verificación en dos pasos (2FA).",
    ],
  },
  {
    seccion: "tienda",
    perm: "ecommerce.configurar",
    titulo: "Tienda online",
    resumen: "Vende por internet con tu propia tienda.",
    guia: [
      "Configura el nombre, logo y datos de tu tienda.",
      "Publica los productos que quieras vender en línea.",
      "Recibes los pedidos en la sección “Pedidos online”.",
    ],
  },
  {
    seccion: "portal-b2b",
    perm: "configuracion.actualizar",
    titulo: "Portal mayorista con tu dominio",
    resumen: "Que tus clientes de mayoreo pidan solos.",
    guia: [
      "Conecta un dominio propio (ej. pedidos.tu-negocio.com).",
      "Sigue las instrucciones de DNS que te muestra la pantalla.",
      "Tus clientes entran a tu portal con tu marca.",
    ],
  },
];

function irA(seccion: string) {
  window.dispatchEvent(new CustomEvent("gaes-nav", { detail: seccion }));
}

export function AyudaPage() {
  const [q, setQ] = useState("");

  const visibles = useMemo(() => {
    const permitidos = MODULOS.filter((m) => puede(m.perm));
    const t = q.trim().toLowerCase();
    if (!t) return permitidos;
    return permitidos.filter(
      (m) =>
        m.titulo.toLowerCase().includes(t) ||
        m.resumen.toLowerCase().includes(t) ||
        m.guia.some((g) => g.toLowerCase().includes(t)),
    );
  }, [q]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-bold text-2xl text-slate-800">Ayuda</h1>
      <p className="mt-1 text-slate-500 text-sm">
        Manual de cada sección que puedes usar. En cualquiera toca{" "}
        <b className="text-brand">Guíame paso a paso</b> y te acompaño de forma interactiva a hacer
        el proceso, las veces que quieras.
      </p>

      <div className="mt-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar ayuda… (ej. inventario, tarjeta, huella)"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:border-brand focus:outline-none"
        />
      </div>

      <div className="mt-4 space-y-3 pb-6">
        {visibles.length === 0 ? (
          <p className="rounded-xl bg-white p-6 text-center text-slate-400 text-sm shadow-sm">
            No encontramos ayuda para “{q}”. Prueba con otra palabra.
          </p>
        ) : (
          visibles.map((m) => (
            <details key={m.seccion} className="group rounded-2xl bg-white p-4 shadow-sm">
              <summary className="flex cursor-pointer items-center justify-between gap-3 list-none">
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-800">{m.titulo}</span>
                  <span className="block text-slate-500 text-sm">{m.resumen}</span>
                </span>
                <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
              </summary>

              <div className="mt-3 border-slate-100 border-t pt-3">
                <ol className="mb-3 space-y-1.5">
                  {m.guia.map((g, i) => (
                    <li key={g} className="flex gap-2 text-slate-600 text-sm">
                      <span className="font-semibold text-brand">{i + 1}.</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2">
                  {m.tourId && (
                    <button
                      type="button"
                      onClick={() => lanzarTour(m.tourId as string)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 font-semibold text-sm text-white hover:bg-brand-dark"
                    >
                      <Sparkles size={15} /> Guíame paso a paso
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => irA(m.seccion)}
                    className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-600 text-sm hover:bg-slate-50"
                  >
                    Ir a la sección →
                  </button>
                </div>
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
