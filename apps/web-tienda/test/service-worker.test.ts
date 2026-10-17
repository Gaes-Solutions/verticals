import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const origin = "https://shop.example.test";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const cache = {
    add: vi.fn(async (_request: Request) => {}),
    addAll: vi.fn(async (_requests: unknown[]) => {}),
    match: vi.fn(async (path: string) =>
      path === "/offline.html"
        ? new Response("<h1>Sin conexión</h1>")
        : new Response("OLD-PRIVATE-ACCOUNT"),
    ),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [
      "tienda-shell-v1",
      "tienda-public-offline-old",
      "unrelated-cache",
      "tienda-public-offline-v2",
    ]),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => new Response("OLD-PRIVATE-ACCOUNT")),
  };
  const clients = {
    claim: vi.fn(async () => {}),
    matchAll: vi.fn(async (): Promise<{ url: string; focus: () => unknown }[]> => []),
    openWindow: vi.fn(async () => {}),
  };
  const fetch = vi.fn<typeof globalThis.fetch>();
  const registration = { showNotification: vi.fn(async () => {}) };
  class WorkerRequest extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, origin), init);
    }
  }
  runInNewContext(source, {
    self: {
      addEventListener: (name: string, fn: (e: unknown) => void) => listeners.set(name, fn),
      skipWaiting: vi.fn(async () => {}),
      location: { origin },
      clients,
      registration,
    },
    caches,
    fetch,
    URL,
    Request: WorkerRequest,
    Response,
  });
  async function dispatch(name: string, props: Record<string, unknown> = {}) {
    const promises: Promise<unknown>[] = [];
    const respondWith = vi.fn((p: Promise<Response>) => promises.push(p));
    listeners.get(name)?.({
      waitUntil: (p: Promise<unknown>) => promises.push(p),
      respondWith,
      ...props,
    });
    const results = await Promise.all(promises);
    return { respondWith, response: results[0] as Response };
  }
  return { cache, caches, clients, fetch, registration, dispatch };
}

describe("service worker privacy and recovery", () => {
  it("pre-caches only a static offline page, with no account cookies", async () => {
    const w = worker();
    await w.dispatch("install");
    expect(w.cache.addAll).not.toHaveBeenCalled();
    expect(w.cache.add).toHaveBeenCalledOnce();
    const req = w.cache.add.mock.calls[0]?.[0] as unknown as Request;
    expect(new URL(req.url).pathname).toBe("/offline.html");
    expect(req.credentials).toBe("omit");
  });
  it("cleans legacy store caches but preserves unrelated application data", async () => {
    const w = worker();
    await w.dispatch("activate");
    expect(w.caches.delete).toHaveBeenCalledWith("tienda-shell-v1");
    expect(w.caches.delete).toHaveBeenCalledWith("tienda-public-offline-old");
    expect(w.caches.delete).not.toHaveBeenCalledWith("unrelated-cache");
    expect(w.caches.delete).not.toHaveBeenCalledWith("tienda-public-offline-v2");
    expect(w.clients.claim).toHaveBeenCalledOnce();
  });
  it("offline account navigation never replays cached authenticated HTML", async () => {
    const w = worker();
    w.fetch.mockRejectedValue(new Error("offline"));
    const { response } = await w.dispatch("fetch", {
      request: { method: "GET", mode: "navigate", url: `${origin}/cuenta` },
    });
    const body = await response.text();
    expect(body).toContain("Sin conexión");
    expect(body).not.toContain("OLD-PRIVATE-ACCOUNT");
  });
  it.each([
    { method: "GET", mode: "cors", url: `${origin}/api/cuenta/me` },
    { method: "POST", mode: "navigate", url: `${origin}/api/checkout` },
  ])("does not cache or substitute API/write requests %j", async (request) => {
    const w = worker();
    const result = await w.dispatch("fetch", { request });
    expect(result.respondWith).not.toHaveBeenCalled();
    expect(w.caches.open).not.toHaveBeenCalled();
  });
  it("online navigation uses the current network response without caching it", async () => {
    const w = worker();
    const response = new Response("CURRENT-ACCOUNT");
    w.fetch.mockResolvedValue(response);
    const result = await w.dispatch("fetch", {
      request: { method: "GET", mode: "navigate", url: `${origin}/cuenta` },
    });
    expect(result.response).toBe(response);
    expect(w.caches.open).not.toHaveBeenCalled();
  });
  it("still shows a safe offline message when its cache was deleted", async () => {
    const w = worker();
    w.fetch.mockRejectedValue(new Error("offline"));
    w.cache.match.mockResolvedValue(undefined as never);
    w.caches.match.mockResolvedValue(undefined as never);
    const { response } = await w.dispatch("fetch", {
      request: { method: "GET", mode: "navigate", url: origin },
    });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Sin conexión");
  });
});

describe("notification destinations", () => {
  it.each([
    "https://evil.example/order",
    "//evil.example/order",
    "javascript:alert(1)",
    "data:text/html,test",
  ])("keeps notification clicks on the shop for %s", async (url) => {
    const w = worker();
    await w.dispatch("notificationclick", { notification: { data: { url }, close: vi.fn() } });
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${origin}/`);
  });
  it("does not focus a different order whose URL merely contains the target", async () => {
    const w = worker();
    const focus = vi.fn();
    w.clients.matchAll.mockResolvedValue([{ url: `${origin}/cuenta/pedidos/1234`, focus }]);
    await w.dispatch("notificationclick", {
      notification: { data: { url: "/cuenta/pedidos/123" }, close: vi.fn() },
    });
    expect(focus).not.toHaveBeenCalled();
    expect(w.clients.openWindow).toHaveBeenCalledWith(`${origin}/cuenta/pedidos/123`);
  });
  it("focuses an exact existing order tab", async () => {
    const w = worker();
    const focus = vi.fn();
    w.clients.matchAll.mockResolvedValue([{ url: `${origin}/cuenta/pedidos/123`, focus }]);
    await w.dispatch("notificationclick", {
      notification: { data: { url: "/cuenta/pedidos/123" }, close: vi.fn() },
    });
    expect(focus).toHaveBeenCalledOnce();
    expect(w.clients.openWindow).not.toHaveBeenCalled();
  });
  it("uses the actual shop icon routes for push display", async () => {
    const w = worker();
    await w.dispatch("push", { data: { json: () => ({ title: "QA", body: "QA" }) } });
    expect(w.registration.showNotification).toHaveBeenCalledWith(
      "QA",
      expect.objectContaining({ icon: "/icono.svg", badge: "/icono.svg" }),
    );
  });
});
