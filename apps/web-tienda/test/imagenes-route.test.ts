import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiRaw: vi.fn() }));
import { GET } from "../src/app/tienda/imagenes/[id]/route";
import { apiRaw } from "../src/lib/api";

const pedir = (id: string) =>
  GET(new Request(`http://tienda.local/tienda/imagenes/${id}`), {
    params: Promise.resolve({ id }),
  });

const foto = () =>
  new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
    headers: { "content-type": "image/png", "content-length": "4" },
  });

beforeEach(() => vi.resetAllMocks());

describe("fotos del catálogo en la tienda", () => {
  it("entrega la foto del API con caché larga", async () => {
    vi.mocked(apiRaw).mockResolvedValue(foto());
    const res = await pedir("6f1a2b3c4d5e6f70");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    );
  });

  it("no consulta el API con un id que no tiene forma de id", async () => {
    const res = await pedir("..%2Fetc%2Fpasswd");
    expect(res.status).toBe(404);
    expect(apiRaw).not.toHaveBeenCalled();
  });

  it("no inventa una imagen cuando el API no la tiene", async () => {
    vi.mocked(apiRaw).mockResolvedValue(new Response(null, { status: 404 }));
    expect((await pedir("6f1a2b3c4d5e6f70")).status).toBe(404);
  });

  it("distingue el API caído de una foto faltante", async () => {
    vi.mocked(apiRaw).mockRejectedValue(new Error("conexión rechazada"));
    expect((await pedir("6f1a2b3c4d5e6f70")).status).toBe(502);
  });
});
