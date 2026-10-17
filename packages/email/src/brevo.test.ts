import { afterEach, describe, expect, it, vi } from "vitest";
import { BrevoClient } from "./brevo.js";

const options = { apiKey: "test-brevo-key", remitenteDefault: "Gaesland <tienda@example.invalid>" };
const input = { para: "cliente@example.invalid", asunto: "Hola", html: "<p>Hola</p>" };
afterEach(() => vi.restoreAllMocks());

describe("BrevoClient", () => {
  it("usa api-key, destinatarios y campos del contrato transaccional", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: "<brevo-test>" }), { status: 201 }),
      );
    const result = await new BrevoClient(options).enviar({
      ...input,
      texto: "Hola",
      replyTo: "soporte@example.invalid",
    });
    expect(result).toEqual({ emailId: "<brevo-test>", proveedor: "brevo", aceptado: true });
    const [url, request] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(request.headers).toMatchObject({ "api-key": options.apiKey });
    expect(JSON.parse(request.body as string)).toEqual({
      sender: { email: "tienda@example.invalid", name: "Gaesland" },
      to: [{ email: input.para }],
      subject: input.asunto,
      htmlContent: input.html,
      textContent: "Hola",
      replyTo: { email: "soporte@example.invalid" },
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("conserva las plantillas existentes y acepta remitente sin nombre", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ messageId: "<template>" }), { status: 201 }),
      );
    await new BrevoClient({
      ...options,
      remitenteDefault: "tienda@example.invalid",
    }).enviarPlantilla({
      para: input.para,
      plantilla: "pedido_confirmado",
      datos: { folioPublico: "GP-123", total: "398.00" },
    });
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
    expect(body.subject).toBe("Pedido GP-123 confirmado");
    expect(body.htmlContent).toContain("GP-123");
    expect(body.sender).toEqual({ email: "tienda@example.invalid" });
  });

  it.each(["", "stub-key"])("rechaza clave ausente o de prueba: %s", (apiKey) => {
    expect(() => new BrevoClient({ ...options, apiKey })).toThrow();
  });

  it("rechaza un remitente inválido antes de enviar", () => {
    expect(() => new BrevoClient({ ...options, remitenteDefault: "sin-correo" })).toThrow();
  });

  it("rechaza un destino inválido sin contactar al proveedor", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(
      new BrevoClient(options).enviar({ ...input, para: "invalido" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 429, 500])(
    "propaga HTTP %s sin revelar el cuerpo ni reintentar otro proveedor",
    async (status) => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(options.apiKey, { status }));
      await expect(new BrevoClient(options).enviar(input)).rejects.toMatchObject({
        code: "SEND_FAILED",
        message: `Brevo HTTP ${status}`,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([{}, { messageId: "" }, null])(
    "no declara éxito sin confirmación válida: %j",
    async (body) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(body), { status: 201 }),
      );
      await expect(new BrevoClient(options).enviar(input)).rejects.toMatchObject({
        code: "SEND_FAILED",
      });
    },
  );

  it("normaliza fallos de red sin revelar información sensible", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error(options.apiKey));
    await expect(new BrevoClient(options).enviar(input)).rejects.toMatchObject({
      code: "SEND_FAILED",
      message: "No se pudo confirmar el envío con Brevo",
    });
  });
});
