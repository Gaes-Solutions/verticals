"use client";

export interface VistoReciente {
  slugSeo: string;
  titulo: string;
  imagen?: string;
  precio: string;
}

const KEY = "gaespos_vistos";
const MAX = 12;

export function leerVistos(): VistoReciente[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Registra un producto como visto (más reciente primero, sin duplicados). */
export function registrarVisto(v: VistoReciente): void {
  if (typeof window === "undefined") return;
  const previos = leerVistos().filter((p) => p.slugSeo !== v.slugSeo);
  localStorage.setItem(KEY, JSON.stringify([v, ...previos].slice(0, MAX)));
}
