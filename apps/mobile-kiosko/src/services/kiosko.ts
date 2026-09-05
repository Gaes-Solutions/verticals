import { api } from "@/lib/api";

export interface KioskoConfig {
  reposoSegundos: number;
  precioSegundos: number;
  contenidoReposo: "promociones" | "destacados" | "ambos";
  slideSegundos: number;
  mostrarExistencia: boolean;
  sonidoBeep: boolean;
  mensajeBienvenida: string;
  colorAcento: string;
  idioma: "es" | "en";
}

export interface PrecioKiosko {
  encontrado: boolean;
  nombre?: string;
  imagen?: string | null;
  sku?: string;
  precioVigente?: string;
  precioAntes?: string | null;
  promoLabel?: string | null;
  existencia?: string | null;
}

export interface IdleSlide {
  tipo: string;
  titulo: string;
  imagen: string | null;
  texto?: string;
}

export const getKioskoConfig = () => api.get<KioskoConfig>("/kiosko/config");
export const getPrecio = (codigo: string) =>
  api.get<PrecioKiosko>(`/kiosko/precio/${encodeURIComponent(codigo)}`);
export const getIdle = () => api.get<{ slides: IdleSlide[] }>("/kiosko/idle");
