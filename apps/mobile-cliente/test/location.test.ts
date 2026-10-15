import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  permission: vi.fn(),
  services: vi.fn(),
  current: vi.fn(),
  post: vi.fn(),
}));
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: mock.permission,
  hasServicesEnabledAsync: mock.services,
  getCurrentPositionAsync: mock.current,
  Accuracy: { High: 4 },
}));
vi.mock("@/lib/api", () => ({ api: { post: mock.post } }));
import { camposDireccionMapa } from "@gaespos/api-client";
import { DeviceLocationError, deviceLocation } from "../src/services/device-location";
import { consultarUbicacion } from "../src/services/ubicacion";
beforeEach(() => {
  vi.resetAllMocks();
  mock.permission.mockResolvedValue({ granted: true });
  mock.services.mockResolvedValue(true);
  mock.current.mockResolvedValue({ coords: { latitude: 19.4326, longitude: -99.1332 } });
});
afterEach(() => vi.useRealTimers());
it("requires foreground permission and never starts GPS when denied", async () => {
  mock.permission.mockResolvedValue({ granted: false });
  await expect(deviceLocation()).rejects.toMatchObject({ settings: true });
  expect(mock.current).not.toHaveBeenCalled();
});
it("explains disabled location services without requesting a position", async () => {
  mock.services.mockResolvedValue(false);
  await expect(deviceLocation()).rejects.toBeInstanceOf(DeviceLocationError);
  expect(mock.current).not.toHaveBeenCalled();
});
it("reads location only after permission and enabled services", async () => {
  expect(await deviceLocation()).toEqual({ lat: 19.4326, lon: -99.1332 });
  expect(mock.current).toHaveBeenCalledWith({ accuracy: 4 });
});
it("stalled GPS times out and clears timers", async () => {
  vi.useFakeTimers();
  mock.current.mockReturnValue(new Promise(() => {}));
  const result = deviceLocation();
  const assertion = expect(result).rejects.toThrow("No pudimos obtener");
  await vi.advanceTimersByTimeAsync(15000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
it("uses the authenticated geocoder with an abort deadline", async () => {
  mock.post.mockResolvedValue({ lat: "19", lon: "-99", address: {} });
  await consultarUbicacion({ q: "Calle y ciudad" });
  expect(mock.post).toHaveBeenCalledWith(
    "/cliente-portal/ubicacion",
    { q: "Calle y ciudad" },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
it("stalled geocoding aborts rather than blocking the form", async () => {
  vi.useFakeTimers();
  mock.post.mockImplementation(
    (_path, _input, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  const result = consultarUbicacion({ lat: 19, lon: -99 });
  const assertion = expect(result).rejects.toThrow("aborted");
  await vi.advanceTimersByTimeAsync(15000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
it("maps Mexican city, borough and rural addresses consistently with the web", () => {
  expect(
    camposDireccionMapa({
      lat: "19",
      lon: "-99",
      address: {
        pedestrian: "Plaza",
        house_number: "10",
        suburb: "Centro",
        borough: "Cuauhtémoc",
        state: "CDMX",
        postcode: "06060",
      },
    }),
  ).toEqual({
    calle: "Plaza",
    numeroExterior: "10",
    colonia: "Centro",
    municipio: "Cuauhtémoc",
    estado: "CDMX",
    codigoPostal: "06060",
  });
  expect(
    camposDireccionMapa({
      lat: "19",
      lon: "-99",
      address: { residential: "Camino", village: "Pueblo", region: "Estado", postcode: "invalid" },
    }),
  ).toMatchObject({ calle: "Camino", municipio: "Pueblo", estado: "Estado", codigoPostal: "" });
});
