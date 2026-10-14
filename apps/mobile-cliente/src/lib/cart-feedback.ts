import type { CartEdit, CartLine } from "./cart-store";
export function cartCount(lines: CartLine[]): number {
  return Math.round(lines.reduce((n, line) => n + line.cantidad, 0) * 1000) / 1000;
}
export function cartMessage(edit: CartEdit & { kind: "change" | "undo" }, name: string): string {
  if (edit.kind === "undo") return `Deshiciste el cambio · ${name}`;
  const delta = Math.round((edit.after - edit.before) * 1000) / 1000;
  if (delta > 0) return `Agregaste ${delta} × ${name}`;
  if (edit.after === 0) return `Quitaste ${name} del carrito`;
  return `Ahora tienes ${edit.after} × ${name}`;
}
