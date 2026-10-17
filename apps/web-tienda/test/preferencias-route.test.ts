import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import * as resenas from "../src/app/api/cuenta/resenas/route";
import { DELETE } from "../src/app/api/cuenta/wishlist/[itemId]/route";
import * as favoritos from "../src/app/api/cuenta/wishlist/route";
import { getClienteToken } from "../src/lib/cliente";
const request = (body: unknown) =>
  new Request("http://localhost/api/qa", { method: "POST", body: JSON.stringify(body) });
const ctx = () => ({ params: Promise.resolve({ itemId: "QA /1" }) });
const review = {
  pedidoId: "order",
  productoPublicadoId: "product",
  rating: 4,
  comentario: "Compra QA",
};
describe("favorites and reviews response boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClienteToken).mockResolvedValue("fixture-token");
  });
  afterEach(() => vi.unstubAllGlobals());
  for (const [name, route, body, valid] of [
    ["wishlist", favoritos, { productoPublicadoId: "product" }, { itemId: "w1" }],
    ["reviews", resenas, review, { resenaId: "r1", estado: "pendiente" }],
  ] as const) {
    it(`${name} rejects guests privately`, async () => {
      vi.mocked(getClienteToken).mockResolvedValue(null);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const res = await route.POST(request(body));
      expect(res.status).toBe(401);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(fetch).not.toHaveBeenCalled();
    });
    it.each([{}, null, { message: "ok" }])(
      `${name} rejects malformed successful receipts`,
      async (data) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
        expect((await route.POST(request(body))).status).toBe(502);
      },
    );
    it(`${name} confirms a real receipt and strips supplied identity/moderation fields`, async () => {
      const fetch = vi.fn().mockResolvedValue(Response.json(valid, { status: 201 }));
      vi.stubGlobal("fetch", fetch);
      const res = await route.POST(
        request({ ...body, clienteId: "foreign", estado: "aprobada", verificadaPorCompra: true }),
      );
      expect(res.status).toBe(201);
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
      expect(fetch.mock.calls[0][1]).toMatchObject({
        redirect: "error",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      });
      expect(vi.mocked(getClienteToken).mock.calls[0]?.[0]).toBe(fetch.mock.calls[0][1].signal);
    });
    it(`${name} recovers from network failures`, async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private")));
      const res = await route.POST(request(body));
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("private");
    });
  }
  it("requires actual 204 before confirming deletion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    expect((await DELETE(request({}), ctx())).status).toBe(502);
  });
  it("escapes deletion IDs and returns a private 204", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const res = await DELETE(request({}), ctx());
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(fetch.mock.calls[0][0]).toContain("QA%20%2F1");
  });
  it.each([
    { ...review, rating: 0 },
    { ...review, rating: 1.5 },
    { ...review, comentario: "a".repeat(2001) },
    { ...review, imagenes: ["https://untrusted.invalid/image.svg"] },
  ])("rejects invalid review before upstream", async (body) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await resenas.POST(request(body))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  for (const route of [favoritos, resenas]) {
    it("GET requires a verified session", async () => {
      vi.mocked(getClienteToken).mockResolvedValue(null);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect((await route.GET(request({}))).status).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    });
    it.each([{}, null, [{}]].map((data) => ({ data })))(
      "GET rejects incomplete lists",
      async ({ data }) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
        expect((await route.GET(request({}))).status).toBe(502);
      },
    );
    it("GET accepts verified empty lists without inferring a write", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([])));
      const res = await route.GET(request({}));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.json()).toEqual([]);
    });
  }
  it.each([401, 403, 404, 409, 429])(
    "preserves access/rate status %i without exposing private upstream content",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ message: "private" }, { status })),
      );
      const res = await favoritos.POST(request({ productoPublicadoId: "p1" }));
      expect(res.status).toBe(status);
      expect(await res.text()).not.toContain("private");
    },
  );
  it("validates complete wishlist lists with nullable variants", async () => {
    const row = {
      itemId: "w1",
      productoPublicadoId: "p1",
      varianteId: null,
      tituloPublico: "Producto",
      slugSeo: "producto",
      precio: "10.50",
      foto: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([row])));
    expect((await favoritos.GET(request({}))).status).toBe(200);
  });
  it("rejects duplicate wishlist IDs and invalid prices", async () => {
    const row = {
      itemId: "w1",
      productoPublicadoId: "p1",
      varianteId: null,
      tituloPublico: "Producto",
      slugSeo: "producto",
      precio: "NaN",
      foto: null,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([row, row])));
    expect((await favoritos.GET(request({}))).status).toBe(502);
  });
  it("validates purchase-linked review status lists", async () => {
    const row = {
      pedidoId: "order",
      productoPublicadoId: "product",
      folioPublico: "QA",
      tituloPublico: "Producto",
      slugSeo: "producto",
      yaResenado: true,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json([row])));
    expect((await resenas.GET(request({}))).status).toBe(200);
  });
  it("rejects invalid JSON without contacting upstream", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (await resenas.POST(new Request("http://localhost/api", { method: "POST", body: "{" })))
        .status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
