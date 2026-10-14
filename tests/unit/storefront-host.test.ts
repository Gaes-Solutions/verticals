import { afterEach, expect, it, vi } from "vitest";
import { resolverHostTienda } from "../../apps/web-tienda/src/lib/storefront-host";
afterEach(() => vi.useRealTimers());
it("deduplicates parallel lookups and isolates domains", async () => {
  const resolve = vi.fn(async () => "gaesland");
  expect(
    await Promise.all([
      resolverHostTienda("parallel.test", resolve),
      resolverHostTienda("parallel.test", resolve),
    ]),
  ).toEqual(["gaesland", "gaesland"]);
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(await resolverHostTienda("different.test", async () => "otra-tienda")).toBe("otra-tienda");
});
it("never serves an expired mapping if the registry fails; retries after recovery", async () => {
  vi.useFakeTimers();
  await resolverHostTienda("expired.test", async () => "gaesland");
  vi.advanceTimersByTime(30001);
  await expect(
    resolverHostTienda("expired.test", async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow("offline");
  expect(await resolverHostTienda("expired.test", async () => "tienda-nueva")).toBe("tienda-nueva");
});
it("does not cache invalid or unverified tenant results", async () => {
  await expect(resolverHostTienda("invalid.test", async () => "")).rejects.toThrow();
  expect(await resolverHostTienda("invalid.test", async () => "gaesland")).toBe("gaesland");
});
