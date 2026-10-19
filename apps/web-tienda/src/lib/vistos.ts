"use client";

export interface VistoReciente {
  slugSeo: string;
  titulo: string;
  imagen?: string;
  precio: string;
}

export const VISTOS_KEY = "gaespos_vistos";
export const VISTOS_CAMBIADOS = "vistos-actualizados";
const MAX = 12;

function imagenVista(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length <= 2048 &&
    !/[\s\\]/.test(value) &&
    (/^\/(?!\/)/.test(value) || /^https?:\/\//.test(value))
    ? value
    : undefined;
}

/** Browser history is optional, bounded and untrusted, including valid JSON of the wrong shape. */
export function leerVistosGuardados(raw: string | null): VistoReciente[] {
  try {
    if (!raw || raw.length > 100_000) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const result: VistoReciente[] = [];
    const slugs = new Set<string>();
    for (const item of value) {
      if (
        !item ||
        typeof item.slugSeo !== "string" ||
        !/^[A-Za-z0-9_-]{1,200}$/.test(item.slugSeo) ||
        slugs.has(item.slugSeo) ||
        typeof item.titulo !== "string" ||
        !item.titulo.trim() ||
        item.titulo.length > 300 ||
        typeof item.precio !== "string" ||
        !/^\d{1,12}(?:\.\d{1,8})?$/.test(item.precio)
      )
        continue;
      const imagen = imagenVista(item.imagen);
      slugs.add(item.slugSeo);
      result.push({
        slugSeo: item.slugSeo,
        titulo: item.titulo.trim(),
        precio: item.precio,
        ...(imagen ? { imagen } : {}),
      });
      if (result.length === MAX) break;
    }
    return result;
  } catch {
    return [];
  }
}

export function leerVistos(): VistoReciente[] {
  if (typeof window === "undefined") return [];
  try {
    return leerVistosGuardados(localStorage.getItem(VISTOS_KEY));
  } catch {
    return [];
  }
}

/** Registra un producto como visto (más reciente primero, sin duplicados). */
export function registrarVisto(v: VistoReciente): void {
  if (typeof window === "undefined") return;
  try {
    const actual = leerVistosGuardados(JSON.stringify([v]))[0];
    if (!actual) return;
    const previos = leerVistosGuardados(localStorage.getItem(VISTOS_KEY)).filter(
      (p) => p.slugSeo !== actual.slugSeo,
    );
    localStorage.setItem(VISTOS_KEY, JSON.stringify([actual, ...previos].slice(0, MAX)));
    window.dispatchEvent(new Event(VISTOS_CAMBIADOS));
  } catch {
    // A recommendation must never interrupt browsing or replace an unreadable history.
  }
}
