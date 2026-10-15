import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: mock }));
import { actualizarPerfil, cambiarPassword } from "../src/services/cliente";
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());
it("keeps optional profile fields clearable and bounds the save request", async () => {
  mock.put.mockResolvedValue({ ok: true });
  await actualizarPerfil({ nombre: "Ana", apellidos: "", telefono: "" });
  expect(mock.put).toHaveBeenCalledWith(
    "/cliente-portal/me",
    { nombre: "Ana", apellidos: "", telefono: "" },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it("uses the same authenticated current/new password contract as the web", async () => {
  mock.post.mockResolvedValue({ ok: true });
  await cambiarPassword({ actual: "OldQA2026!", nueva: "NewQA2026!" });
  expect(mock.post).toHaveBeenCalledWith(
    "/cliente-portal/cambiar-password",
    { actual: "OldQA2026!", nueva: "NewQA2026!" },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it("aborts a stalled account change and permits the caller to recover", async () => {
  vi.useFakeTimers();
  mock.post.mockImplementation(
    (_path, _input, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  const action = cambiarPassword({ actual: "OldQA2026!", nueva: "NewQA2026!" });
  const assertion = expect(action).rejects.toThrow("aborted");
  await vi.advanceTimersByTimeAsync(15000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

import { ApiError, NetworkError } from "@gaespos/api-client";
import { passwordChangeError } from "../src/lib/account-errors";
it("explains a wrong current password without showing cart errors and marks uncertain outcomes", () => {
  expect(passwordChangeError(new ApiError(400, "technical backend message"))).toBe(
    "La contraseña actual no es correcta.",
  );
  expect(passwordChangeError(new NetworkError())).toContain("No pudimos confirmar");
});
