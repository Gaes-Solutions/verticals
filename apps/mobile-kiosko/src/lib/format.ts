const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function money(v: number | string | null | undefined): string {
  if (typeof v !== "number" && typeof v !== "string") return "Precio no disponible";
  if (typeof v === "string" && !/^-?\d+(?:\.\d+)?$/.test(v.trim())) return "Precio no disponible";
  const n = Number(v);
  return Number.isFinite(n) ? mxn.format(n) : "Precio no disponible";
}

export function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-MX");
}
