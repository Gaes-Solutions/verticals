import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/lib/api.js";
import {
  type VentaDevolucion,
  armarDevolucion,
  buscarVentaDevolucion,
  verificarCajaDevolucion,
} from "../src/lib/devolucion-safe.js";
vi.mock("../src/lib/api.js", async (original) => ({
  ...(await original<typeof import("../src/lib/api.js")>()),
  api: vi.fn(),
}));
const request = vi.mocked(api);
beforeEach(() => request.mockReset());
const venta = {
  id: "sale",
  folio: "F1",
  sucursalId: "s",
  lineas: [{ id: "line", cantidad: "2" }],
} as VentaDevolucion;
describe("devolución caja", () => {
  it("incluye cajaId sólo al reembolsar efectivo", () => {
    expect(armarDevolucion(venta, { line: 1 }, "defectuoso", "efectivo", "c").cajaId).toBe("c");
    expect(armarDevolucion(venta, { line: 1 }, "defectuoso", "vale", "c").cajaId).toBeUndefined();
  });
  it("bloquea efectivo sin caja", () =>
    expect(() => armarDevolucion(venta, { line: 1 }, "defectuoso", "efectivo")).toThrow("caja"));
  it("bloquea cantidad superior a lo vendido", () =>
    expect(() => armarDevolucion(venta, { line: 3 }, "defectuoso", "efectivo", "c")).toThrow(
      "Cantidad",
    ));
  it("caja de otra sucursal no consulta apertura ni reembolsa", async () => {
    request.mockResolvedValueOnce({ id: "c", sucursalId: "otra", isActive: true });
    await expect(verificarCajaDevolucion("c", "s")).rejects.toThrow("misma sucursal");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("404apertura pide apertura desdePOS", async () => {
    request
      .mockResolvedValueOnce({ id: "c", sucursalId: "s", isActive: true })
      .mockRejectedValueOnce(new ApiError(404, "cerrada"));
    await expect(verificarCajaDevolucion("c", "s")).rejects.toThrow("cerrada");
  });
  it("503apertura no se confunde con cerrada", async () => {
    request
      .mockResolvedValueOnce({ id: "c", sucursalId: "s", isActive: true })
      .mockRejectedValueOnce(new ApiError(503, "servicio"));
    await expect(verificarCajaDevolucion("c", "s")).rejects.toThrow("servicio");
  });
  it("verifica apertura activa en caja y sucursal exactas", async () => {
    request
      .mockResolvedValueOnce({ id: "c", sucursalId: "s", isActive: true })
      .mockResolvedValueOnce({ cajaId: "c", sucursalId: "s", estado: "abierta" });
    await verificarCajaDevolucion("c", "s");
    expect(request.mock.calls.every((call) => call[1]?.body === undefined)).toBe(true);
  });
  it("búsqueda parcial no selecciona primera venta incorrecta", async () => {
    request.mockResolvedValueOnce({ items: [{ id: "other", folio: "F10" }] });
    expect(await buscarVentaDevolucion("F1")).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
