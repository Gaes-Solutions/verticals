import { api } from "@/lib/api";
import { ApiError } from "@gaespos/api-client";

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

async function requestKiosk<T>(path: string, token?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const result = await api.get<T>(path, {
      signal: controller.signal,
      ...(token ? { token } : {}),
    });
    if (result === null || typeof result !== "object") throw new Error("Respuesta inválida");
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function validSeconds(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
async function requestConfig(token?: string): Promise<KioskoConfig> {
  const value = await requestKiosk<KioskoConfig>("/kiosko/config", token);
  const valid = [
    validSeconds(value.reposoSegundos, 5, 600),
    validSeconds(value.precioSegundos, 2, 60),
    validSeconds(value.slideSegundos, 2, 60),
    ["promociones", "destacados", "ambos"].includes(value.contenidoReposo),
    typeof value.mostrarExistencia === "boolean",
    typeof value.sonidoBeep === "boolean",
    typeof value.mensajeBienvenida === "string" && value.mensajeBienvenida.length <= 120,
    typeof value.colorAcento === "string" && /^#[0-9a-f]{6}$/i.test(value.colorAcento),
    ["es", "en"].includes(value.idioma),
  ].every(Boolean);
  if (!valid) throw new Error("Configuración inválida");
  return value;
}
export const getKioskoConfig = () => requestConfig();
export const getPrecio = async (codigo: string) => {
  const result = await requestKiosk<PrecioKiosko>(
    `/kiosko/precio/${encodeURIComponent(codigo)}`,
  ).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404)
      return { encontrado: false } as PrecioKiosko;
    throw error;
  });
  if (typeof result.encontrado !== "boolean") throw new Error("Respuesta inválida");
  if (
    result.encontrado &&
    (typeof result.precioVigente !== "string" ||
      !/^\d+(?:\.\d{1,6})?$/.test(result.precioVigente) ||
      !Number.isFinite(Number(result.precioVigente)))
  )
    throw new Error("Precio inválido");
  return result;
};
export const getIdle = async () => {
  const result = await requestKiosk<{ slides: IdleSlide[] }>("/kiosko/idle");
  if (
    !Array.isArray(result.slides) ||
    result.slides.some(
      (slide) =>
        !slide ||
        typeof slide.tipo !== "string" ||
        typeof slide.titulo !== "string" ||
        (slide.imagen !== null && typeof slide.imagen !== "string") ||
        (slide.texto !== undefined && typeof slide.texto !== "string"),
    )
  )
    throw new Error("Anuncios inválidos");
  return result;
};
export const validateKioskoToken = (token: string) => requestConfig(token);
