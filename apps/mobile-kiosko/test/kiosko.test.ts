import { ApiError } from "@gaespos/api-client";
import { afterEach, describe, expect, it, vi } from "vitest";
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));
import { getIdle, getPrecio, validateKioskoToken } from "../src/services/kiosko";

const validConfig = {
  reposoSegundos: 20,
  precioSegundos: 8,
  slideSegundos: 6,
  contenidoReposo: "ambos",
  mostrarExistencia: true,
  sonidoBeep: false,
  mensajeBienvenida: "Bienvenido",
  colorAcento: "#4f46e5",
  idioma: "es",
};

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("kiosk transport", () => {
  it("validates using the proposed token instead of overwriting current credentials", async () => {
    get.mockResolvedValue(validConfig);
    await validateKioskoToken("tenant.proposed");
    expect(get).toHaveBeenCalledWith(
      "/kiosko/config",
      expect.objectContaining({ token: "tenant.proposed", signal: expect.any(AbortSignal) }),
    );
  });
  it("only returns not found when the API explicitly says so", async () => {
    get.mockResolvedValue({ encontrado: false });
    expect(await getPrecio("a/b")).toEqual({ encontrado: false });
    expect(get).toHaveBeenCalledWith("/kiosko/precio/a%2Fb", expect.anything());
    for (const response of [
      null,
      {},
      { encontrado: true },
      { encontrado: true, precioVigente: "oops" },
      { encontrado: true, precioVigente: "" },
      { encontrado: true, precioVigente: " " },
      { encontrado: true, precioVigente: "-1.00" },
    ]) {
      get.mockResolvedValue(response);
      await expect(getPrecio("code")).rejects.toThrow();
    }
  });
  it("maps lookup 404 to missing product but propagates revoked token and server failure", async () => {
    get.mockRejectedValue(new ApiError(404, "Sin coincidencia"));
    expect(await getPrecio("missing")).toEqual({ encontrado: false });
    for (const status of [401, 403, 500]) {
      get.mockRejectedValue(new ApiError(status, "Error"));
      await expect(getPrecio("code")).rejects.toThrow();
    }
    get.mockRejectedValue(new ApiError(404, "Endpoint missing"));
    await expect(validateKioskoToken("token")).rejects.toThrow();
  });
  it("aborts a stalled request so a disconnected kiosk can recover", async () => {
    vi.useFakeTimers();
    get.mockImplementation(
      (_path: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    const pending = getPrecio("code");
    const assertion = expect(pending).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("idle content", () => {
  it("rejects malformed slides instead of crashing or hiding a service failure", async () => {
    for (const response of [
      {},
      { slides: null },
      { slides: {} },
      { slides: [null] },
      { slides: [{ tipo: "promo", titulo: {}, imagen: null }] },
    ]) {
      get.mockResolvedValue(response);
      await expect(getIdle()).rejects.toThrow();
    }
  });
  it("accepts an explicit empty list and valid public slides", async () => {
    for (const slides of [
      [],
      [{ tipo: "promo", titulo: "Prueba", imagen: null, texto: "Oferta" }],
    ]) {
      get.mockResolvedValue({ slides });
      expect(await getIdle()).toEqual({ slides });
    }
  });
});

it("refuses invalid configuration before accepting a device token", async () => {
  for (const patch of [
    { reposoSegundos: 0 },
    { slideSegundos: Number.NaN },
    { precioSegundos: 100 },
    { mostrarExistencia: "false" },
    { colorAcento: "red" },
    { contenidoReposo: "unknown" },
    { mensajeBienvenida: null },
    { idioma: "unknown" },
  ]) {
    get.mockResolvedValue({ ...validConfig, ...patch });
    await expect(validateKioskoToken("proposed")).rejects.toThrow("Configuración inválida");
  }
});
