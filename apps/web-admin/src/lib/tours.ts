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
