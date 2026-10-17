import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { comprimirImagen } from "../src/lib/imagen";
const close = vi.fn();
const decode = vi.fn();
const encode = vi.fn();
const ctx = { drawImage: vi.fn(), fillStyle: "", fillRect: vi.fn() };
const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: encode };
const bitmap = () => ({ width: 2048, height: 1024, close });
const file = { type: "image/jpeg", size: 1024 } as File;
describe("review photo upload budget", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("document", { createElement: () => canvas });
    decode.mockResolvedValue(bitmap());
    encode.mockReturnValue("data:image/jpeg;base64,AAAA");
  });
  afterEach(() => vi.unstubAllGlobals());
  it("reduces an oversized encoding until it fits the server limit and closes the bitmap", async () => {
    encode.mockReturnValueOnce("a".repeat(250001));
    expect((await comprimirImagen(file)).length).toBeLessThanOrEqual(250000);
    expect(encode).toHaveBeenCalledTimes(2);
    expect(canvas.width).toBe(768);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it.each([
    { type: "image/svg+xml", size: 100 },
    { type: "image/jpeg", size: 13 * 1024 * 1024 },
  ])("rejects unsupported/oversized originals before decoding", async (value) => {
    await expect(comprimirImagen(value as File)).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it("cleans the bitmap when encoding fails", async () => {
    encode.mockImplementation(() => {
      throw new Error("encoder failed");
    });
    await expect(comprimirImagen(file)).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("ignores and closes an image decoded after cancellation", async () => {
    let resolve: (value: ReturnType<typeof bitmap>) => void = () => {};
    decode.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const c = new AbortController();
    const result = comprimirImagen(file, 1024, 0.7, c.signal);
    c.abort();
    await expect(result).rejects.toThrow();
    resolve(bitmap());
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1);
    expect(encode).not.toHaveBeenCalled();
  });
});
