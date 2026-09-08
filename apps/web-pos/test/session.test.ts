import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/lib/api.js";
import { openRegister, readSelection, resolverSession, saveSelection } from "../src/lib/session.js";

vi.mock("../src/lib/api.js", async (original) => ({
  ...(await original<typeof import("../src/lib/api.js")>()),
  api: vi.fn(),
}));
const request = vi.mocked(api);
const branch = { id: "branch-a", codigo: "A", nombre: "Sucursal A", isActive: true };
const cash = { id: "cash-a", codigo: "A", sucursalId: branch.id, isActive: true };
beforeEach(() => request.mockReset());

describe("cashier session", () => {
  it("uses an active branch and its own active cash register without opening on login", async () => {
    request.mockResolvedValueOnce([
      { ...branch, id: "archived", archivedAt: "2026-01-01", isDefault: true },
      branch,
    ]);
    request.mockResolvedValueOnce([
      { ...cash, id: "other", sucursalId: "other" },
      { ...cash, id: "inactive", isActive: false },
      cash,
    ]);
    request.mockResolvedValueOnce({ cajaId: cash.id, sucursalId: branch.id });
    expect(
      (await resolverSession("Cajero", { sucursalId: branch.id, cajaId: cash.id })).caja?.id,
    ).toBe(cash.id);
    expect(request.mock.calls).toEqual([
      ["/t/sucursales"],
      ["/t/cajas?sucursalId=branch-a"],
      ["/t/cajas/cash-a/apertura-actual"],
    ]);
  });
  it("rejects an inactive default branch", async () => {
    request.mockResolvedValueOnce([{ ...branch, isActive: false, isDefault: true }]);
    await expect(
      resolverSession("Cajero", { sucursalId: branch.id, cajaId: cash.id }),
    ).rejects.toThrow("sucursales activas");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not continue without a matching active register", async () => {
    request
      .mockResolvedValueOnce([branch])
      .mockResolvedValueOnce([{ ...cash, sucursalId: "other" }]);
    await expect(
      resolverSession("Cajero", { sucursalId: branch.id, cajaId: cash.id }),
    ).rejects.toThrow("caja activa");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([403, 409, 503])(
    "propagates opening verification failure %s without bypass",
    async (status) => {
      const failure = new ApiError(status, "No disponible");
      request
        .mockResolvedValueOnce([branch])
        .mockResolvedValueOnce([cash])
        .mockRejectedValueOnce(failure);
      await expect(
        resolverSession("Cajero", { sucursalId: branch.id, cajaId: cash.id }),
      ).rejects.toBe(failure);
      expect(request).toHaveBeenCalledTimes(3);
    },
  );
  it("asks for a real opening instead of inventing a zero starting balance", async () => {
    request
      .mockResolvedValueOnce([branch])
      .mockResolvedValueOnce([cash])
      .mockRejectedValueOnce(new ApiError(404, "Sin apertura"));
    await expect(
      resolverSession("Cajero", { sucursalId: branch.id, cajaId: cash.id }),
    ).rejects.toThrow("fondo inicial");
  });
  it("rejects an opening belonging to a different register", async () => {
    request
      .mockResolvedValueOnce([branch])
      .mockResolvedValueOnce([cash])
      .mockResolvedValueOnce({ cajaId: "other", sucursalId: branch.id });
    await expect(
      resolverSession("Cajero", { sucursalId: branch.id, cajaId: cash.id }),
    ).rejects.toThrow("no corresponde");
  });
});

describe("explicit register opening and scoped preference", () => {
  it.each(["", "-1", "1.234", "NaN", "1000000000", "1e3"])(
    "rejects invalid fund %s before writing",
    async (amount) => {
      await expect(
        openRegister({ sucursalId: branch.id, cajaId: cash.id }, amount),
      ).rejects.toThrow("fondo inicial");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("opens only with entered amount then checks the authoritative opening", async () => {
    request
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ cajaId: cash.id, sucursalId: branch.id });
    await openRegister({ sucursalId: branch.id, cajaId: cash.id }, "125.50");
    expect(request.mock.calls).toEqual([
      ["/t/cajas/cash-a/aperturar", { body: { montoInicial: "125.50" } }],
      ["/t/cajas/cash-a/apertura-actual"],
    ]);
  });
  it.each([409, 503])(
    "does not infer opening success from %s or automatically repeat",
    async (status) => {
      request.mockRejectedValueOnce(new ApiError(status, "No confirmado"));
      await expect(openRegister({ sucursalId: branch.id, cajaId: cash.id }, "0")).rejects.toThrow(
        "No confirmado",
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects a successful POST whose opening cannot be confirmed", async () => {
    request.mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(404, "Sin apertura"));
    await expect(openRegister({ sucursalId: branch.id, cajaId: cash.id }, "0")).rejects.toThrow(
      "confirmar",
    );
  });
  it("isolates saved registers by verified user and tenant", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    try {
      const identity = { id: "u1", tenantSlug: "tenant-a", nombre: "Uno", permissions: [] };
      const selection = { sucursalId: branch.id, cajaId: cash.id };
      saveSelection(identity, selection);
      expect(readSelection(identity)).toEqual(selection);
      expect(readSelection({ ...identity, id: "u2" })).toBeNull();
      expect(readSelection({ ...identity, tenantSlug: "tenant-b" })).toBeNull();
      expect([...values.values()][0]).not.toContain("nombre");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("does not substitute a different register when saved one is missing", async () => {
    request.mockResolvedValueOnce([branch]).mockResolvedValueOnce([{ ...cash, id: "cash-b" }]);
    await expect(
      resolverSession("Cajero", { sucursalId: branch.id, cajaId: cash.id }),
    ).rejects.toThrow("caja activa");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
