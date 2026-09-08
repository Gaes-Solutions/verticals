import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
import { GET } from "../src/app/api/envios/route";
import { api } from "../src/lib/api";

const request = () =>
  new NextRequest("http://localhost/api/envios?cp=06000&estado=Ciudad%20de%20Mexico&subtotal=150");

beforeEach(() => vi.resetAllMocks());

describe("cotización pública de entrega", () => {
  it("devuelve 503 sin filtrar detalles internos ni simular cobertura vacía", async () => {
    vi.mocked(api).mockRejectedValue(new Error("upstream credentials and internal detail"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: "No se pudo consultar la entrega. Reintenta en unos momentos.",
    });
  });

  it("conserva una cotización válida y las opciones de recogida", async () => {
    const quote = {
      opcionesEnvio: [{ tarifaId: "rate1", costo: "75.00", gratis: false }],
      pickup: [{ sucursalId: "branch1" }],
    };
    vi.mocked(api).mockResolvedValue(quote);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(quote);
    expect(api).toHaveBeenCalledWith(
      "/envios/cotizar?subtotal=150&cp=06000&estado=Ciudad+de+Mexico",
    );
  });

  it("distingue ausencia real de cobertura de un fallo del servicio", async () => {
    vi.mocked(api).mockResolvedValue({ opcionesEnvio: [], pickup: [] });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ opcionesEnvio: [], pickup: [] });
  });
});
