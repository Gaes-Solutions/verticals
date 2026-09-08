import { describe, expect, it } from "vitest";
import { createQuerySession, disposeQuerySession } from "../src/lib/query-session";

describe("business session query isolation", () => {
  it("does not expose tenant A cached sales to tenant B under the same query key", () => {
    const a = createQuerySession("signedIn", "a", "u1");
    a.client.setQueryData(["ventas"], [{ id: "private-a" }]);
    const b = createQuerySession("signedIn", "b", "u1");
    expect(b.key).not.toBe(a.key);
    expect(b.client.getQueryData(["ventas"])).toBeUndefined();
    disposeQuerySession(a);
    disposeQuerySession(b);
  });
  it("isolates two employees and clears previous cached data on logout", () => {
    const a = createQuerySession("signedIn", "a", "u1");
    a.client.setQueryData(["reportes"], { margin: 1000 });
    const b = createQuerySession("signedIn", "a", "u2");
    expect(b.key).not.toBe(a.key);
    expect(b.client.getQueryData(["reportes"])).toBeUndefined();
    disposeQuerySession(a);
    expect(a.client.getQueryCache().getAll()).toEqual([]);
    disposeQuerySession(b);
  });
  it("a delayed previous request cannot populate the next session", async () => {
    const a = createQuerySession("signedIn", "a", "u1");
    let finish!: (value: string) => void;
    const pending = a.client
      .fetchQuery({
        queryKey: ["pedidos"],
        queryFn: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    disposeQuerySession(a);
    const b = createQuerySession("signedIn", "b", "u2");
    finish("private-a");
    await pending;
    expect(b.client.getQueryData(["pedidos"])).toBeUndefined();
    expect(a.client.getQueryCache().getAll()).toEqual([]);
    disposeQuerySession(b);
  });
});
