import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", async (original) => ({
  ...(await original<typeof import("../src/lib/cliente")>()),
  getClienteSession: vi.fn(),
}));
import { GET } from "../src/app/api/cuenta/repetir-pedido/route";
import { ClienteSessionError, getClienteSession } from "../src/lib/cliente";
import {
  combinarPedido,
  leerPedidoRepetible,
  ultimoPedidoRepetible,
} from "../src/lib/repetir-pedido-contract";
const item = { varianteId: "qa-v", nombre: "Producto QA", cantidad: 0.2 };
const pedido = {
  folioPublico: "PED-QA",
  items: [item],
  statusPedido: "entregado",
  cancelado: false,
  total: "100",
  direccionEnvio: { calle: "PRIVATE" },
};
const cuenta = {
  token: "fixture-token",
  cliente: { id: "qa-customer", nombre: "QA", email: null, tenantSlug: "qa-store" },
};
const owner = JSON.stringify(["qa-store", "qa-customer"]);
const req = (query = "", signal?: AbortSignal) =>
  new Request(`https://store.test/api/cuenta/repetir-pedido${query}`, { signal });
const order = (folio = "PED-QA", status = "entregado", date = "2026-10-01T10:00:00Z") => ({
  folioPublico: folio,
  statusPedido: status,
  createdAt: date,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getClienteSession).mockResolvedValue(cuenta);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("repeat order selection and atomic merge", () => {
  it("chooses only the most recent delivered/collected order without sorting caller data", () => {
    const list = [
      order("PED-1"),
      order("PED-2", "recogido", "2026-10-03"),
      order("PED-3", "cancelado", "2026-10-04"),
    ];
    expect(ultimoPedidoRepetible(list)).toBe("PED-2");
    expect(list[0].folioPublico).toBe("PED-1");
    expect(ultimoPedidoRepetible([order("PED-4", "recibido")])).toBeNull();
    expect(ultimoPedidoRepetible([])).toBeNull();
  });
  it.each([
    null,
    {},
    Array(101).fill(order()),
    [order("../x")],
    [{ ...order(), createdAt: "invalid" }],
    [null],
  ])("rejects an invalid order list %#", (value) =>
    expect(ultimoPedidoRepetible(value)).toBeUndefined(),
  );
  it("strips all private details and old prices, consolidating fractional duplicate variants exactly", () => {
    expect(
      leerPedidoRepetible({
        ...pedido,
        items: [{ ...item, cantidad: 0.1, precioUnitario: "1" }, item],
      }),
    ).toEqual({ folioPublico: "PED-QA", items: [{ ...item, cantidad: 0.3 }] });
  });
  it.each([
    null,
    {},
    { ...pedido, folioPublico: "../x" },
    { ...pedido, items: [] },
    { ...pedido, items: Array(101).fill(item) },
    ...[0, -1, 100001, 0.0001, "2", null, Number.POSITIVE_INFINITY].map((cantidad) => ({
      ...pedido,
      items: [{ ...item, cantidad }],
    })),
    { ...pedido, items: [{ ...item, nombre: " " }] },
    {
      ...pedido,
      items: [
        { ...item, cantidad: 60000 },
        { ...item, cantidad: 60000 },
      ],
    },
  ])("rejects an unsafe complete detail %#", (value) =>
    expect(leerPedidoRepetible(value)).toBeNull(),
  );
  it("computes a single complete snapshot, retaining existing product metadata and never mutating the original", () => {
    const base = [
      {
        varianteId: "qa-v",
        titulo: "Nombre actual",
        cantidad: 0.1,
        precio: "3",
        slugSeo: "actual",
        imagenUrl: "/image",
      },
    ];
    const before = structuredClone(base);
    expect(combinarPedido(base, [item, { ...item, varianteId: "qa-new" }])).toEqual([
      { ...base[0], cantidad: 0.3 },
      { varianteId: "qa-new", titulo: item.nombre, cantidad: 0.2, precio: "0" },
    ]);
    expect(base).toEqual(before);
  });
  it("rejects quantity overflow and carts over 100 unique lines before any write", () => {
    expect(
      combinarPedido([{ varianteId: "qa-v", titulo: "QA", cantidad: 100000, precio: "1" }], [item]),
    ).toBeNull();
    const base = Array.from({ length: 100 }, (_, i) => ({
      varianteId: `qa-${i}`,
      titulo: "QA",
      cantidad: 1,
      precio: "1",
    }));
    expect(combinarPedido(base, [item])).toBeNull();
  });
});
describe("private repeat read boundary", () => {
  const fixture = () =>
    vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([order()])))
      .mockResolvedValueOnce(new Response(JSON.stringify(pedido)));
  it("reads only with the verified account, bounds all reads together and filters the receipt", async () => {
    const fetch = fixture();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(req());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      owner,
      pedido: { folioPublico: "PED-QA", items: [item] },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetch.mock.calls) {
      expect(url).toContain("/cliente-portal/pedidos");
      expect(options.headers).toEqual({ Authorization: "Bearer fixture-token" });
      expect(options.signal).toBe(vi.mocked(getClienteSession).mock.calls[0][0]);
      expect(options.redirect).toBe("error");
      expect(options.method).toBeUndefined();
    }
  });
  it("session-only confirmation performs no order lookup and never trusts caller ownership", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await (await GET(req(`?sesion=1&owner=${encodeURIComponent(owner)}`))).json()).toEqual({
      owner,
    });
    const response = await GET(req("?sesion=1&owner=another-account"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "SESSION_CHANGED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns no order for a buyer with no delivered purchases", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([order("PED-1", "cancelado")])));
    vi.stubGlobal("fetch", fetch);
    expect(await (await GET(req())).json()).toEqual({ owner, pedido: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...pedido, folioPublico: "OTHER" },
    { ...pedido, cancelado: true },
    { ...pedido, statusPedido: "cancelado" },
    { ...pedido, items: [] },
    { ...pedido, items: [{ ...item, cantidad: -1 }] },
  ])("does not preview a different, changed or invalid order %#", async (detail) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify([order()])))
        .mockResolvedValueOnce(new Response(JSON.stringify(detail))),
    );
    expect((await GET(req())).status).toBe(502);
  });
  it("does not access orders without a buyer session", async () => {
    vi.mocked(getClienteSession).mockResolvedValue(null);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await GET(req());
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("private");
  });
  it.each([401, 403, 404, 429, 500])("redacts upstream failure %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("PRIVATE", { status })));
    const response = await GET(req());
    expect(response.status).toBe(status === 500 ? 503 : status);
    expect(await response.text()).not.toContain("PRIVATE");
  });
  it("redacts session and transport details and does not confirm an aborted request", async () => {
    vi.mocked(getClienteSession).mockRejectedValue(new ClienteSessionError(403, "PRIVATE"));
    const denied = await GET(req());
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain("PRIVATE");
    vi.mocked(getClienteSession).mockResolvedValue(cuenta);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE")));
    expect((await GET(req())).status).toBe(503);
    expect((await GET(req("", AbortSignal.abort()))).status).toBe(503);
  });
});
