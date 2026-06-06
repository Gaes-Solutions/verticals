import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendClient } from "./resend.js";
import { EmailError } from "./types.js";

const OPTS = { apiKey: "re_test_123", remitenteDefault: "Tienda <no-reply@test.mx>" };

function mockFetch(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

afterEach(() => vi.restoreAllMocks());

describe("ResendClient", () => {
  it("rechaza apiKey stub con PROVIDER_UNAVAILABLE", () => {
    expect(() => new ResendClient({ ...OPTS, apiKey: "stub-key" })).toThrowError(EmailError);
  });

  it("envía email vía POST /emails con Bearer", async () => {
    const spy = mockFetch(200, { id: "em_abc123" });
    const client = new ResendClient(OPTS);
    const res = await client.enviar({
      para: "cliente@test.mx",
      asunto: "Hola",
      html: "<p>Hola</p>",
    });
    expect(res).toEqual({ emailId: "em_abc123", proveedor: "resend", aceptado: true });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_123");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe(OPTS.remitenteDefault);
    expect(body.to).toEqual(["cliente@test.mx"]);
    expect(body.subject).toBe("Hola");
  });

  it("error HTTP del API → SEND_FAILED", async () => {
    mockFetch(422, { message: "invalid from" });
    const client = new ResendClient(OPTS);
    await expect(
      client.enviar({ para: "cliente@test.mx", asunto: "X", html: "<p>x</p>" }),
    ).rejects.toMatchObject({ code: "SEND_FAILED" });
  });

  it("destino sin @ → INVALID_INPUT sin llamar al API", async () => {
    const spy = mockFetch(200, { id: "em_x" });
    const client = new ResendClient(OPTS);
    await expect(
      client.enviar({ para: "no-es-email", asunto: "X", html: "<p>x</p>" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("enviarPlantilla renderiza y manda asunto de la plantilla", async () => {
    const spy = mockFetch(200, { id: "em_tpl" });
    const client = new ResendClient(OPTS);
    await client.enviarPlantilla({
      para: "cliente@test.mx",
      plantilla: "pedido_confirmado",
      datos: { folioPublico: "GP-00000001", total: "398.00" },
    });
    const body = JSON.parse((spy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.subject).toBe("Pedido GP-00000001 confirmado");
    expect(body.html).toContain("GP-00000001");
  });
});
