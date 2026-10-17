import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cliente", () => ({ getClienteToken: vi.fn() }));
import { GET } from "../src/app/api/cuenta/realtime/route";
import { getClienteToken } from "../src/lib/cliente";
const req = (signal?: AbortSignal) =>
  new Request("http://localhost/api/cuenta/realtime", { signal });
function streamBody(res: Response) {
  if (!res.body) throw new Error("Missing SSE body");
  return res.body;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getClienteToken).mockResolvedValue("fixture-token");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("private shopper SSE proxy lifecycle", () => {
  it("rejects guests before opening an upstream connection", async () => {
    vi.mocked(getClienteToken).mockResolvedValue(null);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toContain("private, no-store");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])(
    "does not turn upstream failure %i into a successful stream",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("private upstream text", { status })),
      );
      const res = await GET(req());
      expect(res.status).toBe(status === 500 ? 503 : status);
      expect(await res.text()).not.toContain("private upstream text");
    },
  );
  it.each(["text/html", "application/json"])(
    "rejects an HTML/JSON 200 instead of advertising SSE",
    async (type) => {
      const cancel = vi.fn();
      const stream = new ReadableStream({ cancel });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(stream, { headers: { "content-type": type } })),
      );
      const res = await GET(req());
      expect(res.status).toBe(502);
      expect(cancel).toHaveBeenCalled();
    },
  );
  it("rejects an empty successful body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { headers: { "content-type": "text/event-stream" } }),
        ),
    );
    expect((await GET(req())).status).toBe(502);
  });
  it("bounds opening and shares the abort signal with session verification", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal = init.signal;
            signal?.addEventListener("abort", () => reject(new Error("private network")), {
              once: true,
            });
          }),
      ),
    );
    const pending = GET(req());
    await vi.advanceTimersByTimeAsync(15001);
    const res = await pending;
    expect(res.status).toBe(503);
    expect(signal?.aborted).toBe(true);
    expect(vi.mocked(getClienteToken).mock.calls[0]?.[0]).toBe(signal);
  });
  it("keeps a healthy stream alive beyond the opening deadline and forwards bytes unchanged", async () => {
    vi.useFakeTimers();
    let input!: ReadableStreamDefaultController<Uint8Array>;
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            input = c;
          },
        }),
        {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "set-cookie": "private-cookie",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toContain("no-store");
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    const reader = streamBody(res).getReader();
    const bytes = new TextEncoder().encode('data: {"tipo":"aviso"}\n\n');
    input.enqueue(bytes);
    expect((await reader.read()).value).toEqual(bytes);
    input.close();
    expect((await reader.read()).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels the upstream reader and controller when the browser cancels the body", async () => {
    const cancel = vi.fn();
    const fetch = vi.fn().mockResolvedValue(
      new Response(new ReadableStream({ cancel }), {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const res = await GET(req());
    await streamBody(res).cancel();
    expect(cancel).toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });
  it("propagates a disconnected browser request to the pending upstream read", async () => {
    const requestAbort = new AbortController();
    let errorInput: (reason: unknown) => void = () => {};
    const fetch = vi.fn(
      async (_url: unknown, init: { signal: AbortSignal }) =>
        new Response(
          new ReadableStream({
            start(c) {
              errorInput = (e) => c.error(e);
              init.signal.addEventListener(
                "abort",
                () => errorInput(new Error("private upstream error")),
                { once: true },
              );
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const res = await GET(req(requestAbort.signal));
    const reader = streamBody(res).getReader();
    requestAbort.abort();
    await expect(reader.read()).rejects.toThrow("Conexión de avisos interrumpida");
    expect(fetch.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });
});
