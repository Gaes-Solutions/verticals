import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { getClienteToken } from "@/lib/cliente";
import * as cancelacion from "../src/app/api/cuenta/pedidos/[folio]/cancelar/route";
import * as devolucion from "../src/app/api/cuenta/pedidos/[folio]/devoluciones/route";
const folio = "QA /1";
const context = () => ({ params: Promise.resolve({ folio }) });
const bodyCancel = { motivo: "Cambio de planes" };
const bodyReturn = {
  motivo: "defectuoso",
  descripcion: "Detalle QA",
  items: [{ varianteId: "v1", nombre: "Producto", cantidad: 1 }],
};
const req = (body: unknown) =>
  new Request("http://localhost/api/accion", { method: "POST", body: JSON.stringify(body) });
const pedido = { folioPublico: folio, statusPedido: "recibido", cancelacionAutomatica: true };
describe("customer order action boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("fixture-token");
  });
  afterEach(() => vi.unstubAllGlobals());
  for (const [name, route, body, confirmation] of [
    ["cancelar", cancelacion, bodyCancel, { folioPublico: folio, reembolsado: false }],
    ["devoluciones", devolucion, bodyReturn, { id: "s1", folio: "SD-QA", estado: "solicitada" }],
  ] as const) {
    it(`${name}: guest POST never reaches upstream`, async () => {
      vi.mocked(getClienteToken).mockResolvedValue(null);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const res = await route.POST(req(body), context());
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(fetch).not.toHaveBeenCalled();
    });
    it.each([{}, null, "gateway"])(`${name}: rejects malformed success %j`, async (data) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
      expect((await route.POST(req(body), context())).status).toBe(502);
    });
    it(`${name}: validates confirmation and forwards only allowed fields with shared deadline`, async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json(confirmation));
      vi.stubGlobal("fetch", fetch);
      const res = await route.POST(
        req({ ...body, clienteId: "foreign", autorTipo: "empleado" }),
        context(),
      );
      expect(res.status).toBe(200);
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
      expect(fetch.mock.calls[0][0]).toContain(`/QA%20%2F1/${name}`);
      expect(fetch.mock.calls[0][1]).toMatchObject({
        cache: "no-store",
        redirect: "error",
        signal: expect.any(AbortSignal),
      });
      expect(vi.mocked(getClienteToken).mock.calls[0]?.[0]).toBe(fetch.mock.calls[0][1].signal);
    });
    it(`${name}: network errors recover without leaking details`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network")));
      const res = await route.POST(req(body), context());
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("private network");
    });
    it.each([401, 403, 404, 409, 422, 429])(
      `${name}: preserves business/access status %i`,
      async (status) => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(Response.json({ message: "No disponible" }, { status })),
        );
        expect((await route.POST(req(body), context())).status).toBe(status);
      },
    );
  }
  it.each([{ motivo: " " }, { motivo: "a".repeat(501) }])(
    "invalid cancellation does not reach API",
    async (body) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect((await cancelacion.POST(req(body), context())).status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...bodyReturn, motivo: "inventado" },
    { ...bodyReturn, items: [] },
    { ...bodyReturn, descripcion: "x".repeat(1001) },
    { ...bodyReturn, items: [{ varianteId: "v1", nombre: "Producto", cantidad: 1.5 }] },
    { ...bodyReturn, items: [bodyReturn.items[0], bodyReturn.items[0]] },
  ])("invalid return does not reach API", async (body) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await devolucion.POST(req(body), context())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("wrong-order cancellation is never confirmed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ folioPublico: "OTHER", reembolsado: false })),
    );
    expect((await cancelacion.POST(req(bodyCancel), context())).status).toBe(502);
  });
  it.each([cancelacion, devolucion])("guest status checks never reach upstream", async (route) => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const res = await route.GET(req({}), context());
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["recibido", true, false, true],
    ["cancelado", true, true, false],
    ["enviado", true, false, false],
    ["recibido", false, false, false],
  ])(
    "cancellation status %s respects current eligibility",
    async (statusPedido, cancelacionAutomatica, confirmada, permitida) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(Response.json({ ...pedido, statusPedido, cancelacionAutomatica })),
      );
      const res = await cancelacion.GET(req({}), context());
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ folioPublico: folio, confirmada, permitida });
    },
  );
  it("return status scopes the result to this order", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...pedido, statusPedido: "entregado" }))
      .mockResolvedValueOnce(
        Response.json([
          { id: "s1", folio: "SD-OTHER", estado: "solicitada", pedido: { folioPublico: "OTHER" } },
        ]),
      );
    vi.stubGlobal("fetch", fetch);
    const res = await devolucion.GET(req({}), context());
    expect(await res.json()).toEqual({
      folioPublico: folio,
      confirmada: false,
      permitida: true,
      detalle: null,
    });
    expect(fetch.mock.calls[0][1].signal).toBe(fetch.mock.calls[1][1].signal);
  });
  it("existing return prevents another submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...pedido, statusPedido: "entregado" }))
        .mockResolvedValueOnce(
          Response.json([
            { id: "s1", folio: "SD-QA", estado: "solicitada", pedido: { folioPublico: folio } },
          ]),
        ),
    );
    const res = await devolucion.GET(req({}), context());
    expect(await res.json()).toMatchObject({
      confirmada: true,
      permitida: false,
      detalle: expect.stringContaining("En revisión"),
    });
  });
  it.each([{}, null, { ...pedido, folioPublico: "OTHER" }])(
    "invalid order status never unlocks a retry",
    async (data) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
      expect((await cancelacion.GET(req({}), context())).status).toBe(502);
    },
  );
  it("invalid return history never claims no existing request", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...pedido, statusPedido: "entregado" }))
        .mockResolvedValueOnce(Response.json({})),
    );
    expect((await devolucion.GET(req({}), context())).status).toBe(502);
  });
  it("ownership denial prevents reading return requests", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ message: "Not found" }, { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    expect((await devolucion.GET(req({}), context())).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
