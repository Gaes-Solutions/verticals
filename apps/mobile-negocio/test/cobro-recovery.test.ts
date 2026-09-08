import { describe, expect, it, vi } from "vitest";
import { cobroPendienteKey } from "../src/lib/cobro-model";
import { iniciarCobro, recuperarCobro } from "../src/lib/cobro-recovery";
const key = "11111111-1111-4111-8111-111111111111";
const input = {
  recibido: "10.00",
  sucursalId: "s",
  cajaId: "c",
  lineas: [{ varianteId: "v", cantidad: "1" }],
};
const venta = {
  ventaId: "v",
  folio: "f",
  total: "10.00",
  totalCobrado: "10.00",
  cambioDado: "0.00",
};
function setup() {
  const values = new Map<string, string>();
  const storage = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  const api = {
    cancelar: vi.fn().mockResolvedValue({ status: "cancelled" }),
    preparar: vi.fn().mockResolvedValue({ idempotencyKey: key }),
    enviar: vi.fn().mockResolvedValue(venta),
    consultar: vi
      .fn()
      .mockResolvedValue({ status: "ready", result: venta, ventaEstado: "cobrada" }),
  };
  return { values, storage, api, vigente: () => true, validar: vi.fn().mockResolvedValue("10.00") };
}
describe("intento durable de efectivo", () => {
  it("persiste UUID+payload antesPOST y confirma con GET DTO real", async () => {
    const d = setup();
    d.api.enviar.mockImplementationOnce(async (payload) => {
      expect(JSON.parse(d.values.get(cobroPendienteKey("o")) ?? "null").payload).toEqual(payload);
      return venta;
    });
    expect((await iniciarCobro("o", input, d)).estado).toBe("confirmado");
    expect(d.values.size).toBe(0);
    expect(d.api.consultar).toHaveBeenCalledWith(key);
  });
  it("fallo al preparar UUID no escribe ni cobra", async () => {
    const d = setup();
    d.api.preparar.mockRejectedValueOnce(new Error("red"));
    expect((await iniciarCobro("o", input, d)).estado).toBe("rechazado");
    expect(d.storage.set).not.toHaveBeenCalled();
    expect(d.api.enviar).not.toHaveBeenCalled();
  });
  it("escritura segura falla: no POST", async () => {
    const d = setup();
    d.storage.set.mockRejectedValueOnce(new Error("secure"));
    await iniciarCobro("o", input, d);
    expect(d.api.enviar).not.toHaveBeenCalled();
  });
  it("timeout conserva payload y not_found no crea nueva clave", async () => {
    const d = setup();
    d.api.enviar.mockRejectedValueOnce(new Error("red"));
    await iniciarCobro("o", input, d);
    const saved = d.values.get(cobroPendienteKey("o"));
    d.api.consultar.mockResolvedValueOnce({ status: "not_found" });
    expect((await recuperarCobro("o", d.storage, d.api, d.vigente)).estado).toBe("not_found");
    await iniciarCobro("o", input, d);
    expect(d.api.preparar).toHaveBeenCalledTimes(1);
    expect(d.values.get(cobroPendienteKey("o"))).toBe(saved);
    expect(d.api.enviar).toHaveBeenCalledTimes(1);
  });
  it("reenvío explícito tras reinicio usa exactamente payload guardado", async () => {
    const d = setup();
    d.api.enviar.mockRejectedValueOnce(new Error("red"));
    await iniciarCobro("o", input, d);
    const sent = d.api.enviar.mock.calls[0]?.[0];
    expect((await recuperarCobro("o", d.storage, d.api, d.vigente, "reenviar")).estado).toBe(
      "confirmado",
    );
    expect(d.api.enviar.mock.calls[1]?.[0]).toEqual(sent);
    expect(d.api.preparar).toHaveBeenCalledTimes(1);
  });
  it("processing no borra ni reenvía automáticamente", async () => {
    const d = setup();
    d.api.consultar.mockResolvedValue({ status: "processing" });
    expect((await iniciarCobro("o", input, d)).estado).toBe("processing");
    await recuperarCobro("o", d.storage, d.api, d.vigente);
    expect(d.api.enviar).toHaveBeenCalledTimes(1);
    expect(d.values.size).toBe(1);
  });
  it("legacy pendiente permanece bloqueada sin nuevo UUID", async () => {
    const d = setup();
    d.values.set(cobroPendienteKey("o"), "pendiente");
    expect((await recuperarCobro("o", d.storage, d.api, d.vigente, "reenviar")).estado).toBe(
      "legacy",
    );
    await iniciarCobro("o", input, d);
    expect(d.api.preparar).not.toHaveBeenCalled();
    expect(d.api.enviar).not.toHaveBeenCalled();
  });
  it("rechaza DTO viejo id/estado aunque HTTP sea200", async () => {
    const d = setup();
    d.api.enviar.mockResolvedValueOnce({ id: "v", folio: "f", total: "10", estado: "cobrada" });
    expect((await iniciarCobro("o", input, d)).estado).toBe("incierto");
    expect(d.values.size).toBe(1);
  });
  it("venta cancelada requiere conciliación y conserva marca", async () => {
    const d = setup();
    d.api.consultar.mockResolvedValue({ status: "ready", result: venta, ventaEstado: "cancelada" });
    expect((await iniciarCobro("o", input, d)).estado).toBe("conciliar");
    expect(d.values.size).toBe(1);
  });
  it("fallo GET posterior a POST exitoso conserva intento", async () => {
    const d = setup();
    d.api.consultar.mockRejectedValueOnce(new Error("red"));
    expect((await iniciarCobro("o", input, d)).estado).toBe("incierto");
    expect(d.values.size).toBe(1);
  });
  it("cambio cuenta durante UUID no persiste ni envía", async () => {
    const d = setup();
    let current = true;
    d.api.preparar.mockImplementationOnce(async () => {
      current = false;
      return { idempotencyKey: key };
    });
    await iniciarCobro("o", input, { ...d, vigente: () => current });
    expect(d.storage.set).not.toHaveBeenCalled();
    expect(d.api.enviar).not.toHaveBeenCalled();
  });
  it("cambio cuenta tras persistir conserva registro pero no envía", async () => {
    const d = setup();
    let current = true;
    d.storage.set.mockImplementationOnce(async (k, v) => {
      d.values.set(k, v);
      current = false;
    });
    await iniciarCobro("o", input, { ...d, vigente: () => current });
    expect(d.values.size).toBe(1);
    expect(d.api.enviar).not.toHaveBeenCalled();
  });
  it("aislamiento: registro de cuenta ajena no autoriza reenvío", async () => {
    const d = setup();
    d.api.enviar.mockRejectedValueOnce(new Error("red"));
    await iniciarCobro("a", input, d);
    d.values.set(cobroPendienteKey("b"), d.values.get(cobroPendienteKey("a")) ?? "null");
    expect((await recuperarCobro("b", d.storage, d.api, d.vigente, "reenviar")).estado).toBe(
      "legacy",
    );
    expect(d.api.enviar).toHaveBeenCalledTimes(1);
  });
  it("doble toque concurrente no prepara dos claves", async () => {
    const d = setup();
    let resolve!: (value: string) => void;
    d.validar.mockReturnValueOnce(
      new Promise<string>((r) => {
        resolve = r;
      }),
    );
    const first = iniciarCobro("o", input, d);
    expect((await iniciarCobro("o", input, d)).estado).toBe("processing");
    resolve("10.00");
    await first;
    expect(d.api.preparar).toHaveBeenCalledTimes(1);
  });
});

describe("cancelación confirmada sin venta", () => {
  async function pendiente() {
    const d = setup();
    d.api.enviar.mockRejectedValueOnce(new Error("timeout"));
    await iniciarCobro("cancel-owner", input, d);
    return d;
  }
  it("cancelled libera marca y permite recotizar con nuevo intento", async () => {
    const d = await pendiente();
    expect(
      (await recuperarCobro("cancel-owner", d.storage, d.api, d.vigente, "cancelar")).estado,
    ).toBe("anulado");
    expect(d.api.cancelar).toHaveBeenCalledWith(key);
    expect(d.values.size).toBe(0);
    d.api.preparar.mockResolvedValueOnce({
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
    });
    await iniciarCobro("cancel-owner", input, d);
    expect(d.api.preparar).toHaveBeenCalledTimes(2);
  });
  it("GETcancelled recupera una cancelación cuya respuesta se perdió", async () => {
    const d = await pendiente();
    d.api.consultar.mockResolvedValueOnce({ status: "cancelled" });
    expect((await recuperarCobro("cancel-owner", d.storage, d.api, d.vigente)).estado).toBe(
      "anulado",
    );
    expect(d.values.size).toBe(0);
  });
  it("ready al cancelar recupera venta existente sin cancelarla ni reenviar", async () => {
    const d = await pendiente();
    d.api.cancelar.mockResolvedValueOnce({
      status: "ready",
      result: venta,
      ventaEstado: "cobrada",
    });
    const result = await recuperarCobro("cancel-owner", d.storage, d.api, d.vigente, "cancelar");
    expect(result.estado).toBe("confirmado");
    expect(d.api.enviar).toHaveBeenCalledTimes(1);
    expect(d.values.size).toBe(0);
  });
  it.each(["processing", "not_found"])("%s no libera ni prepara nueva clave", async (status) => {
    const d = await pendiente();
    d.api.cancelar.mockResolvedValueOnce({ status });
    await recuperarCobro("cancel-owner", d.storage, d.api, d.vigente, "cancelar");
    expect(d.values.size).toBe(1);
    await iniciarCobro("cancel-owner", input, d);
    expect(d.api.preparar).toHaveBeenCalledTimes(1);
  });
  it("error de cancelación conserva marca", async () => {
    const d = await pendiente();
    d.api.cancelar.mockRejectedValueOnce(new Error("timeout"));
    expect(
      (await recuperarCobro("cancel-owner", d.storage, d.api, d.vigente, "cancelar")).estado,
    ).toBe("incierto");
    expect(d.values.size).toBe(1);
  });
  it("no cancela marca legacy sin clave", async () => {
    const d = setup();
    d.values.set(cobroPendienteKey("legacy"), "pendiente");
    expect((await recuperarCobro("legacy", d.storage, d.api, d.vigente, "cancelar")).estado).toBe(
      "legacy",
    );
    expect(d.api.cancelar).not.toHaveBeenCalled();
    expect(d.values.size).toBe(1);
  });
  it("durante cancelación en vuelo no inicia nuevo cobro", async () => {
    const d = await pendiente();
    let finish: (value: { status: "cancelled" }) => void = () => {};
    d.api.cancelar.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const cancellation = recuperarCobro("cancel-owner", d.storage, d.api, d.vigente, "cancelar");
    await Promise.resolve();
    expect((await iniciarCobro("cancel-owner", input, d)).estado).toBe("processing");
    finish({ status: "cancelled" });
    await cancellation;
    expect(d.api.preparar).toHaveBeenCalledTimes(1);
  });
});

describe("recibido y cambio durable", () => {
  const overpaid = { ...venta, total: "150.00", totalCobrado: "200.00", cambioDado: "50.00" };
  function setupOverpaid() {
    const d = setup();
    d.validar.mockResolvedValue("150.00");
    d.api.enviar.mockResolvedValue(overpaid);
    d.api.consultar.mockResolvedValue({
      status: "ready",
      result: overpaid,
      ventaEstado: "cobrada",
    });
    return d;
  }
  it("persiste recibido200 antes del POST y recupera idéntico tras timeout", async () => {
    const d = setupOverpaid();
    d.api.enviar.mockImplementationOnce(async (payload) => {
      expect(JSON.parse(d.values.get(cobroPendienteKey("cash")) ?? "null").payload).toEqual(
        payload,
      );
      throw new Error("timeout");
    });
    expect((await iniciarCobro("cash", { ...input, recibido: "200" }, d)).estado).toBe("incierto");
    const sent = d.api.enviar.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      expectedTotal: "150.00",
      pagos: [{ metodo: "efectivo", monto: "200.00" }],
    });
    expect(sent).not.toHaveProperty("recibido");
    expect((await recuperarCobro("cash", d.storage, d.api, d.vigente, "reenviar")).estado).toBe(
      "confirmado",
    );
    expect(d.api.enviar.mock.calls[1]?.[0]).toEqual(sent);
    expect(d.api.preparar).toHaveBeenCalledTimes(1);
    expect(d.values.size).toBe(0);
  });
  it.each([{ totalCobrado: "150.00" }, { cambioDado: "0.00" }, { total: "" }])(
    "resultado incongruente conserva intento %s",
    async (wrong) => {
      const d = setupOverpaid();
      d.api.consultar.mockResolvedValue({
        status: "ready",
        result: { ...overpaid, ...wrong },
        ventaEstado: "cobrada",
      });
      expect((await iniciarCobro("cash", { ...input, recibido: "200" }, d)).estado).toBe(
        "incierto",
      );
      expect(d.values.size).toBe(1);
      expect(d.storage.delete).not.toHaveBeenCalled();
    },
  );
  it.each(["149.99", "", "200.001"])(
    "recibido inválido %s no prepara ni escribe",
    async (recibido) => {
      const d = setupOverpaid();
      expect((await iniciarCobro("cash", { ...input, recibido }, d)).estado).toBe("rechazado");
      expect(d.api.preparar).not.toHaveBeenCalled();
      expect(d.storage.set).not.toHaveBeenCalled();
      expect(d.api.enviar).not.toHaveBeenCalled();
    },
  );
});
