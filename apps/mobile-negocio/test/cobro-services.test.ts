import { ApiError } from "@gaespos/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../src/lib/api", () => ({ api: mocks }));
import {
  buscarProductosPOS,
  cancelarIntentoCobro,
  consultarIntentoCobro,
  enviarCobroDurable,
  listCajasPOS,
  prepararCobro,
  verificarAperturaPOS,
} from "../src/services/negocio";
beforeEach(() => vi.clearAllMocks());
describe("contrato caja móvil", () => {
  it("incluye caja y total servidor sin apertura automática", async () => {
    await enviarCobroDurable({
      sucursalId: "s",
      cajaId: "c",
      lineas: [{ varianteId: "v", cantidad: "1" }],
      canal: "pos",
      expectedTotal: "12.00",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      pagos: [{ metodo: "efectivo", monto: "12.00" }],
    });
    expect(mocks.post).toHaveBeenCalledWith(
      "/t/ventas",
      expect.objectContaining({
        cajaId: "c",
        sucursalId: "s",
        pagos: [{ metodo: "efectivo", monto: "12.00" }],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it("codifica sucursal", async () => {
    await listCajasPOS("s/a");
    expect(mocks.get.mock.calls[0]?.[0]).toBe("/t/cajas?sucursalId=s%2Fa");
  });
  it("404 apertura es caja cerrada", async () => {
    mocks.get.mockRejectedValueOnce(new ApiError(404, "cerrada"));
    expect(await verificarAperturaPOS("s", "c")).toBe(false);
  });
  it("red no es caja cerrada ni permiso para abrir", async () => {
    mocks.get.mockRejectedValueOnce(new Error("red"));
    await expect(verificarAperturaPOS("s", "c")).rejects.toThrow("red");
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("rechaza apertura de otra caja", async () => {
    mocks.get.mockResolvedValueOnce({ cajaId: "otro", sucursalId: "s", estado: "abierta" });
    await expect(verificarAperturaPOS("s", "c")).rejects.toThrow("selección");
  });
});

it("lee contrato real ventaId y prepara sin cobro", async () => {
  const result = {
    ventaId: "v",
    folio: "f",
    total: "12.00",
    totalCobrado: "12.00",
    cambioDado: "0.00",
  };
  mocks.get.mockResolvedValueOnce({ status: "ready", result, ventaEstado: "cobrada" });
  expect(await consultarIntentoCobro("key/a")).toEqual({
    status: "ready",
    result,
    ventaEstado: "cobrada",
  });
  expect(mocks.get.mock.calls[0]?.[0]).toBe("/t/ventas/intentos/key%2Fa");
  mocks.post.mockResolvedValueOnce({ idempotencyKey: "key" });
  await prepararCobro();
  expect(mocks.post.mock.calls[0]?.[0]).toBe("/t/ventas/intentos/preparar");
});

it("cancelación usa endpoint intento, nunca cancela venta", async () => {
  mocks.post.mockResolvedValueOnce({ status: "cancelled" });
  expect(await cancelarIntentoCobro("key/a")).toEqual({ status: "cancelled" });
  expect(mocks.post.mock.calls[0]?.[0]).toBe("/t/ventas/intentos/key%2Fa/cancelar");
  expect(mocks.post.mock.calls[0]?.[1]).toEqual({});
});

it("búsqueda de caja solicita activos y codifica texto sin elegir variante", async () => {
  const response = { items: [{ id: "p", variantes: [{ id: "v1" }, { id: "v2" }] }] };
  mocks.get.mockResolvedValueOnce(response);
  expect(await buscarProductosPOS("café & 500")).toBe(response);
  expect(mocks.get.mock.calls[0]?.[0]).toBe(
    "/t/productos?pageSize=25&isActive=true&q=caf%C3%A9%20%26%20500",
  );
});
