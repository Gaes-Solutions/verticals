export interface TourStep {
  /** Sección a la que navegar antes de este paso (dispara "gaes-nav"). */
  seccion?: string;
  /** data-tour del elemento a resaltar. Si falta, el paso solo muestra texto. */
  anchor?: string;
  /** data-tour de un botón que se hace click para abrir un diálogo/modal antes
   * de resaltar `anchor` (que suele estar dentro de ese diálogo). */
  abrir?: string;
  titulo: string;
  texto: string;
}

export interface TourDef {
  id: string;
  nombre: string;
  descripcion: string;
  pasos: TourStep[];
  /** Se ofrece solo una vez de forma automática (con opción de deshabilitar). */
  autoOnce?: boolean;
}

export const TOURS: TourDef[] = [
  {
    id: "bienvenida",
    nombre: "Recorrido de bienvenida",
    descripcion: "Un vistazo rápido a las partes clave de tu panel.",
    autoOnce: true,
    pasos: [
      {
        titulo: "¡Bienvenido a GaesSoft! 👋",
        texto:
          "Te doy un recorrido de 30 segundos por lo principal. Puedes salir cuando quieras y retomarlo desde Ayuda.",
      },
      {
        seccion: "inicio",
        anchor: "nav-inicio",
        titulo: "Tu guía de inicio",
        texto:
          "Aquí tienes los pasos para dejar tu negocio listo. Se van palomeando solos conforme los completas.",
      },
      {
        anchor: "nav-productos",
        titulo: "Tus productos",
        texto: "Desde aquí cargas y administras todo lo que vendes.",
      },
      {
        anchor: "nav-ayuda",
        titulo: "Ayuda cuando la necesites",
        texto:
          "En Ayuda encuentras el manual y puedes volver a lanzar cualquier recorrido guiado como este.",
      },
      {
        titulo: "¡Listo para empezar! 🎉",
        texto: "Cuando quieras, te acompaño paso a paso a crear tu primer producto.",
      },
    ],
  },
  {
    id: "crear-producto",
    nombre: "Crear tu primer producto",
    descripcion: "Te llevo de la mano para dar de alta un producto.",
    pasos: [
      {
        seccion: "productos",
        anchor: "nav-productos",
        titulo: "Entra a Productos",
        texto: "Aquí vive tu catálogo. Ya te llevé a esta sección.",
      },
      {
        anchor: "prod-nuevo",
        titulo: "Agrega uno nuevo",
        texto: "Toca “+ Nuevo producto”. (Ahora te abro el formulario para mostrarte cómo.)",
      },
      {
        abrir: "prod-nuevo",
        anchor: "prod-f-nombre",
        titulo: "1) El nombre",
        texto: "Escribe aquí cómo se llama el producto. Es lo único obligatorio junto al precio.",
      },
      {
        anchor: "prod-f-precio",
        titulo: "2) El precio de venta",
        texto: "Aquí va a cuánto lo vendes. Con nombre y precio ya puedes cobrarlo.",
      },
      {
        anchor: "prod-f-sku",
        titulo: "3) Código de barras (opcional)",
        texto: "Si lo escaneas en caja, captura aquí su clave/código. Si no, déjalo vacío.",
      },
      {
        anchor: "prod-f-guardar",
        titulo: "4) ¡Guarda! ✅",
        texto: "Toca Guardar y tu producto queda listo para venderse en el POS y en línea.",
      },
    ],
  },
  {
    id: "dar-entrada-inventario",
    nombre: "Dar entrada a inventario",
    descripcion: "Te guío para registrar mercancía que entra a tu almacén.",
    pasos: [
      {
        seccion: "inventario",
        anchor: "nav-inventario",
        titulo: "Entra a Inventario",
        texto: "Aquí ves y ajustas las existencias de cada producto. Ya te traje a esta sección.",
      },
      {
        anchor: "inv-nuevo",
        titulo: "Registra una entrada",
        texto: "Toca “+ Entrada de inventario”. (Ahora te abro la ventana para mostrarte.)",
      },
      {
        abrir: "inv-nuevo",
        anchor: "inv-f-buscar",
        titulo: "1) Busca el producto",
        texto: "Escribe el nombre o código y elígelo de la lista que aparece.",
      },
      {
        titulo: "2) Cantidad y guardar",
        texto:
          "Una vez elegido, escribe cuántas piezas entraron y el motivo (compra, ajuste…), y toca Guardar.",
      },
      {
        titulo: "¡Guardado! ✅",
        texto: "Tu stock se actualiza al instante y queda registrado el movimiento.",
      },
    ],
  },
  {
    id: "dar-alta-usuario",
    nombre: "Dar de alta a alguien de tu equipo",
    descripcion: "Crea una cuenta para un cajero, vendedor u otro colaborador.",
    pasos: [
      {
        seccion: "usuarios",
        anchor: "nav-usuarios",
        titulo: "Entra a Usuarios y permisos",
        texto: "Aquí administras a tu equipo. Ya te traje a esta sección.",
      },
      {
        anchor: "user-nuevo",
        titulo: "Agrega un usuario",
        texto: "Toca “+ Nuevo usuario”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "user-nuevo",
        anchor: "user-f-nombre",
        titulo: "1) Su nombre",
        texto: "El nombre de la persona de tu equipo.",
      },
      {
        anchor: "user-f-email",
        titulo: "2) Su correo",
        texto: "Con este correo iniciará sesión.",
      },
      {
        anchor: "user-f-pass",
        titulo: "3) Una contraseña",
        texto: "Ponle una contraseña temporal; luego él puede cambiarla.",
      },
      {
        anchor: "user-f-crear",
        titulo: "4) ¡Crea el usuario! ✅",
        texto:
          "Elige su rol y toca Crear usuario. El sistema solo le mostrará lo que su rol permite.",
      },
    ],
  },
  {
    id: "dar-alta-cliente-mayoreo",
    nombre: "Dar de alta un cliente de mayoreo",
    descripcion: "Registra a quién le vendes al por mayor, con su crédito.",
    pasos: [
      {
        seccion: "clientes-b2b",
        anchor: "nav-clientes-b2b",
        titulo: "Entra a Clientes de mayoreo",
        texto: "Aquí van tus clientes B2B. Ya te traje a esta sección.",
      },
      {
        anchor: "cli-nuevo",
        titulo: "Agrega un cliente",
        texto: "Toca “+ Nuevo cliente”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "cli-nuevo",
        anchor: "cli-f-razon",
        titulo: "1) Razón social",
        texto: "El nombre fiscal del cliente (como aparece en su RFC).",
      },
      {
        anchor: "cli-f-rfc",
        titulo: "2) RFC",
        texto: "Su RFC. Junto al régimen fiscal, son obligatorios para facturarle.",
      },
      {
        anchor: "cli-f-crear",
        titulo: "3) ¡Crea el cliente! ✅",
        texto: "Toca Crear cliente. Puedes fijarle su lista de precios y días de crédito.",
      },
    ],
  },
  {
    id: "crear-lista-precios",
    nombre: "Crear una lista de precios",
    descripcion: "Define precios especiales (mayoreo, por cliente…).",
    pasos: [
      {
        seccion: "precios",
        anchor: "nav-precios",
        titulo: "Entra a Listas de precios",
        texto: "Aquí creas precios distintos al normal. Ya te traje a esta sección.",
      },
      {
        anchor: "precio-nuevo",
        titulo: "Crea una lista",
        texto: "Toca “+ Nueva lista”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "precio-nuevo",
        anchor: "precio-f-codigo",
        titulo: "1) Un código",
        texto: "Una clave corta para identificarla, ej. MAYOREO.",
      },
      {
        anchor: "precio-f-nombre",
        titulo: "2) Su nombre",
        texto: "Cómo la verás, ej. “Precio de mayoreo”.",
      },
      {
        anchor: "precio-f-crear",
        titulo: "3) ¡Créala! ✅",
        texto:
          "Toca Crear. Luego le pones el precio especial a cada producto y la asignas a clientes.",
      },
    ],
  },
  {
    id: "crear-comision",
    nombre: "Configurar una comisión",
    descripcion: "Define cuánto gana un vendedor por vender o cobrar.",
    pasos: [
      {
        seccion: "comisiones",
        anchor: "nav-comisiones",
        titulo: "Entra a Comisiones",
        texto: "Aquí defines las comisiones de tu equipo. Ya te traje a esta sección.",
      },
      {
        anchor: "com-nuevo",
        titulo: "Crea una regla",
        texto: "Toca “+ Nueva regla”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "com-nuevo",
        anchor: "com-f-nombre",
        titulo: "1) Nómbrala",
        texto: "Un nombre para identificar la regla, ej. “Comisión general”.",
      },
      {
        anchor: "com-f-pct",
        titulo: "2) El porcentaje",
        texto:
          "Cuánto gana el vendedor, ej. 5. A la derecha eliges si es sobre la venta o el cobro.",
      },
      {
        anchor: "com-f-crear",
        titulo: "3) ¡Crea la regla! ✅",
        texto: "Toca Crear regla. El vendedor gana su comisión automáticamente en cada venta.",
      },
    ],
  },
  {
    id: "crear-cobro",
    nombre: "Cobrar con un link de pago",
    descripcion: "Genera un link para cobrarle a un cliente por WhatsApp.",
    pasos: [
      {
        seccion: "cobros",
        anchor: "nav-cobros",
        titulo: "Entra a Cobros / Links",
        texto: "Aquí generas links de pago. Ya te traje a esta sección.",
      },
      {
        anchor: "cobro-nuevo",
        titulo: "Crea un cobro",
        texto: "Toca “+ Nuevo cobro”. (Ahora te abro el formulario.)",
      },
      {
        abrir: "cobro-nuevo",
        anchor: "cobro-f-concepto",
        titulo: "1) El concepto",
        texto: "Por qué le cobras, ej. “Anticipo pedido #123”.",
      },
      {
        anchor: "cobro-f-monto",
        titulo: "2) El monto",
        texto: "Cuánto va a pagar.",
      },
      {
        anchor: "cobro-f-crear",
        titulo: "3) ¡Genera el link! ✅",
        texto:
          "Toca Crear cobro; se genera un link que le mandas por WhatsApp. Al pagar, te enteras.",
      },
    ],
  },
  {
    id: "crear-promocion",
    nombre: "Crear una promoción",
    descripcion: "Descuentos automáticos para vender más.",
    pasos: [
      {
        seccion: "promociones",
        anchor: "nav-promociones",
        titulo: "Entra a Promociones",
        texto: "Aquí creas ofertas que se aplican solas al cobrar. Ya te traje a esta sección.",
      },
      {
        anchor: "promo-nuevo",
        titulo: "Crea una promo",
        texto: "Toca el botón. (Ahora te abro el formulario.)",
      },
      {
        abrir: "promo-nuevo",
        anchor: "promo-f-nombre",
        titulo: "1) Nómbrala",
        texto: "Un nombre para tu promo, ej. “2x1 fin de semana”.",
      },
      {
        titulo: "2) Define la oferta",
        texto: "Elige el tipo (2x1, % de descuento, precio especial) y a qué productos aplica.",
      },
      { titulo: "¡Activa! ✅", texto: "La promo se aplica automáticamente en el POS y en línea." },
    ],
  },
  {
    id: "crear-orden-compra",
    nombre: "Levantar una orden de compra",
    descripcion: "Pídele mercancía a tu proveedor.",
    pasos: [
      {
        seccion: "compras",
        anchor: "nav-compras",
        titulo: "Entra a Compras (OC)",
        texto: "Aquí registras lo que le compras a tus proveedores. Ya te traje a esta sección.",
      },
      {
        anchor: "compra-nuevo",
        titulo: "Nueva orden",
        texto: "Toca el botón. (Ahora te abro el formulario.)",
      },
      {
        abrir: "compra-nuevo",
        anchor: "compra-f-proveedor",
        titulo: "1) El proveedor",
        texto: "Escribe a quién le compras (razón social del proveedor).",
      },
      {
        titulo: "2) Los productos",
        texto: "Agrega los productos con sus cantidades y costos, y guarda la orden.",
      },
      {
        titulo: "Al recibir, entra a inventario ✅",
        texto: "Cuando llegue la mercancía, la marcas como recibida y tu stock sube solo.",
      },
    ],
  },
  {
    id: "crear-automatizacion",
    nombre: "Crear una automatización",
    descripcion: "Mensajes automáticos a tus clientes (WhatsApp, etc.).",
    pasos: [
      {
        seccion: "automatizaciones",
        anchor: "nav-automatizaciones",
        titulo: "Entra a Automatizaciones",
        texto: "Aquí configuras mensajes que se envían solos. Ya te traje a esta sección.",
      },
      {
        anchor: "auto-nuevo",
        titulo: "Crea una",
        texto: "Toca el botón. (Ahora te abro el formulario.)",
      },
      {
        abrir: "auto-nuevo",
        anchor: "auto-f-evento",
        titulo: "1) El disparador",
        texto: "Elige qué la dispara: ej. tras una compra o un carrito abandonado.",
      },
      {
        titulo: "2) El mensaje",
        texto: "Elige la plantilla/campaña que se envía y guárdala.",
      },
      { titulo: "¡Activa! ✅", texto: "A partir de ahí trabaja sola por ti." },
    ],
  },
  {
    id: "registrar-cobro-cxc",
    nombre: "Registrar un pago de cuentas por cobrar",
    descripcion: "Anota cuando un cliente te paga lo que debía.",
    pasos: [
      {
        seccion: "cxc",
        anchor: "nav-cxc",
        titulo: "Entra a Cuentas por cobrar",
        texto: "Aquí ves quién te debe. Ya te traje a esta sección.",
      },
      {
        anchor: "cxc-nuevo",
        titulo: "Registra un pago",
        texto: "Toca el botón. (Ahora te abro el formulario.)",
      },
      {
        abrir: "cxc-nuevo",
        anchor: "cxc-f-cliente",
        titulo: "1) El cliente",
        texto: "Busca y elige al cliente que te pagó.",
      },
      {
        titulo: "2) El monto",
        texto: "Escribe cuánto te pagó; su saldo baja al instante.",
      },
      { titulo: "¡Al día! ✅", texto: "Queda registrado y ves cuánto le falta por pagar." },
    ],
  },
  {
    id: "activar-huella",
    nombre: "Activar entrar con huella",
    descripcion: "Entra sin contraseña, solo con tu huella o Face ID.",
    pasos: [
      {
        seccion: "seguridad",
        anchor: "nav-seguridad",
        titulo: "Entra a Seguridad",
        texto: "Aquí proteges tu cuenta. Ya te traje a esta sección.",
      },
      {
        anchor: "huella-activar",
        titulo: "Activa tu huella",
        texto: "Toca “Activar huella en este dispositivo”.",
      },
      {
        titulo: "Confirma con tu dedo",
        texto: "Tu teléfono te pedirá tu huella o Face ID; confírmalo.",
      },
      {
        titulo: "¡Listo! ✅",
        texto: "La próxima vez que salgas, entrarás con tu huella sin escribir la contraseña.",
      },
    ],
  },
  {
    id: "agregar-tarjeta",
    nombre: "Guardar tu tarjeta de pago",
    descripcion: "Registra la tarjeta con la que se cobra tu plan.",
    pasos: [
      {
        seccion: "suscripcion",
        anchor: "nav-suscripcion",
        titulo: "Entra a Mi suscripción",
        texto: "Aquí está tu plan y tu método de pago. Ya te traje a esta sección.",
      },
      {
        anchor: "tarjeta-agregar",
        titulo: "Agrega tu tarjeta",
        texto: "Toca “+ Agregar tarjeta”.",
      },
      {
        titulo: "Captura tu tarjeta",
        texto: "Ingresa el número, vencimiento y CVC en el campo seguro de Stripe.",
      },
      { titulo: "¡Guardada! ✅", texto: "Tu plan se cobrará automáticamente con esa tarjeta." },
    ],
  },
  ...orientacion([
    [
      "importador",
      "Carga masiva",
      "Descarga la plantilla, llénala con tus productos y súbela para cargarlos todos de una vez.",
    ],
    [
      "etiquetas",
      "Etiquetas y códigos",
      "Elige productos y formato, genera las etiquetas con código de barras e imprímelas.",
    ],
    [
      "inventario-iq",
      "Inteligencia de inventario",
      "Elige un rango de días y revisa qué reponer y qué casi no se vende.",
    ],
    [
      "ventas",
      "Ventas",
      "Consulta el detalle de cada venta. Para cobrar en mostrador usa la app de POS.",
    ],
    [
      "monedero",
      "Monedero y gift cards",
      "Administra el saldo de lealtad de tus clientes y las tarjetas de regalo.",
    ],
    [
      "devoluciones",
      "Devoluciones",
      "Busca la venta y registra la devolución; el producto puede volver a inventario.",
    ],
    [
      "reportes",
      "Reportes",
      "Cambia el rango de fechas y revisa ventas por día, producto y vendedor.",
    ],
    [
      "dashboard",
      "Resumen",
      "Un vistazo rápido a tus números de hoy; profundiza en Reportes cuando quieras.",
    ],
    [
      "tienda",
      "Tienda online",
      "Configura tu tienda web y publica los productos que quieras vender en línea.",
    ],
    [
      "pedidos",
      "Pedidos online",
      "Revisa los pedidos de tu tienda y cambia su estado (preparando, enviado, entregado).",
    ],
    [
      "envios",
      "Envíos",
      "Genera la guía del pedido y elige paquetería; el cliente puede seguir su paquete.",
    ],
    ["resenas", "Reseñas", "Revisa y aprueba las reseñas; las aprobadas se muestran en tu tienda."],
    ["preguntas", "Preguntas", "Responde las dudas que dejan tus compradores en los productos."],
    [
      "cfdi",
      "Facturación (CFDI)",
      "Genera la factura de una venta con los datos fiscales del cliente.",
    ],
    [
      "contabilidad",
      "Contabilidad",
      "Sube o recibe las facturas de tus proveedores, listas para tu contador.",
    ],
    [
      "configuracion",
      "Configuración",
      "Ajusta datos del negocio, sucursales, impuestos e impresión, y guarda.",
    ],
    [
      "portal-b2b",
      "Portal mayorista",
      "Conecta un dominio propio y sigue las instrucciones de DNS para que tus clientes pidan en tu portal con tu marca.",
    ],
  ]),
];

/** Genera recorridos de orientación (2 pasos) para apartados de solo consulta. */
function orientacion(items: [string, string, string][]): TourDef[] {
  return items.map(([seccion, titulo, texto]) => ({
    id: `ver-${seccion}`,
    nombre: titulo,
    descripcion: "Un vistazo rápido a este apartado.",
    pasos: [
      {
        seccion,
        anchor: `nav-${seccion}`,
        titulo,
        texto: "Ya te traje a esta sección.",
      },
      { titulo: "¿Qué haces aquí?", texto },
    ],
  }));
}

export function tourPorId(id: string): TourDef | undefined {
  return TOURS.find((t) => t.id === id);
}

function key(prefix: string, id: string): string {
  return `gaes_tour_${prefix}_${id}`;
}

/** El usuario ya vio (completó o cerró) este tour alguna vez. */
export function tourVisto(id: string): boolean {
  return localStorage.getItem(key("seen", id)) === "1";
}

export function marcarTourVisto(id: string): void {
  localStorage.setItem(key("seen", id), "1");
}

/** El usuario pidió no volver a verlo automáticamente. Se respeta siempre. */
export function tourDeshabilitado(id: string): boolean {
  return localStorage.getItem(key("off", id)) === "1";
}

export function deshabilitarTour(id: string): void {
  localStorage.setItem(key("off", id), "1");
}

/** Lanza un tour bajo demanda (siempre, aunque esté deshabilitado el auto). */
export function lanzarTour(id: string): void {
  window.dispatchEvent(new CustomEvent("gaes-tour", { detail: id }));
}
