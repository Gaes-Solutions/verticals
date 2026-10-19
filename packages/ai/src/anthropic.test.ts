import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicClient } from "./anthropic.js";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  create.mockReset();
});

describe("Anthropic summary request deadline", () => {
  it("bounds the summary request to one minute and leaves retries to its caller", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "  Synthetic summary  " }],
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    const summary = await new AnthropicClient({ apiKey: "synthetic-key" }).summarize({
      texto: "Synthetic incident",
      maxPalabras: 180,
    });
    expect(summary).toMatchObject({ resumen: "Synthetic summary", tokensIn: 1, tokensOut: 2 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 720 }), {
      timeout: 60_000,
      maxRetries: 0,
      signal: expect.any(AbortSignal),
    });
  });

  it("propagates cancellation of a blocked response without retrying", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    create.mockImplementation(
      async (_input, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        }),
    );
    const pending = new AnthropicClient({ apiKey: "synthetic-key" }).summarize({
      texto: "Synthetic incident",
    });
    const assertion = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    controller.abort(new DOMException("Synthetic timeout", "TimeoutError"));
    await assertion;
    expect(timeout).toHaveBeenCalledWith(60_000);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
