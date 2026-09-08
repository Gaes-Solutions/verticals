import { ApiError, NetworkError } from "@gaespos/api-client";
import { describe, expect, it, vi } from "vitest";
import { activateKiosk, kioskFailure } from "../src/lib/recovery";

describe("kiosk recovery", () => {
  it.each([401, 403])("requires manager recovery on %s", (status) => {
    expect(kioskFailure(new ApiError(status, "secret server details")).kind).toBe("authorization");
  });
  it("distinguishes network failure from unavailable service without exposing internals", () => {
    expect(kioskFailure(new NetworkError()).kind).toBe("connection");
    for (const status of [404, 429, 500, 503]) {
      const result = kioskFailure(new ApiError(status, "secret server details"));
      expect(result.kind).toBe("service");
      expect(result.message).not.toContain("secret");
      expect(result.message).not.toContain("Producto no encontrado");
    }
  });
  it("does not replace the working token when validation fails", async () => {
    const save = vi.fn();
    await expect(
      activateKiosk(
        " invalid ",
        async () => {
          throw new ApiError(401, "revoked");
        },
        save,
      ),
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });
  it("waits for validation before persisting a normalized token", async () => {
    const calls: string[] = [];
    await activateKiosk(
      " tenant.token ",
      async (token) => {
        calls.push(`validate:${token}`);
      },
      async (token) => {
        calls.push(`save:${token}`);
      },
    );
    expect(calls).toEqual(["validate:tenant.token", "save:tenant.token"]);
  });
  it("propagates secure storage failures and refuses empty tokens", async () => {
    const validate = vi.fn();
    const save = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    await expect(activateKiosk(" ", validate, save)).rejects.toThrow();
    expect(validate).not.toHaveBeenCalled();
    await expect(activateKiosk("tenant.token", validate, save)).rejects.toThrow(
      "storage unavailable",
    );
  });
});
