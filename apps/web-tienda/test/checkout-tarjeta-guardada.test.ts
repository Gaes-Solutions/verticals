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

import { ApiError, api } from "@/lib/api";
import { checkoutIdentity, sameOriginRequest } from "@/lib/checkout-session";
import { POST } from "../src/app/api/checkout/route";

const BASE_BODY = {
  checkoutContext: "ctx",
  idempotencyKey: "key",
  emailComprador: "comprador@correo.mx",
  items: [{ varianteId: "v1", cantidad: 1 }],
  metodoEnvio: "paqueteria",
  metodoPago: "tarjeta",
};

const SESION = { token: "token-1", cliente: { id: "cli_1" } };
const MEDIO_NUEVO = { id: "cmp_9", marca: "visa", last4: "4242", expMes: 12, expAnio: 2028 };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

/** api() del BFF: primer recovery 404, luego carrito/iniciar/recovery según path. */
function mockApiFlujo(finalStatus = "confirmado") {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path === "/checkout/intentos/key") {
      return { folioPublico: "GP-1", intentId: "ord_1", total: "10.00", intentStatus: finalStatus };
    }
    if (path === "/tienda") return { id: "cart_1" };
    if (path === "/checkout/tienda/iniciar") {
      return {
        folioPublico: "GP-1",
        intentId: "ord_1",
        total: "10.00",
        intentStatus: "confirmado",
      };
    }
    throw new Error(`api() inesperado: ${path}`);
  });
  // El primer recovery (replay) debe 404 para que el flujo continúe al cobro.
  vi.mocked(api).mockRejectedValueOnce(new ApiError(404));
}

function mockGuardadoExitoso() {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(MEDIO_NUEVO), { status: 201 }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(sameOriginRequest).mockReturnValue(true);
});

describe("POST /api/checkout — tarjeta guardada y guardar tarjeta", () => {
  it("pagar con tarjeta guardada requiere sesión de cliente", async () => {
    vi.mocked(checkoutIdentity).mockResolvedValue({
      session: null,
      key: "key",
      context: "ctx",
    } as never);
    const res = await POST(request({ ...BASE_BODY, medioPagoGuardadoId: "cmp_1" }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/Inicia sesión/);
    expect(api).not.toHaveBeenCalled();
  });

  it("guardar tarjeta requiere sesión de cliente", async () => {
    vi.mocked(checkoutIdentity).mockResolvedValue({
      session: null,
      key: "key",
      context: "ctx",
    } as never);
    const res = await POST(request({ ...BASE_BODY, cardTokenId: "tok_1", guardarTarjeta: true }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/Inicia sesión/);
    expect(api).not.toHaveBeenCalled();
  });

  it("guardar tarjeta solo aplica con tarjeta nueva (no con una guardada)", async () => {
    vi.mocked(checkoutIdentity).mockResolvedValue({
      session: SESION,
      key: "key",
      context: "ctx",
    } as never);
    const res = await POST(
      request({ ...BASE_BODY, medioPagoGuardadoId: "cmp_1", guardarTarjeta: true }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).message).toMatch(/tarjeta nueva/);
    expect(api).not.toHaveBeenCalled();
  });

  it("guarda ANTES del cobro y cobra con la tarjeta recién guardada", async () => {
    vi.mocked(checkoutIdentity).mockResolvedValue({
      session: SESION,
      key: "key",
      context: "ctx",
    } as never);
    mockApiFlujo();
    const fetchMock = mockGuardadoExitoso();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ ...BASE_BODY, cardTokenId: "tok_1", guardarTarjeta: true }));

    expect(res.status).toBe(200);
    // 1) Se guardó la tarjeta con el token, con la sesión del comprador.
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cliente-portal/medios-pago"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: `Bearer ${SESION.token}` }),
        body: JSON.stringify({ cardTokenId: "tok_1" }),
      }),
    );
    // 2) El cobro salió con medioPagoGuardadoId (fuente guardada), no con el token.
    const iniciar = vi
      .mocked(api)
      .mock.calls.find(([path]) => path === "/checkout/tienda/iniciar")?.[1];
    expect(iniciar?.body).toMatchObject({
      proveedorPago: "conekta",
      medioPagoGuardadoId: MEDIO_NUEVO.id,
    });
    expect(iniciar?.body).not.toHaveProperty("cardTokenId");
    // 3) El guardado ocurrió antes de iniciar el cobro.
    const ordenGuardado = fetchMock.mock.invocationCallOrder[0] ?? 0;
    const ordenIniciar = vi
      .mocked(api)
      .mock.calls.findIndex(([path]) => path === "/checkout/tienda/iniciar");
    expect(ordenGuardado).toBeGreaterThan(0);
    expect(ordenIniciar).toBeGreaterThan(-1);
  });

  it("revierte el guardado si el cobro queda fallido", async () => {
    vi.mocked(checkoutIdentity).mockResolvedValue({
      session: SESION,
      key: "key",
      context: "ctx",
    } as never);
    mockApiFlujo("fallido");
    const fetchMock = mockGuardadoExitoso();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ ...BASE_BODY, cardTokenId: "tok_1", guardarTarjeta: true }));

    expect(res.status).toBe(200);
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes(`/cliente-portal/medios-pago/${MEDIO_NUEVO.id}`) &&
          (init as RequestInit).method === "DELETE",
      ),
    ).toBe(true);
  });

  it("pagar con tarjeta guardada existente reenvía su id al iniciar", async () => {
    vi.mocked(checkoutIdentity).mockResolvedValue({
      session: SESION,
      key: "key",
      context: "ctx",
    } as never);
    mockApiFlujo();
    const res = await POST(request({ ...BASE_BODY, medioPagoGuardadoId: "cmp_1" }));
    expect(res.status).toBe(200);
    const iniciar = vi
      .mocked(api)
      .mock.calls.find(([path]) => path === "/checkout/tienda/iniciar")?.[1];
    expect(iniciar?.body).toMatchObject({
      proveedorPago: "conekta",
      medioPagoGuardadoId: "cmp_1",
    });
    expect(iniciar?.body).not.toHaveProperty("cardTokenId");
  });
});
