export interface TourStep {
  /** Sección a la que navegar antes de este paso (dispara "gaes-nav"). */
  seccion?: string;
  /** data-tour del elemento a resaltar. Si falta, el paso solo muestra texto. */
  anchor?: string;
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
        texto: "Toca “+ Nuevo producto” para abrir el formulario.",
      },
      {
        titulo: "Llena lo básico",
        texto:
          "Nombre, precio y (si usas código de barras) su clave. Con eso ya puedes vender; el resto es opcional.",
      },
      {
        titulo: "¡Y guardas! ✅",
        texto: "Al guardar, tu producto queda listo para venderse en el POS y en línea.",
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
        texto: "Toca “+ Entrada de inventario” para sumar mercancía que llegó.",
      },
      {
        titulo: "Elige producto y cantidad",
        texto:
          "Busca el producto, escribe cuántas piezas entraron y, si quieres, el motivo (compra, ajuste…).",
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
        texto: "Toca “+ Nuevo usuario”.",
      },
      {
        titulo: "Sus datos y su rol",
        texto:
          "Pon su nombre, correo y una contraseña, y elige su rol. El sistema solo le mostrará lo que su rol permite.",
      },
      { titulo: "¡Listo! ✅", texto: "Ya puede entrar con su correo y contraseña." },
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
      { anchor: "cli-nuevo", titulo: "Agrega un cliente", texto: "Toca “+ Nuevo cliente”." },
      {
        titulo: "Sus datos fiscales",
        texto:
          "Razón social, RFC y régimen fiscal son obligatorios. Puedes fijarle su lista de precios y días de crédito.",
      },
      { titulo: "¡Listo! ✅", texto: "Ya puedes venderle con sus precios y condiciones." },
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
      { anchor: "precio-nuevo", titulo: "Crea una lista", texto: "Toca “+ Nueva lista”." },
      {
        titulo: "Nómbrala y define su tipo",
        texto: "Ej. “Mayoreo”. Luego le pones el precio especial a cada producto que quieras.",
      },
      { titulo: "¡Lista! ✅", texto: "Asígnala a tus clientes de mayoreo y listo." },
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
      { anchor: "com-nuevo", titulo: "Crea una regla", texto: "Toca “+ Nueva regla”." },
      {
        titulo: "El porcentaje y sobre qué",
        texto: "Ej. 5% sobre la venta. Puedes limitarla a una categoría o producto.",
      },
      {
        titulo: "¡Listo! ✅",
        texto: "El vendedor gana su comisión automáticamente en cada venta.",
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
      { anchor: "cobro-nuevo", titulo: "Crea un cobro", texto: "Toca “+ Nuevo cobro”." },
      {
        titulo: "Monto y concepto",
        texto: "Escribe cuánto y por qué. Se genera un link que le mandas a tu cliente.",
      },
      { titulo: "¡Listo! ✅", texto: "Cuando pague, tú te enteras y queda registrado." },
    ],
  },
];

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
