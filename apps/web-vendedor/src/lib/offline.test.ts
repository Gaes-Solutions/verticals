import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, OfflineError, api } from "./api.js";
import { encolarPedido, leerCola, subirCola } from "./offline.js";

vi.mock("./api.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api.js")>()),
  api: vi.fn(),
}));

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.mocked(api).mockReset();
  for (const name of ["First", "Second"]) {
    encolarPedido({ clienteNombre: name, payload: { notas: name }, total: "100" });
  }
});

afterEach(() => vi.unstubAllGlobals());

describe("pending order recovery", () => {
  it.each([
    new OfflineError(),
    new SyntaxError("Invalid JSON"),
    ...[401, 403, 408, 425, 429, 500, 502, 503, 504].map(
      (status) => new ApiError(status, `HTTP ${status}`),
    ),
  ])("preserves the queue after %s and retries in order", async (error) => {
    const original = leerCola();
    vi.mocked(api).mockRejectedValueOnce(error);

    expect(await subirCola()).toEqual({ subidos: 0, rechazados: [] });
    expect(leerCola()).toEqual(original);
    expect(api).toHaveBeenCalledTimes(1);

    vi.mocked(api).mockResolvedValue({});
    expect(await subirCola()).toEqual({ subidos: 2, rechazados: [] });
    expect(leerCola()).toEqual([]);
    expect(api).toHaveBeenNthCalledWith(2, "/t/pedidos", { body: original[0]?.payload });
    expect(api).toHaveBeenNthCalledWith(3, "/t/pedidos", { body: original[1]?.payload });
  });

  it("keeps only unsent orders when the server fails mid-batch", async () => {
    const remaining = leerCola().slice(1);
    vi.mocked(api).mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(503, "Busy"));

    expect(await subirCola()).toEqual({ subidos: 1, rechazados: [] });
    expect(leerCola()).toEqual(remaining);
  });

  it("reports a business rejection and continues with the next order", async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiError(400, "Invalid order"))
      .mockResolvedValueOnce({});

    expect(await subirCola()).toEqual({
      subidos: 1,
      rechazados: [{ clienteNombre: "First", motivo: "Invalid order" }],
    });
    expect(leerCola()).toEqual([]);
  });
});

describe("orders added during an upload", () => {
  it.each([null, new ApiError(503, "Busy"), new ApiError(400, "Invalid order")])(
    "preserves newly queued orders when the in-flight request ends with %s",
    async (error) => {
      let finish!: () => void;
      const waiting = new Promise<void>((resolve) => {
        finish = resolve;
      });
      vi.mocked(api)
        .mockImplementationOnce(async () => {
          await waiting;
          if (error) throw error;
          return {};
        })
        .mockResolvedValue({});
      const original = leerCola();
      const upload = subirCola();
      encolarPedido({ clienteNombre: "New", payload: { notas: "New" }, total: "200" });
      const added = leerCola()[2];
      finish();
      await upload;
      expect(leerCola()).toEqual(error?.status === 503 ? [...original, added] : [added]);
    },
  );

  it("shares a concurrent upload and sends each order only once", async () => {
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(api)
      .mockImplementationOnce(async () => {
        await waiting;
        return {};
      })
      .mockResolvedValue({});
    const first = subirCola();
    const second = subirCola();
    expect(second).toBe(first);
    expect(api).toHaveBeenCalledTimes(1);
    finish();
    expect(await first).toEqual({ subidos: 2, rechazados: [] });
    expect(await second).toEqual({ subidos: 2, rechazados: [] });
    expect(api).toHaveBeenCalledTimes(2);
    expect(leerCola()).toEqual([]);
  });
});
