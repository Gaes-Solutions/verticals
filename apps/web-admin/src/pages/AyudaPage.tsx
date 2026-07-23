import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { puede } from "../lib/api.js";
import { lanzarTour, tourPorId } from "../lib/tours.js";

interface ModuloAyuda {
  seccion: string;
  /** Permiso que exige el módulo (igual que el NAV). "*" = solo dueño. */
  perm: string;
  titulo: string;
  resumen: string;
  /** Explicación de para qué sirve el apartado. */
  paraQue: string;
  guia: string[];
  tips?: string[];
  dudas?: [string, string][];
  /** Recorrido interactivo que hace el proceso paso a paso. */
  tourId?: string;
}

const MODULOS: ModuloAyuda[] = [
  {
    seccion: "inicio",
    perm: "reportes.ventas",
    titulo: "Guía de inicio",
    resumen: "Los pasos para dejar tu negocio listo para vender.",
    paraQue:
      "Es tu punto de partida: muestra los pasos para dejar tu negocio listo y los va palomeando solos conforme los completas.",
    guia: [
      "Al entrar aterrizas aquí automáticamente.",
      "Toca “Ir →” en cada paso para que te lleve a la pantalla correcta.",
      "Cuando estén todos ✅, ¡ya puedes vender!",
    ],
    tips: ["No tienes que hacerlos en orden, pero el primero siempre es cargar tus productos."],
    tourId: "bienvenida",
  },
  {
    seccion: "productos",
    perm: "productos.leer",
    titulo: "Productos",
    resumen: "Da de alta y edita todo lo que vendes.",
    paraQue: "Tu catálogo: todo lo que vendes, con su precio y su código.",
    guia: [
      "Toca “+ Nuevo producto”. Con nombre y precio ya puedes vender.",
      "Si usas código de barras, captura su clave para escanearlo.",
      "¿Muchos productos? Usa “Carga masiva” para importarlos de un archivo.",
    ],
    tips: ["Puedes editar el precio de un producto cuando quieras."],
    dudas: [
      ["¿Qué es lo mínimo para vender?", "Solo el nombre y el precio; lo demás es opcional."],
    ],
    tourId: "crear-producto",
  },
  {
    seccion: "inventario",
    perm: "inventario.leer",
    titulo: "Inventario",
    resumen: "Controla las existencias de cada producto.",
    paraQue: "Controla cuántas piezas tienes de cada producto en cada sucursal.",
    guia: [
      "Toca “+ Entrada de inventario” para sumar mercancía que llegó.",
      "Elige el producto, la cantidad y el motivo.",
      "Tu stock se actualiza al instante y queda el movimiento registrado.",
    ],
    tips: ["Filtra por “bajo mínimo” para ver qué está por agotarse."],
    dudas: [
      [
        "¿El inventario baja solo al vender?",
        "Sí, cada venta descuenta las piezas automáticamente.",
      ],
    ],
    tourId: "dar-entrada-inventario",
  },
  {
    seccion: "importador",
    perm: "productos.bulk_import",
    titulo: "Carga masiva",
    resumen: "Importa muchos productos desde un archivo.",
    paraQue: "Sube muchos productos de golpe desde un archivo, en vez de uno por uno.",
    guia: [
      "Descarga la plantilla y llénala con tus productos.",
      "Súbela; el sistema valida y te avisa si hay errores.",
      "Confirma y todos se cargan de una vez.",
    ],
    dudas: [
      [
        "¿Y si me equivoco en el archivo?",
        "El sistema marca la fila y el error antes de guardar; corriges y vuelves a subir.",
      ],
    ],
  },
  {
    seccion: "etiquetas",
    perm: "productos.leer",
    titulo: "Etiquetas y códigos",
    resumen: "Imprime etiquetas con código de barras.",
    paraQue: "Imprime etiquetas con código de barras para pegar en tus productos.",
    guia: [
      "Elige los productos y el formato de etiqueta.",
      "Genera e imprime.",
      "Pégalas y ya podrás escanearlas en el POS.",
    ],
    tips: ["Útil si compras un lector de código de barras para cobrar más rápido."],
  },
  {
    seccion: "inventario-iq",
    perm: "reportes.ventas",
    titulo: "Inteligencia de inventario",
    resumen: "Qué reponer y qué se está quedando parado.",
    paraQue: "Te dice qué reponer y qué casi no se vende, con base en tus ventas.",
    guia: [
      "Elige el rango de días a analizar.",
      "Revisa lo que más rota y lo que casi no se mueve.",
      "Úsalo para decidir qué comprar y qué dejar de comprar.",
    ],
    tips: ["Revísalo antes de hacer un pedido a tu proveedor."],
  },
  {
    seccion: "compras",
    perm: "compras_oc.leer",
    titulo: "Compras (órdenes de compra)",
    resumen: "Pídele mercancía a tus proveedores.",
    paraQue: "Registra lo que le pides a tus proveedores.",
    guia: [
      "Crea una orden con el proveedor y los productos.",
      "Cuando llegue la mercancía, márcala como recibida.",
      "Tu inventario sube automáticamente al recibirla.",
    ],
    dudas: [
      [
        "¿Sube el inventario al crear la orden?",
        "No, hasta que marcas la mercancía como recibida.",
      ],
    ],
    tourId: "crear-orden-compra",
  },
  {
    seccion: "ventas",
    perm: "ventas.leer",
    titulo: "Ventas",
    resumen: "Consulta y administra tus ventas.",
    paraQue: "El historial de todo lo que has vendido, con su detalle.",
    guia: [
      "Consulta cada venta con sus productos y forma de pago.",
      "Para cobrar en mostrador se usa la app de POS.",
      "Cada venta descuenta inventario y aparece en Reportes.",
    ],
    dudas: [
      [
        "¿Dónde cobro en caja?",
        "En la app de Punto de Venta (POS); esta pantalla es para consultar.",
      ],
    ],
  },
  {
    seccion: "cobros",
    perm: "ventas.crear",
    titulo: "Cobros / Links de pago",
    resumen: "Cobra a distancia con un link por WhatsApp.",
    paraQue: "Cóbrale a un cliente a distancia con un link que le mandas por WhatsApp.",
    guia: [
      "Toca “+ Nuevo cobro”, pon el concepto y el monto.",
      "Se genera un link; compártelo por WhatsApp.",
      "Cuando el cliente paga, te enteras y queda registrado.",
    ],
    dudas: [["¿El cliente necesita la app?", "No; paga desde el link en su navegador."]],
    tourId: "crear-cobro",
  },
  {
    seccion: "promociones",
    perm: "promociones.gestionar",
    titulo: "Promociones",
    resumen: "Descuentos automáticos para vender más.",
    paraQue: "Descuentos automáticos (2x1, % de descuento, precio especial) que se aplican solos.",
    guia: [
      "Toca “+ Nueva promo” y nómbrala.",
      "Elige el tipo y a qué productos aplica.",
      "Define su vigencia y actívala.",
    ],
    dudas: [["¿Se aplica sola?", "Sí, al cobrar en el POS y en línea, mientras esté vigente."]],
    tourId: "crear-promocion",
  },
  {
    seccion: "monedero",
    perm: "ventas.crear",
    titulo: "Monedero y tarjetas de regalo",
    resumen: "Puntos de lealtad y gift cards.",
    paraQue: "Saldo a favor del cliente (lealtad) y tarjetas de regalo que se venden y canjean.",
    guia: [
      "El monedero acumula saldo a favor de tus clientes por sus compras.",
      "Las tarjetas de regalo se venden y se canjean en el POS.",
    ],
    tips: ["Buena herramienta para que los clientes regresen."],
  },
  {
    seccion: "devoluciones",
    perm: "ventas.leer",
    titulo: "Devoluciones",
    resumen: "Gestiona cuando un cliente regresa algo.",
    paraQue: "Gestiona cuando un cliente regresa un producto.",
    guia: [
      "Busca la venta original.",
      "Registra la devolución (el producto puede regresar a inventario).",
      "Se genera el reembolso o nota de crédito.",
    ],
  },
  {
    seccion: "cxc",
    perm: "cxc.leer",
    titulo: "Cuentas por cobrar",
    resumen: "Controla lo que te deben tus clientes.",
    paraQue: "Controla lo que te deben tus clientes a crédito.",
    guia: [
      "Aquí ves quién te debe y cuánto.",
      "Registra los pagos (abonos) que te van haciendo.",
      "El saldo de cada cliente baja al instante.",
    ],
    tips: ["Revísalo seguido para cobrar a tiempo."],
    tourId: "registrar-cobro-cxc",
  },
  {
    seccion: "clientes-b2b",
    perm: "clientes.leer",
    titulo: "Clientes de mayoreo",
    resumen: "Registra a quién le vendes al por mayor.",
    paraQue: "Registra a quién le vendes al mayoreo, con sus datos fiscales y su crédito.",
    guia: [
      "Toca “+ Nuevo cliente”. Razón social, RFC y régimen son obligatorios.",
      "Puedes fijarle su lista de precios y sus días de crédito.",
      "Al venderle se aplican sus precios y condiciones.",
    ],
    dudas: [
      [
        "¿Puedo darle crédito?",
        "Sí; define sus días de crédito y lo controlas en Cuentas por cobrar.",
      ],
    ],
    tourId: "dar-alta-cliente-mayoreo",
  },
  {
    seccion: "precios",
    perm: "precios.leer",
    titulo: "Listas de precios",
    resumen: "Precios especiales (mayoreo, por cliente…).",
    paraQue: "Precios especiales distintos al público, para mayoreo o clientes específicos.",
    guia: [
      "Toca “+ Nueva lista”, ponle un código y un nombre.",
      "Define el precio especial de cada producto.",
      "Asigna la lista a tus clientes de mayoreo.",
    ],
    tips: ["Puedes tener varias listas (ej. mayoreo, medio mayoreo)."],
    tourId: "crear-lista-precios",
  },
  {
    seccion: "comisiones",
    perm: "comisiones.gestionar",
    titulo: "Comisiones",
    resumen: "Cuánto gana cada vendedor por vender o cobrar.",
    paraQue: "Define cuánto gana cada vendedor por vender o por cobrar.",
    guia: [
      "Toca “+ Nueva regla” y define el porcentaje (ej. 5%).",
      "Elige si es sobre la venta o sobre el cobro.",
      "Puedes limitarla a una categoría o producto.",
    ],
    dudas: [
      ["¿Se calcula sola?", "Sí, el vendedor gana su comisión automáticamente en cada venta."],
    ],
    tourId: "crear-comision",
  },
  {
    seccion: "reportes",
    perm: "reportes.ventas",
    titulo: "Reportes",
    resumen: "Cómo va tu negocio en números.",
    paraQue: "Cómo va tu negocio en números: ventas por día, producto, vendedor…",
    guia: [
      "Cambia el rango de fechas para comparar periodos.",
      "Revisa qué se vende más y quién vende más.",
      "Úsalo para tomar decisiones con datos.",
    ],
    tips: ["Revisa tus reportes al cierre de cada semana."],
  },
  {
    seccion: "dashboard",
    perm: "reportes.ventas",
    titulo: "Resumen",
    resumen: "Un vistazo rápido a tus números de hoy.",
    paraQue: "Un vistazo rápido a los números clave de tu negocio hoy.",
    guia: [
      "Míralo al entrar para saber cómo vas.",
      "Profundiza en Reportes cuando necesites detalle.",
    ],
  },
  {
    seccion: "tienda",
    perm: "ecommerce.configurar",
    titulo: "Tienda online",
    resumen: "Vende por internet con tu propia tienda.",
    paraQue: "Tu tienda por internet para vender fuera del mostrador.",
    guia: [
      "Configura el nombre, logo y datos de tu tienda.",
      "Publica los productos que quieras vender en línea.",
      "Recibes los pedidos en “Pedidos online”.",
    ],
  },
  {
    seccion: "pedidos",
    perm: "ecommerce.pedidos_leer",
    titulo: "Pedidos online",
    resumen: "Los pedidos que llegan de tu tienda web.",
    paraQue: "Los pedidos que llegan de tu tienda en línea.",
    guia: [
      "Revisa cada pedido y su detalle.",
      "Cambia su estado (preparando, enviado, entregado).",
      "El cliente recibe avisos automáticos.",
    ],
  },
  {
    seccion: "envios",
    perm: "ecommerce.envios_gestionar",
    titulo: "Envíos",
    resumen: "Zonas y tarifas de envío de tu tienda.",
    paraQue:
      "Define a qué zonas envías y cuánto cobras; ese costo le aparece solo al cliente al pagar en tu tienda.",
    guia: [
      "Crea una zona de envío (ej. Nacional) con los estados que cubre.",
      "Dentro de la zona, agrega sus tarifas: costo, envío gratis desde $ y días.",
      "El checkout de tu tienda calcula el envío según la zona del cliente.",
    ],
  },
  {
    seccion: "resenas",
    perm: "ecommerce.resenas_moderar",
    titulo: "Reseñas",
    resumen: "Modera lo que opinan tus clientes.",
    paraQue: "Modera lo que opinan tus clientes sobre tus productos.",
    guia: [
      "Revisa las reseñas.",
      "Apruébalas o recházalas.",
      "Las aprobadas se muestran en tu tienda.",
    ],
    tips: ["Las buenas reseñas ayudan a vender más."],
  },
  {
    seccion: "preguntas",
    perm: "ecommerce.resenas_moderar",
    titulo: "Preguntas",
    resumen: "Responde dudas de tus compradores.",
    paraQue: "Responde las dudas que dejan los compradores en tus productos.",
    guia: [
      "Aquí llegan las preguntas.",
      "Respóndelas para ayudar a decidir la compra.",
      "Se muestran en la ficha del producto.",
    ],
  },
  {
    seccion: "portal-b2b",
    perm: "configuracion.actualizar",
    titulo: "Portal mayorista (dominio propio)",
    resumen: "Que tus clientes de mayoreo pidan solos.",
    paraQue: "Que tus clientes de mayoreo hagan pedidos solos, en un portal con tu marca.",
    guia: [
      "Conecta un dominio propio (ej. pedidos.tu-negocio.com).",
      "Sigue las instrucciones de DNS que te muestra la pantalla.",
      "Tus clientes entran a tu portal con tu marca.",
    ],
    dudas: [
      [
        "¿Necesito saber de dominios?",
        "No: pegas tu dominio y la pantalla te dice qué registro crear.",
      ],
    ],
  },
  {
    seccion: "cfdi",
    perm: "cfdi.leer",
    titulo: "Facturación (CFDI)",
    resumen: "Emite facturas de tus ventas.",
    paraQue: "Emite facturas (CFDI) de tus ventas.",
    guia: [
      "Genera la factura de una venta.",
      "Captura los datos fiscales del cliente.",
      "Se timbra y queda lista para descargar o enviar.",
    ],
    dudas: [
      [
        "¿Necesito algo para timbrar?",
        "Sí, tus datos fiscales configurados; si falta algo, el sistema te avisa.",
      ],
    ],
  },
  {
    seccion: "contabilidad",
    perm: "cfdis_recibidos.leer",
    titulo: "Contabilidad",
    resumen: "Tus facturas recibidas y gastos.",
    paraQue: "Tus facturas recibidas y gastos, listos para tu contador.",
    guia: [
      "Sube o recibe las facturas de tus proveedores.",
      "El sistema las clasifica.",
      "Facilita tu declaración y deducciones.",
    ],
  },
  {
    seccion: "usuarios",
    perm: "usuarios.leer",
    titulo: "Usuarios y permisos",
    resumen: "Da de alta a tu equipo y define qué ve cada quien.",
    paraQue: "Da de alta a tu equipo y define qué puede hacer cada quien.",
    guia: [
      "Toca “+ Nuevo usuario”: nombre, correo y contraseña.",
      "Asígnale un rol; solo verá lo que su rol permite.",
      "En la pestaña Roles puedes crear roles a tu medida.",
    ],
    dudas: [
      [
        "¿Un cajero verá mis reportes?",
        "No, si su rol no lo permite; el sistema le oculta lo que no puede usar.",
      ],
    ],
    tourId: "dar-alta-usuario",
  },
  {
    seccion: "automatizaciones",
    perm: "plantillas.gestionar",
    titulo: "Automatizaciones",
    resumen: "Mensajes automáticos a tus clientes.",
    paraQue: "Mensajes automáticos a tus clientes (WhatsApp, etc.).",
    guia: [
      "Toca crear una nueva.",
      "Elige qué la dispara (tras una compra, carrito abandonado…).",
      "Elige la plantilla/campaña que se envía y guárdala.",
    ],
    tips: ["Una vez activas, trabaja sola por ti."],
    tourId: "crear-automatizacion",
  },
  {
    seccion: "suscripcion",
    perm: "*",
    titulo: "Mi suscripción y cobros a clientes",
    resumen: "Tu plan, tu tarjeta y cómo aceptar pagos.",
    paraQue: "Tu plan, tu tarjeta de pago y cómo aceptar tarjetas de tus clientes.",
    guia: [
      "Guarda la tarjeta con la que se cobra tu plan.",
      "Con “Conectar con Stripe” aceptas tarjetas de tus clientes.",
      "El dinero de esas ventas llega directo a tu cuenta.",
    ],
    dudas: [["¿Quién ve esta sección?", "Solo el dueño del negocio."]],
    tourId: "agregar-tarjeta",
  },
  {
    seccion: "seguridad",
    perm: "configuracion.leer",
    titulo: "Seguridad y huella",
    resumen: "Entra con huella y protege tu cuenta.",
    paraQue: "Entra con tu huella o Face ID y protege tu cuenta.",
    guia: [
      "Toca “Activar huella en este dispositivo” y confirma con tu dedo.",
      "Luego podrás entrar sin contraseña, solo con tu huella.",
      "Opcional: activa verificación en dos pasos (2FA).",
    ],
    dudas: [
      [
        "¿Es seguro?",
        "Sí; tu huella nunca sale de tu teléfono (es un passkey, estándar de Apple/Google).",
      ],
    ],
    tourId: "activar-huella",
  },
  {
    seccion: "configuracion",
    perm: "configuracion.leer",
    titulo: "Configuración",
    resumen: "Tope de descuento manual del POS.",
    paraQue:
      "Define el descuento máximo (%) que un cajero normal puede aplicar en una venta; los roles con permiso especial y el dueño pueden pasarlo.",
    guia: [
      "Escribe el descuento máximo permitido (ej. 10%).",
      "Usa 100 si no quieres tope.",
      "Guarda; se aplica de inmediato en el POS.",
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
        m.paraQue.toLowerCase().includes(t) ||
        m.guia.some((g) => g.toLowerCase().includes(t)),
    );
  }, [q]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-bold text-2xl text-slate-800">Ayuda</h1>
      <p className="mt-1 text-slate-500 text-sm">
        Manual de cada sección que puedes usar. En cualquiera toca{" "}
        <b className="text-brand">Guíame paso a paso</b> y te acompaño de forma interactiva, las
        veces que quieras.
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
          visibles.map((m) => {
            // Recorrido: el explícito, o el de orientación "ver-<sección>" si existe.
            const tid =
              m.tourId ?? (tourPorId(`ver-${m.seccion}`) ? `ver-${m.seccion}` : undefined);
            return (
              <details key={m.seccion} className="group rounded-2xl bg-white p-4 shadow-sm">
                <summary className="flex cursor-pointer items-center justify-between gap-3 list-none">
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-800">{m.titulo}</span>
                    <span className="block text-slate-500 text-sm">{m.resumen}</span>
                  </span>
                  <span className="text-slate-400 transition-transform group-open:rotate-180">
                    ⌄
                  </span>
                </summary>

                <div className="mt-3 border-slate-100 border-t pt-3">
                  <p className="mb-3 text-slate-600 text-sm">
                    <b className="text-slate-700">¿Para qué sirve?</b> {m.paraQue}
                  </p>

                  <p className="mb-1 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                    Cómo se hace
                  </p>
                  <ol className="mb-3 space-y-1.5">
                    {m.guia.map((g, i) => (
                      <li key={g} className="flex gap-2 text-slate-600 text-sm">
                        <span className="font-semibold text-brand">{i + 1}.</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ol>

                  {m.tips?.length ? (
                    <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2">
                      {m.tips.map((t) => (
                        <p key={t} className="text-amber-700 text-sm">
                          💡 {t}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {m.dudas?.length ? (
                    <div className="mb-3">
                      <p className="mb-1 font-semibold text-slate-500 text-xs uppercase tracking-wide">
                        Dudas comunes
                      </p>
                      {m.dudas.map(([pregunta, respuesta]) => (
                        <div key={pregunta} className="mb-2">
                          <p className="font-medium text-slate-700 text-sm">{pregunta}</p>
                          <p className="text-slate-500 text-sm">{respuesta}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {tid && (
                      <button
                        type="button"
                        onClick={() => lanzarTour(tid)}
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
            );
          })
        )}
      </div>
    </div>
  );
}
