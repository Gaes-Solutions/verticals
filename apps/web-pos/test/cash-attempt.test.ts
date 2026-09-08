import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/lib/api.js";
import {
  type CashPayload,
  type CashScope,
  cashStorageKey,
  finishCashAttempt,
  readCashAttempt,
  recoverCashAttempt,
  startCashAttempt,
} from "../src/lib/cash-attempt.js";
vi.mock("../src/lib/api.js", () => ({ api: vi.fn() }));
const request = vi.mocked(api);
const scope: CashScope = { tenantSlug: "a", userId: "u1", cajaId: "c1", sucursalId: "s1" };
const payload: CashPayload = {
  cajaId: "c1",
  sucursalId: "s1",
  canal: "pos",
  lineas: [{ varianteId: "v1", cantidad: "1" }],
  pagos: [{ metodo: "efectivo", monto: "100.00" }],
  expectedTotal: "100.00",
};
const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ready = {
  status: "ready",
  result: { ventaId: "sale", folio: "F1", total: "100.00" },
  ventaEstado: "pagada",
};
let values: Map<string, string>;
beforeEach(() => {
  request.mockReset();
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        _key: string,
        _options: unknown,
        callback: (lock: object | null) => unknown,
      ) => callback({}),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
function saved() {
  values.set(cashStorageKey(scope), JSON.stringify({ key, payload }));
}
describe("durable cash sale", () => {
  it("saves full cash payload before first POST and uses authoritative recovery", async () => {
    request
      .mockResolvedValueOnce({ idempotencyKey: key })
      .mockImplementationOnce(async () => {
        expect(readCashAttempt(scope)).toEqual({ key, payload });
        return { ventaId: "untrusted-post" };
      })
      .mockResolvedValueOnce(ready);
    expect(await startCashAttempt(scope, payload)).toEqual(ready);
    expect(request.mock.calls[1]).toEqual([
      "/t/ventas",
      { body: { ...payload, idempotencyKey: key } },
    ]);
    expect(readCashAttempt(scope)?.key).toBe(key);
  });
  it("ambiguous failure preserves payload and disallows a new attempt", async () => {
    request
      .mockResolvedValueOnce({ idempotencyKey: key })
      .mockRejectedValueOnce(new Error("timeout"));
    await expect(startCashAttempt(scope, payload)).rejects.toThrow("timeout");
    await expect(startCashAttempt(scope, payload)).rejects.toThrow("pendiente");
    expect(request).toHaveBeenCalledTimes(2);
    expect(readCashAttempt(scope)?.payload).toEqual(payload);
  });
  it("not_found never clears pending or creates a new key", async () => {
    saved();
    request.mockResolvedValue({ status: "not_found" });
    expect(await recoverCashAttempt(scope)).toEqual({ status: "not_found" });
    await expect(finishCashAttempt(scope)).rejects.toThrow("resuelto");
    expect(readCashAttempt(scope)?.key).toBe(key);
  });
  it("explicit retry sends identical key/payload only after not_found", async () => {
    saved();
    request
      .mockResolvedValueOnce({ status: "not_found" })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(ready);
    await recoverCashAttempt(scope, "retry");
    expect(request.mock.calls[1]).toEqual([
      "/t/ventas",
      { body: { ...payload, idempotencyKey: key } },
    ]);
  });
  it.each(["processing", "cancelled"])("does not POST retry when status is %s", async (status) => {
    saved();
    request.mockResolvedValue({ status });
    await recoverCashAttempt(scope, "retry");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("cancel asks durable endpoint and only terminal confirmation permits clearing", async () => {
    saved();
    request.mockResolvedValue({ status: "cancelled" });
    await recoverCashAttempt(scope, "cancel");
    expect(readCashAttempt(scope)).not.toBeNull();
    expect(request.mock.calls[0]).toEqual([
      `/t/ventas/intentos/${key}/cancelar`,
      { method: "POST" },
    ]);
    await finishCashAttempt(scope);
    expect(readCashAttempt(scope)).toBeNull();
  });
  it("cancel timeout retains pending and ready preserves current sale state", async () => {
    saved();
    request.mockRejectedValueOnce(new Error("timeout"));
    await expect(recoverCashAttempt(scope, "cancel")).rejects.toThrow();
    request.mockResolvedValueOnce({ ...ready, ventaEstado: "cancelada" });
    expect(await recoverCashAttempt(scope)).toEqual({ ...ready, ventaEstado: "cancelada" });
    expect(readCashAttempt(scope)).not.toBeNull();
  });
  it("isolates tenant, user and register", () => {
    saved();
    for (const change of [{ tenantSlug: "b" }, { userId: "u2" }, { cajaId: "c2" }])
      expect(readCashAttempt({ ...scope, ...change })).toBeNull();
  });
  it("fails closed without Web Locks and when another tab owns the lock", async () => {
    vi.stubGlobal("navigator", {});
    await expect(startCashAttempt(scope, payload)).rejects.toThrow("Web Locks");
    vi.stubGlobal("navigator", {
      locks: {
        request: async (_key: string, _options: unknown, callback: (lock: null) => unknown) =>
          callback(null),
      },
    });
    await expect(startCashAttempt(scope, payload)).rejects.toThrow("Otra pestaña");
    expect(request).not.toHaveBeenCalled();
  });
  it("storage failure stops before sale POST", async () => {
    request.mockResolvedValueOnce({ idempotencyKey: key });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    });
    await expect(startCashAttempt(scope, payload)).rejects.toThrow("quota");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("sale total reconciliation", () => {
  it.each(["", " ", "-100", "NaN", "99.99", "100.001", "1e2"])(
    "does not unlock or accept ready with total %s",
    async (total) => {
      saved();
      request.mockResolvedValue({ ...ready, result: { ...ready.result, total } });
      await expect(recoverCashAttempt(scope)).rejects.toThrow("verificar");
      await expect(finishCashAttempt(scope)).rejects.toThrow("verificar");
      expect(readCashAttempt(scope)?.key).toBe(key);
    },
  );
  it("accepts equivalent valid decimal totals only", async () => {
    saved();
    request.mockResolvedValue({ ...ready, result: { ...ready.result, total: "100" } });
    await finishCashAttempt(scope);
    expect(readCashAttempt(scope)).toBeNull();
  });
});
