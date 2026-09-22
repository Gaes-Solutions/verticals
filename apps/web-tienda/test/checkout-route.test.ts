import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  getTiendaConfig: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public readonly statusCode: number,
      public readonly code?: string,
    ) {
      super("No se pudo completar la solicitud al servicio.");
      this.name = "ApiError";
    }
  },
}));

vi.mock("@/lib/checkout-session", () => ({
  sameOriginRequest: vi.fn(),
  checkoutIdentity: vi.fn(),
}));

import { getTiendaConfig } from "@/lib/api";
import { checkoutIdentity, sameOriginRequest } from "@/lib/checkout-session";
import { POST } from "../src/app/api/checkout/route";

const BASE_BODY = {
  checkoutContext: "ctx",
  idempotencyKey: "key",
  emailComprador: "comprador@correo.mx",
  items: [{ varianteId: "v1", cantidad: 1 }],
  metodoEnvio: "paqueteria",
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(sameOriginRequest).mockReturnValue(true);
  // Tras pasar la validación del método, la identidad de sesión falla en el
  // entorno de test: basta para comprobar que el flujo llegó a ese punto.
  vi.mocked(checkoutIdentity).mockRejectedValue(new Error("sin sesión en test"));
});

describe("POST /api/checkout — método de pago", () => {
  it("rechaza OXXO con 422 si la tienda no lo ofrece", async () => {
    vi.mocked(getTiendaConfig).mockResolvedValue({ metodosPago: ["tarjeta"] } as never);
    const res = await POST(request({ ...BASE_BODY, metodoPago: "oxxo" }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/no está disponible en esta tienda/);
    expect(checkoutIdentity).not.toHaveBeenCalled();
  });

  it("rechaza SPEI con 422 si la tienda no lo ofrece", async () => {
    vi.mocked(getTiendaConfig).mockResolvedValue({ metodosPago: ["tarjeta", "oxxo"] } as never);
    const res = await POST(request({ ...BASE_BODY, metodoPago: "spei" }));
    expect(res.status).toBe(422);
    expect(checkoutIdentity).not.toHaveBeenCalled();
  });

  it("deja pasar OXXO/SPEI cuando la tienda los anuncia", async () => {
    vi.mocked(getTiendaConfig).mockResolvedValue({
      metodosPago: ["oxxo", "spei", "tarjeta"],
    } as never);
    for (const metodoPago of ["oxxo", "spei"] as const) {
      const res = await POST(request({ ...BASE_BODY, metodoPago }));
      expect(res.status).not.toBe(422);
      expect(checkoutIdentity).toHaveBeenCalled();
    }
  });

  it("sin metodoPago asume tarjeta y no consulta la config", async () => {
    const res = await POST(request(BASE_BODY));
    expect(getTiendaConfig).not.toHaveBeenCalled();
    expect(checkoutIdentity).toHaveBeenCalled();
    expect(res.status).not.toBe(422);
  });

  it("rechaza métodos que el BFF no acepta (p. ej. transferencia)", async () => {
    const res = await POST(request({ ...BASE_BODY, metodoPago: "transferencia" }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/no soportado/);
    expect(getTiendaConfig).not.toHaveBeenCalled();
    expect(checkoutIdentity).not.toHaveBeenCalled();
  });

  it("exige origen permitido antes de cualquier validación", async () => {
    vi.mocked(sameOriginRequest).mockReturnValue(false);
    const res = await POST(request({ ...BASE_BODY, metodoPago: "oxxo" }));
    expect(res.status).toBe(403);
    expect(getTiendaConfig).not.toHaveBeenCalled();
    expect(checkoutIdentity).not.toHaveBeenCalled();
  });
});
