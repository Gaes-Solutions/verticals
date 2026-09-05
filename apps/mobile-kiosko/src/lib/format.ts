const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function money(v: number | string): string {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return mxn.format(Number.isFinite(n) ? n : 0);
}

export function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-MX");
}
