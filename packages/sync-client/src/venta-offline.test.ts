import { describe, expect, it } from "vitest";
import { InMemoryStorage } from "./in-memory-storage.js";
import {
  type CobroSinInternetInput,
  cobrarSinInternet,
  construirVentaOffline,
} from "./venta-offline.js";

const base: CobroSinInternetInput = {
  sucursalId: "suc-1",
  cajaId: "caja-1",
  aperturaId: "apertura-1",
  lineas: [{ varianteId: "var-1", cantidad: "2" }],
  pagos: [{ metodo: "efectivo", monto: "300.00" }],
  total: "251.00",
  comprobante: [
    {
      varianteId: "var-1",
      cantidad: "2",
      precioUnitario: "125.50",
      descuentoUnitario: "0",
      ivaTotal: "34.62",
      iepsTotal: "0",
      totalLinea: "251.00",
    },
  ],
};

describe("cobro sin internet", () => {
  it("guarda la venta con su turno de caja y su desglose", async () => {
    const storage = new InMemoryStorage();
    const cobrada = await cobrarSinInternet(storage, base);

    const pendientes = await storage.getPending(10);
    expect(pendientes).toHaveLength(1);
    const op = pendientes[0]?.operation;
    expect(op?.idempotencyKey).toBe(cobrada.idempotencyKey);
    expect(op?.entityType).toBe("venta");
    expect(op?.payload).toMatchObject({
      cajaId: "caja-1",
      canal: "pos",
      expectedTotal: "251.00",
      expectedAperturaId: "apertura-1",
      expectedLineas: base.comprobante,
      pagos: [{ metodo: "efectivo", monto: "300.00" }],
    });
  });

  it("cada venta lleva su propia clave, así un reintento no borra la anterior", async () => {
    const storage = new InMemoryStorage();
    const una = await cobrarSinInternet(storage, base);
    const otra = await cobrarSinInternet(storage, base);

    expect(una.idempotencyKey).not.toBe(otra.idempotencyKey);
    expect((await storage.getStats()).pending).toBe(2);
  });

  it("no cobra sin turno de caja abierto", () => {
    expect(() => construirVentaOffline({ ...base, aperturaId: " " })).toThrow("turno de caja");
  });

  it("sin internet no acepta otra forma de pago que efectivo", () => {
    expect(() =>
      construirVentaOffline({
        ...base,
        pagos: [{ metodo: "tarjeta_credito" as unknown as "efectivo", monto: "251.00" }],
      }),
    ).toThrow("efectivo");
  });

  it("no cobra si el efectivo recibido no alcanza", () => {
    expect(() =>
      construirVentaOffline({ ...base, pagos: [{ metodo: "efectivo", monto: "250.99" }] }),
    ).toThrow("no cubre el total");
  });

  it("no acepta un desglose que no corresponde a los artículos", () => {
    expect(() => construirVentaOffline({ ...base, comprobante: [] })).toThrow("desglose");
    expect(() =>
      construirVentaOffline({
        ...base,
        lineas: [...base.lineas, { varianteId: "var-2", cantidad: "1" }],
      }),
    ).toThrow("no corresponde");
  });
});
