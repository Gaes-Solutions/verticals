import { describe, expect, it, vi } from "vitest";
import {
  calcularEfectivo,
  montoCentavos,
  totalVerificado,
  validarAntesDeCobrar,
} from "../src/lib/cobro-model";
const input = {
  sucursalId: "s",
  cajaId: "c",
  total: "10.00",
  lineas: [{ varianteId: "v", cantidad: "1" }],
};
const dependencies = () => ({
  branches: vi.fn().mockResolvedValue([{ id: "s", isActive: true }]),
  registers: vi.fn().mockResolvedValue([{ id: "c", sucursalId: "s", isActive: true }]),
  opening: vi.fn().mockResolvedValue(true),
  preview: vi.fn().mockResolvedValue({ total: "10.00" }),
});
describe("validación previa", () => {
  it.each([undefined, "NaN", "-1", "0", "1.123", "Infinity", 10])(
    "rechaza total inválido %s",
    (value) => expect(totalVerificado(value)).toBe(false),
  );
  it("solo acepta total revalidado por servidor", async () => {
    expect(await validarAntesDeCobrar(input, dependencies())).toBe("10.00");
  });
  it("no cotiza con caja cerrada", async () => {
    const deps = dependencies();
    deps.opening.mockResolvedValue(false);
    await expect(validarAntesDeCobrar(input, deps)).rejects.toThrow("POS");
    expect(deps.preview).not.toHaveBeenCalled();
  });
  it("no avanza ante error de apertura", async () => {
    const deps = dependencies();
    deps.opening.mockRejectedValue(new Error("red"));
    await expect(validarAntesDeCobrar(input, deps)).rejects.toThrow("red");
    expect(deps.preview).not.toHaveBeenCalled();
  });
  it("rechaza caja de otra sucursal", async () => {
    const deps = dependencies();
    deps.registers.mockResolvedValue([{ id: "c", sucursalId: "otro", isActive: true }]);
    await expect(validarAntesDeCobrar(input, deps)).rejects.toThrow("Caja");
  });
  it("rechaza sucursal archivada", async () => {
    const deps = dependencies();
    deps.branches.mockResolvedValue([{ id: "s", isActive: true, archivedAt: "ayer" }]);
    await expect(validarAntesDeCobrar(input, deps)).rejects.toThrow("Sucursal");
  });
  it("bloquea cambio de total", async () => {
    const deps = dependencies();
    deps.preview.mockResolvedValue({ total: "11.00" });
    await expect(validarAntesDeCobrar(input, deps)).rejects.toThrow("cambió");
  });
});

describe("efectivo recibido en centavos", () => {
  it("calcula cambio con el recibido real y sin redondeo binario", () => {
    expect(calcularEfectivo("150", "200")).toEqual({ monto: "200.00", cambio: "50.00" });
    expect(calcularEfectivo("149.90", "150")).toEqual({ monto: "150.00", cambio: "0.10" });
    expect(montoCentavos("0.29")).toBe(29);
  });
  it.each([
    "",
    " ",
    "200 MXN",
    "2e2",
    "Infinity",
    "-200",
    "200.001",
    "199,99",
    "99999999999999999",
  ])("rechaza formato recibido %s", (value) => {
    expect(calcularEfectivo("150", value)).toBeNull();
  });
  it("rechaza insuficiente y total no autorizado", () => {
    expect(calcularEfectivo("150", "149.99")).toBeNull();
    expect(calcularEfectivo("", "200")).toBeNull();
    expect(calcularEfectivo("0", "200")).toBeNull();
  });
});
