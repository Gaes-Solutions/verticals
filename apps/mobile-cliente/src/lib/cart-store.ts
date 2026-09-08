import { create } from "zustand";
import type { ServerCart } from "../services/comercio";

export interface CartLine {
  varianteId: string;
  cantidad: number;
}
export function accountCartKey(tenant: string, customer: string): string {
  return JSON.stringify([tenant, customer]);
}
export function validQuantity(value: string | number): number | null {
  const normalized = typeof value === "string" ? value.trim().replace(",", ".") : value;
  if (typeof normalized === "string" && !/^\d+(\.\d{1,3})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 100000 &&
    Math.abs(Math.round(amount * 1000) - amount * 1000) < 0.0000001
    ? amount
    : null;
}
export function replaceQuantity(lines: CartLine[], variant: string, quantity: number): CartLine[] {
  if (quantity === 0) return lines.filter((line) => line.varianteId !== variant);
  if (validQuantity(quantity) === null)
    throw new Error("Usa una cantidad entre 0.001 y 100000, con hasta tres decimales.");
  const rest = lines.filter((line) => line.varianteId !== variant);
  if (rest.length >= 100) throw new Error("El carrito admite hasta 100 artículos diferentes.");
  return [...rest, { varianteId: variant, cantidad: quantity }];
}
interface CartState {
  owner: string | null;
  lines: CartLine[];
  cartId: string | null;
  coupon: string;
  setCoupon: (coupon: string) => void;
  names: Record<string, string>;
  revision: number;
  scopeVersion: number;
  ready: boolean;
  busy: boolean;
  sync: "loading" | "dirty" | "saving" | "saved" | "error";
  syncError: string | null;
  quote: ServerCart | null;
  begin: (owner: string) => void;
  hydrate: (owner: string, revision: number, cart: ServerCart | null) => void;
  saved: (owner: string, revision: number, cart: ServerCart | null) => void;
  failed: (owner: string, message: string) => void;
  retry: () => void;

  change: (owner: string, variant: string, quantity: number) => void;
  add: (owner: string, variant: string, quantity: number, name?: string) => void;
  clear: () => void;
}
export const useCart = create<CartState>((set, get) => ({
  owner: null,
  lines: [],
  cartId: null,
  coupon: "",
  setCoupon: (coupon) => {
    const normalized = coupon.trim();
    if (normalized.length > 80) throw new Error("El cupón admite hasta 80 caracteres.");
    set({
      coupon: normalized,
      revision: get().revision + 1,
      sync: "dirty",
      syncError: null,
      quote: null,
    });
  },
  names: {},
  revision: 0,
  scopeVersion: 0,
  ready: false,
  busy: false,
  sync: "loading",
  syncError: null,
  quote: null,
  begin: (owner) => {
    if (get().owner === owner) return;
    set({
      owner,
      scopeVersion: get().scopeVersion + 1,
      lines: [],
      names: {},
      cartId: null,
      coupon: "",
      revision: get().revision + 1,
      ready: false,
      busy: false,
      sync: "loading",
      syncError: null,
      quote: null,
    });
  },
  hydrate: (owner, revision, cart) => {
    const current = get();
    if (current.owner !== owner) return;
    if (current.revision !== revision) {
      set({ ready: true });
      return;
    }
    set({
      ready: true,
      sync: "saved",
      syncError: null,
      cartId: cart?.id ?? null,
      coupon: cart?.cuponCodigo ?? "",
      lines:
        cart?.items.map((line) => ({
          varianteId: line.varianteId,
          cantidad: Number(line.cantidad),
        })) ?? [],
      names: Object.fromEntries(cart?.items.map((line) => [line.varianteId, line.nombre]) ?? []),
      quote: cart,
    });
  },
  saved: (owner, revision, cart) => {
    const current = get();
    if (current.owner !== owner) return;
    set({ busy: false, syncError: null, cartId: cart?.id ?? null });
    if (current.revision !== revision) {
      set({ sync: "dirty", quote: null });
      return;
    }
    set({ sync: "saved", quote: cart });
  },
  failed: (owner, message) => {
    if (get().owner === owner)
      set({ ready: true, busy: false, sync: "error", syncError: message, quote: null });
  },
  retry: () => set({ sync: "dirty", syncError: null, quote: null }),
  change: (owner, variant, quantity) => {
    const current = get();
    const same = current.owner === owner;
    set({
      owner,
      names: same ? current.names : {},
      coupon: same ? current.coupon : "",
      lines: replaceQuantity(same ? current.lines : [], variant, quantity),
      cartId: same ? current.cartId : null,
      revision: current.revision + 1,
      sync: "dirty",
      syncError: null,
      quote: null,
    });
  },
  add: (owner, variant, quantity, name) => {
    if (validQuantity(quantity) === null) throw new Error("Cantidad inválida");
    const current = get();
    const previous =
      current.owner === owner
        ? (current.lines.find((line) => line.varianteId === variant)?.cantidad ?? 0)
        : 0;
    current.change(owner, variant, Math.round((previous + quantity) * 1000) / 1000);
    if (name) set({ names: { ...get().names, [variant]: name } });
  },
  clear: () =>
    set({
      owner: null,
      scopeVersion: get().scopeVersion + 1,
      lines: [],
      cartId: null,
      coupon: "",
      names: {},
      revision: get().revision + 1,
      ready: false,
      busy: false,
      sync: "loading",
      syncError: null,
      quote: null,
    }),
}));
