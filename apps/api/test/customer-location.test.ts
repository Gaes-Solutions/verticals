import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { locationInput, lookupLocation } from "../src/modules/cliente-portal/location.js";
let time = Date.UTC(2030, 0, 1);
const point = {
  lat: "19.4326",
  lon: "-99.1332",
  address: { road: "Plaza de la Constitución", postcode: "06060" },
};
beforeEach(() => {
  time += 5000;
  vi.useFakeTimers();
  vi.setSystemTime(time);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("accepts one search or numeric coordinates and rejects unsafe/out-of-range input", () => {
  expect(locationInput.parse({ q: "  Plaza CDMX " })).toEqual({ q: "Plaza CDMX" });
  for (const invalid of [
    { lat: 91, lon: 0 },
    { lat: 0, lon: -181 },
    { lat: null, lon: 1 },
    { lat: "19", lon: 1 },
    { lat: Number.NaN, lon: 1 },
    { q: "x" },
    { q: "x".repeat(251) },
    { q: "Plaza CDMX", lat: 19, lon: -99 },
  ])
    expect(locationInput.safeParse(invalid).success).toBe(false);
});
it("looks up Mexican addresses with bounded requests and caches repeated searches", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify([point]), { status: 200 }));
  expect(await lookupLocation({ q: "Plaza CDMX cache" })).toEqual(point);
  expect(await lookupLocation({ q: "Plaza CDMX cache" })).toEqual(point);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.searchParams.get("countrycodes")).toBe("mx");
  expect(url.searchParams.get("addressdetails")).toBe("1");
  expect(fetcher.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
  await expect(lookupLocation({ q: "Other request" })).rejects.toMatchObject({ status: 429 });
});
it("reverse geocodes coordinates with the same response shape", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(point), { status: 200 }));
  expect(await lookupLocation({ lat: 19.4326, lon: -99.1332 })).toEqual(point);
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.pathname).toBe("/reverse");
  expect(url.searchParams.get("lat")).toBe("19.432600");
});
it("returns a recoverable failure without storing a failed response", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValue(new Response(JSON.stringify([point]), { status: 200 }));
  await expect(lookupLocation({ q: "retry address" })).rejects.toMatchObject({ status: 502 });
  await vi.advanceTimersByTimeAsync(1200);
  expect(await lookupLocation({ q: "retry address" })).toEqual(point);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("rejects empty and malformed provider locations", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("[]", { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ lat: "900", lon: "-99", address: {} }), { status: 200 }),
    );
  await expect(lookupLocation({ q: "missing address" })).rejects.toMatchObject({ status: 404 });
  await vi.advanceTimersByTimeAsync(1200);
  await expect(lookupLocation({ lat: 1, lon: 1 })).rejects.toMatchObject({ status: 404 });
});
