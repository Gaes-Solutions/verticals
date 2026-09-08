import { ApiError, NetworkError } from "@gaespos/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const remote = vi.hoisted(() => ({
  latest: vi.fn(),
  lookup: vi.fn(),
  prepare: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("../src/services/checkout", () => ({
  latestCheckout: remote.latest,
  lookupCheckout: remote.lookup,
  prepareCheckout: remote.prepare,
  submitCheckout: remote.submit,
}));
vi.mock("../src/lib/cart-sync", () => ({ restoreRemoteCart: vi.fn() }));
import { deliveryContext, paymentOutcome, validCheckoutAddress } from "../src/lib/checkout-model";
import {
  checkoutBlocksCart,
  initiateCheckout,
  recoverCheckout,
  useCheckout,
} from "../src/lib/checkout-store";
const input = {
  carritoId: "cart-a",
  metodoPago: "spei" as const,
  metodoEnvio: "click_collect" as const,
  sucursalPickupId: "branch",
};
const result = {
  idempotencyKey: "stable-key",
  carritoId: "cart-a",
  folioPublico: "PED-1",
  total: "100.00",
  intentStatus: "pendiente",
  referenciaPago: "reference",
};
beforeEach(() => {
  useCheckout.getState().reset();
  for (const fn of Object.values(remote)) fn.mockReset();
  remote.latest.mockRejectedValue(new ApiError(404, "none"));
  remote.prepare.mockResolvedValue({ idempotencyKey: "stable-key", carritoId: "cart-a" });
  remote.submit.mockResolvedValue(result);
});
describe("delivery and payment confirmation", () => {
  const address = {
    nombre: "Ana",
    calle: "Calle",
    ciudad: "Ciudad",
    estado: "Jalisco",
    cp: "44100",
  };
  it("validates required shipping fields and postal code", () => {
    expect(validCheckoutAddress(address)).toBe(true);
    expect(validCheckoutAddress({ ...address, calle: " " })).toBe(false);
    expect(validCheckoutAddress({ ...address, cp: "1234" })).toBe(false);
  });
  it("invalidates delivery selection on cart quantity or postal code change", () => {
    expect(deliveryContext("a", 1, address)).not.toBe(deliveryContext("a", 2, address));
    expect(deliveryContext("a", 1, address)).not.toBe(
      deliveryContext("a", 1, { ...address, cp: "99999" }),
    );
  });
  it("requires server lookup confirmation and folio, never submission alone", () => {
    expect(paymentOutcome({ ...result, intentStatus: "confirmado" }, "submission")).toBe("pending");
    expect(paymentOutcome({ ...result, intentStatus: "confirmado" }, "lookup")).toBe("confirmed");
    expect(
      paymentOutcome({ ...result, intentStatus: "confirmado", folioPublico: "" }, "lookup"),
    ).toBe("pending");
  });
});
describe("safe checkout attempts", () => {
  it("locks edits from preparation through pending or failed payment for the same account", () => {
    const state = { owner: "a", busy: true, submitted: false, outcome: null };
    expect(checkoutBlocksCart(state, "a")).toBe(true);
    expect(checkoutBlocksCart(state, "b")).toBe(false);
    expect(checkoutBlocksCart({ ...state, busy: false, submitted: true, outcome: "pending" })).toBe(
      true,
    );
    expect(
      checkoutBlocksCart({ ...state, busy: false, submitted: true, outcome: "confirmed" }),
    ).toBe(false);
  });
  it("requires recovery before preparing payment", async () => {
    await initiateCheckout("a", input);
    expect(remote.prepare).not.toHaveBeenCalled();
  });
  it("uses the server-issued key and leaves payment pending", async () => {
    await recoverCheckout("a");
    await initiateCheckout("a", input);
    expect(remote.submit).toHaveBeenCalledWith({ ...input, idempotencyKey: "stable-key" });
    expect(useCheckout.getState()).toMatchObject({
      submitted: true,
      outcome: "pending",
      prepared: { idempotencyKey: "stable-key" },
    });
  });
  it("preserves key after an ambiguous response and only queries that attempt", async () => {
    await recoverCheckout("a");
    remote.submit.mockRejectedValue(new NetworkError());
    await initiateCheckout("a", input);
    remote.lookup.mockResolvedValue(result);
    await initiateCheckout("a", input);
    expect(remote.prepare).toHaveBeenCalledOnce();
    expect(remote.submit).toHaveBeenCalledOnce();
    expect(remote.lookup).toHaveBeenCalledWith("stable-key");
  });
  it("prevents repeated taps while preparing", async () => {
    await recoverCheckout("a");
    let resolve!: (value: { idempotencyKey: string; carritoId: string }) => void;
    remote.prepare.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const first = initiateCheckout("a", input);
    await initiateCheckout("a", input);
    resolve({ idempotencyKey: "stable-key", carritoId: "cart-a" });
    await first;
    expect(remote.prepare).toHaveBeenCalledOnce();
    expect(remote.submit).toHaveBeenCalledOnce();
  });
  it("does not submit if account changed during preparation", async () => {
    await recoverCheckout("a");
    let resolve!: (value: { idempotencyKey: string; carritoId: string }) => void;
    remote.prepare.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const first = initiateCheckout("a", input);
    useCheckout.getState().reset();
    await recoverCheckout("b");
    resolve({ idempotencyKey: "stable-key", carritoId: "cart-a" });
    await first;
    expect(remote.submit).not.toHaveBeenCalled();
    expect(useCheckout.getState().owner).toBe("b");
  });
  it("recovers latest attempt after process state was lost", async () => {
    remote.latest.mockResolvedValue(result);
    await recoverCheckout("a");
    expect(useCheckout.getState()).toMatchObject({
      recovered: true,
      submitted: true,
      prepared: { idempotencyKey: "stable-key" },
      outcome: "pending",
    });
  });
  it("does not enable a new payment when lookup is unavailable", async () => {
    remote.latest.mockRejectedValue(new NetworkError());
    await recoverCheckout("a");
    await initiateCheckout("a", input);
    expect(remote.prepare).not.toHaveBeenCalled();
  });
  it("ignores late lookup after logout and return to same account", async () => {
    let resolve!: (value: typeof result) => void;
    remote.latest.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = recoverCheckout("a");
    useCheckout.getState().reset();
    resolve(result);
    await pending;
    expect(useCheckout.getState()).toMatchObject({ owner: null, attempt: null });
  });
});
