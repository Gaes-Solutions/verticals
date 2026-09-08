import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiError } from "./errors";
const client = createApiClient({ baseUrl: "https://api.example.test", getToken: async () => null });
afterEach(() => vi.unstubAllGlobals());
describe("public error contract", () => {
  it.each([500, 502, 503])("hides internal error messages on %s", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: "SQL password=private" }), { status }),
        ),
    );
    await expect(client.get("/test")).rejects.toMatchObject({
      status,
      message: "El servicio no está disponible. Intenta nuevamente.",
    });
  });
  it("preserves short validation errors and rejects malformed error metadata", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Caja cerrada", code: "CLOSED" }), { status: 409 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { secret: "private" }, code: {} }), { status: 400 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(client.get("/test")).rejects.toMatchObject({
      message: "Caja cerrada",
      code: "CLOSED",
    });
    await expect(client.get("/test")).rejects.toMatchObject({
      message: "No se pudo completar la solicitud (400)",
    });
  });
  it("does not treat invalid successful JSON as empty data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>proxy</html>", { status: 200 })),
    );
    await expect(client.get("/test")).rejects.toBeInstanceOf(ApiError);
  });
  it("accepts a deliberate no-content response without retrying mutations", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    expect(await client.del("/test")).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
