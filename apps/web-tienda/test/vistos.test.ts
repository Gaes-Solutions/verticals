import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VISTOS_CAMBIADOS,
  VISTOS_KEY,
  leerVistos,
  leerVistosGuardados,
  registrarVisto,
} from "../src/lib/vistos";

const product = { slugSeo: "lampara-qa", titulo: "Lámpara", precio: "509.00", imagen: "/foto.jpg" };
let storage: Map<string, string>;
let get: ReturnType<typeof vi.fn>;
let set: ReturnType<typeof vi.fn>;
let saved: ReturnType<typeof vi.fn>;
beforeEach(() => {
  storage = new Map();
  get = vi.fn((key: string) => storage.get(key) ?? null);
  set = vi.fn((key: string, value: string) => storage.set(key, value));
  const win = new EventTarget();
  saved = vi.fn();
  win.addEventListener(VISTOS_CAMBIADOS, saved);
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", { getItem: get, setItem: set });
});
afterEach(() => vi.unstubAllGlobals());
describe("optional product history cannot interrupt shopping", () => {
  it.each([null, "{", "null", "{}", '"text"', "42", "[null,2,false,{},[]]"])(
    "ignores malformed or incorrectly shaped storage %s",
    (raw) => {
      expect(leerVistosGuardados(raw)).toEqual([]);
    },
  );
  it.each(["", " ", "-1", "NaN", "Infinity", "1e2", "0x20", "1000000000000", "1.123456789"])(
    "never turns an invalid saved price %s into a quote",
    (precio) => {
      expect(leerVistosGuardados(JSON.stringify([{ ...product, precio }]))).toEqual([]);
    },
  );
  it.each(["../checkout", "bad/slug", "a?x=1", "#hash", " "])(
    "rejects a saved link outside the product slug grammar %s",
    (slugSeo) => {
      expect(leerVistosGuardados(JSON.stringify([{ ...product, slugSeo }]))).toEqual([]);
    },
  );
  it("keeps the newest twelve unique products and sanitizes unknown fields", () => {
    const data = [
      { ...product, titulo: " Lámpara nueva ", extra: "ignored" },
      { ...product, titulo: "Old" },
      ...Array.from({ length: 20 }, (_, i) => ({ ...product, slugSeo: `qa-${i}` })),
    ];
    const result = leerVistosGuardados(JSON.stringify(data));
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual({ ...product, titulo: "Lámpara nueva" });
    expect(result.at(-1)?.slugSeo).toBe("qa-10");
  });
  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,aaa",
    "//outside.test/img",
    "/\\outside.test/img",
    "/a\nb",
  ])("drops an unsafe image but preserves the valid product %s", (imagen) => {
    const { imagen: _, ...withoutImage } = product;
    expect(leerVistosGuardados(JSON.stringify([{ ...product, imagen }]))).toEqual([withoutImage]);
  });
  it("bounds storage size and text without breaking valid remaining entries", () => {
    expect(leerVistosGuardados(" ".repeat(100001))).toEqual([]);
    expect(
      leerVistosGuardados(JSON.stringify([{ ...product, titulo: "a".repeat(301) }, product])),
    ).toEqual([product]);
  });
  it("moves a revisited product to the front and updates its saved display price", () => {
    registrarVisto(product);
    registrarVisto({ ...product, slugSeo: "other" });
    registrarVisto({ ...product, precio: "600.00" });
    expect(leerVistos().map((p) => [p.slugSeo, p.precio])).toEqual([
      [product.slugSeo, "600.00"],
      ["other", "509.00"],
    ]);
    expect(saved).toHaveBeenCalledTimes(3);
  });
  it("does not overwrite unreadable previous history or emit false success", () => {
    get.mockImplementation(() => {
      throw Error("PRIVATE_READ");
    });
    expect(leerVistos()).toEqual([]);
    expect(() => registrarVisto(product)).not.toThrow();
    expect(set).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });
  it("contains quota and permission errors without emitting a false update", () => {
    storage.set(VISTOS_KEY, JSON.stringify([product]));
    set.mockImplementation(() => {
      throw Error("PRIVATE_QUOTA");
    });
    expect(() => registrarVisto({ ...product, slugSeo: "new" })).not.toThrow();
    expect(storage.get(VISTOS_KEY)).toBe(JSON.stringify([product]));
    expect(saved).not.toHaveBeenCalled();
  });
  it("does not touch storage for invalid current data or during server rendering", () => {
    registrarVisto({ ...product, precio: "NaN" });
    expect(get).not.toHaveBeenCalled();
    vi.stubGlobal("window", undefined);
    expect(leerVistos()).toEqual([]);
    expect(() => registrarVisto(product)).not.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});
