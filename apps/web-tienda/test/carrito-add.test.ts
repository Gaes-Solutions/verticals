import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AdicionCarrito,
  agregar,
  configurarCarrito,
  leerCarrito,
  recibirCarrito,
} from "../src/lib/carrito-store";
let storage: Map<string, string>;
let events: AdicionCarrito[];
const row = {
  varianteId: "qa-v",
  titulo: "Actual",
  precio: "10.00",
  cantidad: 0.1,
  imagenUrl: "/before",
};
beforeEach(() => {
  storage = new Map();
  events = [];
  const win = new EventTarget();
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
  configurarCarrito(null, null);
  win.addEventListener("carrito-agregado", (e) =>
    events.push((e as CustomEvent<AdicionCarrito>).detail),
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("cart additions are bounded, exact and supply an undo snapshot", () => {
  it("updates a product price, rounds fractional addition exactly and preserves earlier metadata for undo", () => {
    recibirCarrito([row]);
    agregar({ ...row, precio: "12.00", cantidad: 0.2 });
    expect(leerCarrito()).toEqual([{ ...row, precio: "12.00", cantidad: 0.3 }]);
    expect(events).toEqual([
      {
        ...row,
        precio: "12.00",
        cantidad: 0.2,
        owner: null,
        antes: [row],
        despues: [{ ...row, precio: "12.00", cantidad: 0.3 }],
      },
    ]);
  });
  it("does not mutate the caller line or the before snapshot when another product is added", () => {
    const input = { ...row };
    agregar(input);
    input.cantidad = 99;
    expect(events[0].despues[0].cantidad).toBe(0.1);
    expect(leerCarrito()[0].cantidad).toBe(0.1);
  });
  it("never silently drops a 101st line", () => {
    const current = Array.from({ length: 100 }, (_, i) => ({ ...row, varianteId: `qa-${i}` }));
    recibirCarrito(current);
    expect(() => agregar(row)).toThrow();
    expect(leerCarrito()).toEqual(current);
    expect(events).toEqual([]);
  });
  it("does not overflow or overwrite the previous amount when the cart already has 100000 units", () => {
    recibirCarrito([{ ...row, cantidad: 100000 }]);
    expect(() => agregar({ ...row, cantidad: 1 })).toThrow();
    expect(leerCarrito()[0].cantidad).toBe(100000);
    expect(events).toEqual([]);
  });
  it.each([0, -1, 0.0001, Number.NaN, Number.POSITIVE_INFINITY, 100001])(
    "rejects invalid added quantity %s before any write",
    (cantidad) => {
      recibirCarrito([row]);
      expect(() => agregar({ ...row, cantidad })).toThrow();
      expect(leerCarrito()).toEqual([row]);
      expect(events).toEqual([]);
    },
  );
  it.each(["", " ", "NaN", "Infinity", "-1"])(
    "rejects invalid price %s without losing the old line",
    (precio) => {
      recibirCarrito([row]);
      expect(() => agregar({ ...row, precio })).toThrow();
      expect(leerCarrito()).toEqual([row]);
      expect(events).toEqual([]);
    },
  );
  it("binds the receipt to the account before an edit callback changes context", () => {
    const a = JSON.stringify(["qa", "a"]);
    const b = JSON.stringify(["qa", "b"]);
    configurarCarrito(a, () => configurarCarrito(b, null));
    agregar(row);
    expect(events[0].owner).toBe(a);
    expect(leerCarrito()).toEqual([]);
  });
});
