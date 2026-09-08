import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeAttempt, prepareAttempt, submitAttempt } from "../src/lib/checkout-attempt";

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  let queue = Promise.resolve<unknown>(undefined);
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, fn: () => unknown) => {
        const next = queue.then(fn);
        queue = next.catch(() => {});
        return next;
      },
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

describe("persistencia de intento sin secretos de pago", () => {
  it("dos pestañas reservan la misma clave y solo una puede iniciar el POST", async () => {
    const [a, b] = await Promise.all([prepareAttempt("owner-a"), prepareAttempt("owner-a")]);
    expect(a.key).toBe(b.key);
    expect(await Promise.all([submitAttempt(a), submitAttempt(b)])).toEqual([true, false]);
    expect(await prepareAttempt("owner-a")).toEqual({ ...a, submitted: true });
  });
  it("tras fallo ambiguo/recarga conserva clave y no autoriza otro POST", async () => {
    const a = await prepareAttempt("owner-a");
    await submitAttempt(a);
    const restored = await prepareAttempt("owner-a");
    expect(restored.key).toBe(a.key);
    expect(await submitAttempt(restored)).toBe(false);
    expect(Object.keys(JSON.parse([...values.values()][0] ?? "{}"))).toEqual([
      "context",
      "key",
      "submitted",
    ]);
  });
  it("cambio de cookie o identidad no borra intento enviado ni permite nuevo pago", async () => {
    const a = await prepareAttempt("owner-a");
    await submitAttempt(a);
    await expect(prepareAttempt("owner-b")).rejects.toThrow("No vuelvas a pagar");
    expect((await prepareAttempt("owner-a")).key).toBe(a.key);
  });
  it("nuevo intento solo queda disponible después de cierre confirmado y limpieza de carrito", async () => {
    const a = await prepareAttempt("owner-a");
    await submitAttempt(a);
    const clear = vi.fn();
    await completeAttempt(a, clear);
    expect(clear).toHaveBeenCalledOnce();
    expect((await prepareAttempt("owner-a")).key).not.toBe(a.key);
  });
  it("sin Web Locks falla cerrado antes de guardar clave", async () => {
    vi.stubGlobal("navigator", {});
    await expect(prepareAttempt("owner-a")).rejects.toThrow("navegador");
    expect(values.size).toBe(0);
  });
});
