import { afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
import { deliveryOptions, prepareCheckout, submitCheckout } from "../src/services/checkout";
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
it("queries pickup without inventing an address and encodes shipping inputs", async () => {
  api.get.mockResolvedValue({ pickup: [], opcionesEnvio: [] });
  await deliveryOptions("cart a", "", "");
  expect(api.get).toHaveBeenCalledWith(
    "/cliente-portal/comercio/envios?carritoId=cart%20a",
    expect.anything(),
  );
  await deliveryOptions("cart", "44100", "Estado & otro");
  expect(api.get).toHaveBeenCalledWith(
    "/cliente-portal/comercio/envios?carritoId=cart&cp=44100&estado=Estado%20%26%20otro",
    expect.anything(),
  );
});
it("separates preparation from submission and sends no client-supplied price or identity", async () => {
  api.post.mockResolvedValue({ idempotencyKey: "key", carritoId: "cart" });
  await prepareCheckout("cart");
  expect(api.post).toHaveBeenCalledWith(
    "/cliente-portal/comercio/checkout/preparar",
    { carritoId: "cart" },
    expect.anything(),
  );
  const input = {
    carritoId: "cart",
    idempotencyKey: "key",
    metodoPago: "spei" as const,
    metodoEnvio: "click_collect" as const,
    sucursalPickupId: "branch",
  };
  await submitCheckout(input);
  expect(api.post).toHaveBeenCalledWith(
    "/cliente-portal/comercio/checkout",
    input,
    expect.anything(),
  );
});
it("bounds preparation timeout and leaves retry handling to the attempt controller", async () => {
  vi.useFakeTimers();
  api.post.mockImplementation(
    (_path: string, _body: unknown, { signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("timeout"))),
      ),
  );
  const pending = prepareCheckout("cart");
  const assertion = expect(pending).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(12_000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
