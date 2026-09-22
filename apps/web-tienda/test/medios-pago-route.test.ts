import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cliente", () => ({
  getClienteToken: vi.fn(),
}));

import { getClienteToken } from "@/lib/cliente";
import { DELETE } from "../src/app/api/cuenta/medios-pago/[id]/route";
import { GET, POST } from "../src/app/api/cuenta/medios-pago/route";

const MEDIO = { id: "cmp_1", marca: "visa", last4: "4242", expMes: 12, expAnio: 2028 };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/cuenta/medios-pago", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("BFF /api/cuenta/medios-pago", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it("GET invitado → 200 con lista vacía (sin sección, como otros bloques)", async () => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET con sesión devuelve las tarjetas enmascaradas del API", async () => {
    vi.mocked(getClienteToken).mockResolvedValue("token-1");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([MEDIO]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([MEDIO]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cliente-portal/medios-pago"),
      expect.objectContaining({ headers: { Authorization: "Bearer token-1" } }),
    );
  });

  it("POST invitado → 401 sin llamar al API", async () => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(postRequest({ cardTokenId: "tok_1" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST con sesión reenvía el cardTokenId al API", async () => {
    vi.mocked(getClienteToken).mockResolvedValue("token-1");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(MEDIO), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(postRequest({ cardTokenId: "tok_1" }));
    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cliente-portal/medios-pago"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ cardTokenId: "tok_1" }) }),
    );
  });

  it("DELETE invitado → 401 sin llamar al API", async () => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await DELETE(new Request("http://localhost/api/cuenta/medios-pago/cmp_1"), {
      params: Promise.resolve({ id: "cmp_1" }),
    });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DELETE con sesión propaga la baja al API", async () => {
    vi.mocked(getClienteToken).mockResolvedValue("token-1");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await DELETE(new Request("http://localhost/api/cuenta/medios-pago/cmp_1"), {
      params: Promise.resolve({ id: "cmp_1" }),
    });
    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cliente-portal/medios-pago/cmp_1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
