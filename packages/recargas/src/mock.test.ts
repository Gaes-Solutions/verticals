import { describe, expect, it } from "vitest";
import { COMPANIAS_V1, validarMonto, validarNumeroMx } from "./catalogo.js";
import { MockRecargaProvider } from "./mock.js";
import { RecargaError } from "./types.js";

describe("catálogo V1", () => {
  it("tiene 9 compañías tiempo_aire + 1 bait_pospago servicio", () => {
    expect(COMPANIAS_V1.length).toBe(10);
    expect(COMPANIAS_V1.filter((c) => c.tipo === "tiempo_aire").length).toBe(9);
    expect(COMPANIAS_V1.filter((c) => c.tipo === "pago_servicio").length).toBe(1);
  });

  it("telcel acepta monto $100 pero no $77", () => {
    expect(validarMonto("telcel", 100).ok).toBe(true);
    const bad = validarMonto("telcel", 77);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/no disponible/i);
  });

  it("bait_pospago acepta monto custom dentro de min/max", () => {
    expect(validarMonto("bait_pospago", 100).ok).toBe(true);
    expect(validarMonto("bait_pospago", 49).ok).toBe(false);
    expect(validarMonto("bait_pospago", 5001).ok).toBe(false);
  });

  it("rechaza monto <= 0", () => {
    expect(validarMonto("telcel", 0).ok).toBe(false);
    expect(validarMonto("telcel", -1).ok).toBe(false);
  });
});

describe("validarNumeroMx", () => {
  it("acepta 10 dígitos empezando por 2-9", () => {
    expect(validarNumeroMx("3311112222")).toBe(true);
    expect(validarNumeroMx("5599998888")).toBe(true);
  });

  it("rechaza menos/más de 10 dígitos", () => {
    expect(validarNumeroMx("331111222")).toBe(false);
    expect(validarNumeroMx("33111122223")).toBe(false);
  });

  it("rechaza si empieza con 0 o 1", () => {
    expect(validarNumeroMx("0311112222")).toBe(false);
    expect(validarNumeroMx("1311112222")).toBe(false);
  });

  it("rechaza no-dígitos", () => {
    expect(validarNumeroMx("33-1111-2222")).toBe(false);
    expect(validarNumeroMx("abc1234567")).toBe(false);
  });
});

describe("MockRecargaProvider", () => {
  it("recarga exitosa devuelve folioProveedor + costo + comisión 2%", async () => {
    const m = new MockRecargaProvider();
    const r = await m.recargar({
      companiaCodigo: "telcel",
      numeroTelefonico: "3311112222",
      montoSolicitado: "100",
      tipo: "tiempo_aire",
      idempotencyKey: "key-001",
    });
    expect(r.estado).toBe("exitosa");
    expect(r.folioProveedor).toMatch(/^MOCK-[A-F0-9-]{12}$/);
    expect(r.costoRealTenant).toBe("100.0000");
    expect(r.comisionProveedor).toBe("2.0000");
  });

  it("idempotencia: 2do call con mismo key devuelve mismo resultado", async () => {
    const m = new MockRecargaProvider();
    const input = {
      companiaCodigo: "telcel" as const,
      numeroTelefonico: "3311112222",
      montoSolicitado: "50",
      tipo: "tiempo_aire" as const,
      idempotencyKey: "key-idem",
    };
    const r1 = await m.recargar(input);
    const r2 = await m.recargar(input);
    expect(r2.folioProveedor).toBe(r1.folioProveedor);
    expect(m.exitos.length).toBe(1);
  });

  it("número inválido → estado=fallida sin excepción", async () => {
    const m = new MockRecargaProvider();
    const r = await m.recargar({
      companiaCodigo: "telcel",
      numeroTelefonico: "0311112222",
      montoSolicitado: "50",
      tipo: "tiempo_aire",
      idempotencyKey: "key-bad-num",
    });
    expect(r.estado).toBe("fallida");
    expect(r.motivoFalla).toMatch(/Número telefónico inválido/);
  });

  it("monto inválido → estado=fallida", async () => {
    const m = new MockRecargaProvider();
    const r = await m.recargar({
      companiaCodigo: "telcel",
      numeroTelefonico: "3311112222",
      montoSolicitado: "77",
      tipo: "tiempo_aire",
      idempotencyKey: "key-bad-amt",
    });
    expect(r.estado).toBe("fallida");
    expect(r.motivoFalla).toMatch(/no disponible|monto/i);
  });

  it("failNextRecharge lanza RecargaError (simula red caída)", async () => {
    const m = new MockRecargaProvider({ failNextRecharge: true });
    await expect(
      m.recargar({
        companiaCodigo: "telcel",
        numeroTelefonico: "3311112222",
        montoSolicitado: "50",
        tipo: "tiempo_aire",
        idempotencyKey: "key-net-down",
      }),
    ).rejects.toBeInstanceOf(RecargaError);
  });

  it("rejectNextRecharge retorna estado=fallida (no excepción)", async () => {
    const m = new MockRecargaProvider({ rejectNextRecharge: true });
    const r = await m.recargar({
      companiaCodigo: "telcel",
      numeroTelefonico: "3311112222",
      montoSolicitado: "50",
      tipo: "tiempo_aire",
      idempotencyKey: "key-carrier-reject",
    });
    expect(r.estado).toBe("fallida");
    expect(r.motivoFalla).toMatch(/Compañía rechazó/i);
  });

  it("numerosInvalidos lista los que el mock siempre rechaza", async () => {
    const m = new MockRecargaProvider({ numerosInvalidos: ["3311112222"] });
    const r = await m.recargar({
      companiaCodigo: "telcel",
      numeroTelefonico: "3311112222",
      montoSolicitado: "50",
      tipo: "tiempo_aire",
      idempotencyKey: "key-blacklist",
    });
    expect(r.estado).toBe("fallida");
    expect(r.motivoFalla).toMatch(/no existe en el sistema/i);
  });

  it("consultarEstado devuelve resultado previamente registrado", async () => {
    const m = new MockRecargaProvider();
    const r = await m.recargar({
      companiaCodigo: "telcel",
      numeroTelefonico: "3311112222",
      montoSolicitado: "100",
      tipo: "tiempo_aire",
      idempotencyKey: "key-consultable",
    });
    const lookup = await m.consultarEstado({ folioProveedor: r.folioProveedor! });
    expect(lookup.estado).toBe("exitosa");
    expect(lookup.folioProveedor).toBe(r.folioProveedor);
  });

  it("consultarEstado de folio inexistente lanza RecargaError", async () => {
    const m = new MockRecargaProvider();
    await expect(m.consultarEstado({ folioProveedor: "no-existe" })).rejects.toBeInstanceOf(
      RecargaError,
    );
  });
});
