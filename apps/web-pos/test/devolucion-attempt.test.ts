import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/lib/api.js";
import {
  loadRefundScope,
  readRefundAttempt,
  recoverRefundAttempt,
  refundStorageKey,
  startRefundAttempt,
} from "../src/lib/devolucion-attempt.js";
import type { DevolucionInput } from "../src/lib/devolucion-safe.js";
vi.mock("../src/lib/api.js", async (original) => ({
  ...(await original<typeof import("../src/lib/api.js")>()),
  api: vi.fn(),
}));
const request = vi.mocked(api);
const data = new Map<string, string>();
const scope = { tenantSlug: "shop", userId: "staff" };
const payload: DevolucionInput = {
  motivo: "defectuoso",
  metodoReembolso: "efectivo",
  cajaId: "cash",
  lineas: [{ ventaLineaId: "l", cantidadDevuelta: "1", reponeStock: true }],
};
const input = { ventaId: "sale", folio: "F1", payload };
const result = { devolucionId: "refund", folio: "D1", totalDevuelto: "10.00" };
const key = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  request.mockReset();
  data.clear();
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => key) });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => data.set(k, v)),
    removeItem: vi.fn((k: string) => data.delete(k)),
  });
  vi.stubGlobal("navigator", {
    locks: {
      request: vi.fn(async (_key: string, _opts: unknown, fn: (lock: object | null) => unknown) =>
        fn({}),
      ),
    },
  });
});
async function pending() {
  request.mockRejectedValueOnce(new Error("timeout"));
  await expect(startRefundAttempt(scope, input, () => true)).rejects.toThrow("timeout");
}
describe("devolución durable", () => {
  it("persiste UUID payload antesPOST y verifica resultado porGET", async () => {
    request
      .mockImplementationOnce(async (_path, opts) => {
        expect(readRefundAttempt(scope)?.key).toBe(key);
        expect(opts?.body).toEqual({ ...payload, idempotencyKey: key });
        return result;
      })
      .mockResolvedValueOnce({ status: "ready", result });
    expect(await startRefundAttempt(scope, input, () => true)).toEqual({ status: "ready", result });
    expect(data.size).toBe(0);
  });
  it("requiere identidad confirmada API con tenant y usuario", async () => {
    request.mockResolvedValueOnce({ id: "staff", tenantSlug: "shop" });
    expect(await loadRefundScope()).toEqual(scope);
    request.mockResolvedValueOnce({ id: "staff" });
    await expect(loadRefundScope()).rejects.toThrow("identidad");
  });
  it("storage falla y no envía", async () => {
    vi.mocked(localStorage.setItem).mockImplementationOnce(() => {
      throw new Error("storage");
    });
    await expect(startRefundAttempt(scope, input, () => true)).rejects.toThrow("storage");
    expect(request).not.toHaveBeenCalled();
  });
  it("sin WebLocks bloquea escritura", async () => {
    vi.stubGlobal("navigator", {});
    await expect(startRefundAttempt(scope, input, () => true)).rejects.toThrow("Web Locks");
    expect(request).not.toHaveBeenCalled();
  });
  it("otra pestaña retiene lock y no duplica", async () => {
    vi.stubGlobal("navigator", {
      locks: { request: async (_k: string, _o: unknown, fn: (lock: null) => unknown) => fn(null) },
    });
    await expect(startRefundAttempt(scope, input, () => true)).rejects.toThrow("Otra pestaña");
    expect(request).not.toHaveBeenCalled();
  });
  it("timeout persiste y otroinicio no crea nuevoUUID", async () => {
    await pending();
    await expect(startRefundAttempt(scope, input, () => true)).rejects.toThrow("pendiente");
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("not_found no libera ni repite envío automáticamente", async () => {
    await pending();
    request.mockResolvedValueOnce({ status: "not_found" });
    expect((await recoverRefundAttempt(scope, () => true)).status).toBe("not_found");
    expect(readRefundAttempt(scope)?.key).toBe(key);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("reenvío explícito usa misma clave y payload exactos", async () => {
    await pending();
    request
      .mockResolvedValueOnce({ status: "not_found" })
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce({ status: "ready", result });
    await recoverRefundAttempt(scope, () => true, "retry");
    expect(request.mock.calls[2]?.[1]?.body).toEqual({ ...payload, idempotencyKey: key });
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
  it("processing no reenvía ni libera", async () => {
    await pending();
    request.mockResolvedValueOnce({ status: "processing" });
    await recoverRefundAttempt(scope, () => true, "retry");
    expect(data.size).toBe(1);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("cancelled sólo cancela intento y libera marca", async () => {
    await pending();
    request.mockResolvedValueOnce({ status: "cancelled" });
    await recoverRefundAttempt(scope, () => true, "cancel");
    expect(request.mock.calls[1]?.[0]).toBe(`/t/devoluciones/intentos/${key}/cancelar`);
    expect(data.size).toBe(0);
  });
  it("cancelación recibe ready y recupera devolución existente", async () => {
    await pending();
    request.mockResolvedValueOnce({ status: "ready", result });
    expect((await recoverRefundAttempt(scope, () => true, "cancel")).status).toBe("ready");
    expect(data.size).toBe(0);
  });
  it("respuesta malformada o fallo cancelación conserva registro", async () => {
    await pending();
    request.mockResolvedValueOnce({ status: "ready", result: { devolucionId: "r" } });
    await expect(recoverRefundAttempt(scope, () => true)).rejects.toThrow("incompleto");
    expect(data.size).toBe(1);
    request.mockRejectedValueOnce(new Error("red"));
    await expect(recoverRefundAttempt(scope, () => true, "cancel")).rejects.toThrow("red");
    expect(data.size).toBe(1);
  });
  it("cambio sesión no iniciaPOST", async () => {
    await expect(startRefundAttempt(scope, input, () => false)).rejects.toThrow("sesión");
    expect(request).not.toHaveBeenCalled();
  });
  it("marca de otra tienda/usuario no comparte recovery", async () => {
    await pending();
    expect(readRefundAttempt({ ...scope, tenantSlug: "other" })).toBeNull();
    expect(readRefundAttempt({ ...scope, userId: "other" })).toBeNull();
  });
  it("registro legado malformado permanece bloqueado", async () => {
    data.set(refundStorageKey(scope), "pendiente");
    await expect(startRefundAttempt(scope, input, () => true)).rejects.toThrow();
    expect(data.size).toBe(1);
    expect(request).not.toHaveBeenCalled();
  });
});
