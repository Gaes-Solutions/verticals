import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/lib/api.js";
import {
  cargarAperturaCorte,
  clearCortePendiente,
  consultarCierreZ,
  conteoValido,
  corteScope,
  enviarCorte,
  getCortePendiente,
  setCortePendiente,
} from "../src/lib/corte-recovery.js";
vi.mock("../src/lib/api.js", async (original) => ({
  ...(await original<typeof import("../src/lib/api.js")>()),
  api: vi.fn(),
}));
const request = vi.mocked(api);
beforeEach(() => request.mockReset());
const opening = {
  id: "opening",
  cajaId: "cash",
  sucursalId: "branch",
  estado: "abierta",
  montoInicial: "0",
};
const detail = {
  id: "cut",
  tipo: "Z",
  aperturaId: "opening",
  apertura: { id: "opening", estado: "cerrada" },
  diferencia: "0.00",
  efectivoContado: "150.00",
};
const list = { total: 1, items: [{ id: "cut", aperturaId: "opening", tipo: "Z" }] };
describe("consulta de apertura", () => {
  it("sólo404 representa ausencia de apertura", async () => {
    request.mockRejectedValueOnce(new ApiError(404, "cerrada"));
    expect(await cargarAperturaCorte("cash", "branch")).toBeNull();
  });
  it("503 y red siguen siendo error, nunca caja cerrada", async () => {
    request.mockRejectedValueOnce(new ApiError(503, "red"));
    await expect(cargarAperturaCorte("cash", "branch")).rejects.toThrow("red");
    request.mockRejectedValueOnce(new Error("offline"));
    await expect(cargarAperturaCorte("cash", "branch")).rejects.toThrow("offline");
  });
  it("rechaza apertura ajena", async () => {
    request.mockResolvedValueOnce({ ...opening, cajaId: "otro" });
    await expect(cargarAperturaCorte("cash", "branch")).rejects.toThrow("corresponde");
  });
  it("propaga cancelación al transporte", async () => {
    const controller = new AbortController();
    controller.abort();
    request.mockImplementationOnce(async (_path, opts) => {
      expect(opts?.signal?.aborted).toBe(true);
      throw new Error("abort");
    });
    await expect(cargarAperturaCorte("cash", "branch", controller.signal)).rejects.toThrow("abort");
  });
});
describe("confirmación de cierre sin reenviar", () => {
  it("verifica lista y detalle de apertura cerrada y usa conteo servidor", async () => {
    request.mockResolvedValueOnce(list).mockResolvedValueOnce(detail);
    expect(await consultarCierreZ("opening")).toEqual({
      corteId: "cut",
      tipo: "Z",
      diferencia: "0.00",
      efectivoContado: "150.00",
    });
    expect(request.mock.calls.every((call) => call[1]?.body === undefined)).toBe(true);
  });
  it("lista vacía no confirma ni repitePOST", async () => {
    request.mockResolvedValueOnce({ total: 0, items: [] });
    expect(await consultarCierreZ("opening")).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("apertura sigue abierta: no confirma cierre", async () => {
    request
      .mockResolvedValueOnce(list)
      .mockResolvedValueOnce({ ...detail, apertura: { id: "opening", estado: "abierta" } });
    await expect(consultarCierreZ("opening")).rejects.toThrow("verificar");
  });
  it("múltiples cierres requieren conciliación", async () => {
    request.mockResolvedValueOnce({ ...list, total: 2 });
    await expect(consultarCierreZ("opening")).rejects.toThrow("conciliación");
  });
  it("detalle de otra apertura no confirma", async () => {
    request.mockResolvedValueOnce(list).mockResolvedValueOnce({ ...detail, aperturaId: "otra" });
    await expect(consultarCierreZ("opening")).rejects.toThrow("verificar");
  });
  it("resultadoPOSTmalformado conserva incertidumbre", async () => {
    request.mockResolvedValueOnce({ tipo: "Z", diferencia: "0" });
    await expect(
      enviarCorte({
        aperturaId: "opening",
        tipo: "Z",
        denominaciones: { billetes: {}, monedas: {} },
      }),
    ).rejects.toThrow("confirmar");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("bloqueo sobrevive remontaje y aísla caja/sucursal", () => {
    const session = {};
    const scope = corteScope(session, "b", "c");
    setCortePendiente(scope, { aperturaId: "opening", tipo: "Z" });
    expect(getCortePendiente(scope)?.aperturaId).toBe("opening");
    expect(getCortePendiente(corteScope(session, "otro", "c"))).toBeUndefined();
    clearCortePendiente(scope);
    expect(getCortePendiente(scope)).toBeUndefined();
  });
  it("conteo rechaza negativos, fracciones e infinito", () => {
    expect(conteoValido({ "20": -1 })).toBe(false);
    expect(conteoValido({ "20": 0.5 })).toBe(false);
    expect(conteoValido({ "20": Number.POSITIVE_INFINITY })).toBe(false);
    expect(conteoValido({ "20": 2, "10": 0 })).toBe(true);
  });
});

describe("contrato de apertura confirmado con API", () => {
  it("acepta DTO explícito estado abierta, sin inferir estado por HTTP200", async () => {
    request.mockResolvedValueOnce(opening);
    expect(await cargarAperturaCorte("cash", "branch")).toEqual(opening);
  });
  it.each([undefined, "cerrada", "", null])("rechaza estado inválido %s", async (estado) => {
    request.mockResolvedValueOnce({ ...opening, estado });
    await expect(cargarAperturaCorte("cash", "branch")).rejects.toThrow("corresponde");
  });
});
describe("decimales de corte sin coerción permisiva", () => {
  it.each(["", " ", "1e3", "NaN", "Infinity", "0x10", ".5", "--1", null, 0])(
    "rechaza diferencia POST inválida %s",
    async (diferencia) => {
      request.mockResolvedValueOnce({ corteId: "cut", tipo: "Z", diferencia });
      await expect(
        enviarCorte({
          aperturaId: "opening",
          tipo: "Z",
          denominaciones: { billetes: {}, monedas: {} },
        }),
      ).rejects.toThrow("confirmar");
    },
  );
  it("preserva diferencia negativa y cuatro decimales recibidos", async () => {
    request.mockResolvedValueOnce({ corteId: "cut", tipo: "Z", diferencia: "-10.0123" });
    expect(
      (
        await enviarCorte({
          aperturaId: "opening",
          tipo: "Z",
          denominaciones: { billetes: {}, monedas: {} },
        })
      ).diferencia,
    ).toBe("-10.0123");
  });
  it.each(["", " ", "-1", "-0", "1e2", null])(
    "rechaza contado GET inválido %s",
    async (efectivoContado) => {
      request.mockResolvedValueOnce(list).mockResolvedValueOnce({ ...detail, efectivoContado });
      await expect(consultarCierreZ("opening")).rejects.toThrow("verificar");
    },
  );
  it("rechaza diferencia vacía también en GET", async () => {
    request.mockResolvedValueOnce(list).mockResolvedValueOnce({ ...detail, diferencia: "" });
    await expect(consultarCierreZ("opening")).rejects.toThrow("verificar");
  });
  it("preserva valores de servidor sin normalizar cadenas", async () => {
    request
      .mockResolvedValueOnce(list)
      .mockResolvedValueOnce({ ...detail, efectivoContado: "150.0000", diferencia: "-1.2345" });
    expect(await consultarCierreZ("opening")).toEqual({
      corteId: "cut",
      tipo: "Z",
      efectivoContado: "150.0000",
      diferencia: "-1.2345",
    });
  });
});
it("sesiones distintas no comparten bloqueo aunque coincidan caja y sucursal", () => {
  const authenticatedSession = {};
  const scope = corteScope(authenticatedSession, "branch", "cash");
  setCortePendiente(scope, { aperturaId: "opening", tipo: "Z" });
  expect(getCortePendiente(corteScope(authenticatedSession, "branch", "cash"))).toEqual({
    aperturaId: "opening",
    tipo: "Z",
  });
  expect(getCortePendiente(corteScope({}, "branch", "cash"))).toBeUndefined();
  clearCortePendiente(scope);
});
