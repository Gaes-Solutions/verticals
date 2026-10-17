import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", async (original) => ({
  ...(await original<typeof import("../src/lib/cliente")>()),
  getClienteSession: vi.fn(),
}));
import { GET, POST } from "../src/app/api/cuenta/carrito/route";
import { getClienteSession } from "../src/lib/cliente";
const owner = JSON.stringify(["shop-a", "customer-a"]);
const fetchMock = vi.fn();
const request = (body?: unknown, origin = "http://localhost") =>
  new NextRequest("http://localhost/api/cuenta/carrito", {
    method: body ? "POST" : "GET",
    headers: { host: "localhost", origin, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(getClienteSession).mockResolvedValue({
    token: "private-customer-token",
    cliente: { id: "customer-a", tenantSlug: "shop-a" },
  } as never);
});
afterEach(() => vi.unstubAllGlobals());
it("requires a verified customer session", async () => {
  vi.mocked(getClienteSession).mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("returns an empty account cart only for an upstream 404", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ message: "missing" }), { status: 404 }),
  );
  const response = await GET(request());
  expect(await response.json()).toEqual({ owner, cart: null });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects cross-origin writes, changed accounts and missing version before upstream mutation", async () => {
  expect(
    (await POST(request({ owner, items: [], expectedVersion: null }, "https://attacker.example")))
      .status,
  ).toBe(403);
  expect(
    (await POST(request({ owner: "another-account", items: [], expectedVersion: null }))).status,
  ).toBe(409);
  expect((await POST(request({ owner, items: [] }))).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("uses cookie identity and forwards only cart contents and expected version", async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        id: "cart",
        version: "new",
        cuponCodigo: null,
        items: [
          { varianteId: "v", cantidad: "2.000", nombre: "Producto", precioUnitario: "10.00" },
        ],
      }),
    ),
  );
  const items = [{ varianteId: "v", cantidad: 2 }];
  const response = await POST(
    request({
      owner,
      expectedVersion: "old",
      items,
      clienteId: "forged",
      tenantSlug: "forged",
      total: 0,
    }),
  );
  expect(response.status).toBe(200);
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  expect(url).toContain("/cliente-portal/comercio/carrito");
  expect(init.headers.Authorization).toBe("Bearer private-customer-token");
  expect(JSON.parse(init.body)).toEqual({ expectedVersion: "old", items });
});
it("preserves a version conflict so the browser can recover without overwriting", async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ code: "CART_CHANGED", message: "changed" }), { status: 409 }),
  );
  const response = await POST(request({ owner, expectedVersion: "old", items: [] }));
  expect(response.status).toBe(409);
  expect((await response.json()).code).toBe("CART_CHANGED");
});
it("maps the empty-cart 204 response to a JSON result for the browser", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  const response = await POST(request({ owner, expectedVersion: "old", items: [] }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ owner, cart: null });
});
it.each([
  "null",
  "{}",
  '{"version":"v1","cuponCodigo":null,"items":[{"varianteId":"v","cantidad":"NaN","nombre":"Producto","precioUnitario":"10"}]}',
])("rejects an invalid successful cart response %s", async (body) => {
  fetchMock.mockResolvedValue(new Response(body));
  expect((await GET(request())).status).toBe(502);
});
it("does not discard pending nonempty edits for an unexpected 204", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  expect(
    (
      await POST(
        request({ owner, expectedVersion: "old", items: [{ varianteId: "v", cantidad: 1 }] }),
      )
    ).status,
  ).toBe(502);
});
