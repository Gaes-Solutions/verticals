import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPaymentSdk } from "../src/lib/payment-sdk";
interface Script {
  src: string;
  async: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove: ReturnType<typeof vi.fn>;
}
describe("payment SDK lifecycle", () => {
  let scripts: Script[];
  let append: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scripts = [];
    append = vi.fn();
    vi.stubGlobal("document", {
      createElement: () => {
        const s: Script = { src: "", async: false, onload: null, onerror: null, remove: vi.fn() };
        scripts.push(s);
        return s;
      },
      head: { appendChild: append },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const script = () => {
    const value = scripts[0];
    if (!value) throw Error("fixture script missing");
    return value;
  };
  it("uses an already available SDK without another download", async () => {
    await loadPaymentSdk("fixture://ready", () => true);
    expect(scripts).toHaveLength(0);
  });
  it("shares a download between concurrent forms and checks the actual SDK", async () => {
    let available = false;
    const a = loadPaymentSdk("fixture://shared", () => available);
    const b = loadPaymentSdk("fixture://shared", () => available);
    expect(a).toBe(b);
    expect(scripts).toHaveLength(1);
    available = true;
    script().onload?.();
    await Promise.all([a, b]);
    expect(script().remove).not.toHaveBeenCalled();
  });
  it("rejects a loaded script that failed to expose its SDK", async () => {
    const p = loadPaymentSdk("fixture://missing", () => false);
    script().onload?.();
    await expect(p).rejects.toThrow("formulario seguro");
    expect(script().remove).toHaveBeenCalledOnce();
  });
  it("allows a new download after a network failure", async () => {
    const first = loadPaymentSdk("fixture://retry", () => false);
    script().onerror?.();
    await expect(first).rejects.toThrow();
    const second = loadPaymentSdk("fixture://retry", () => false);
    expect(scripts).toHaveLength(2);
    scripts[1]?.onerror?.();
    await expect(second).rejects.toThrow();
  });
  it("bounds a script that emits no events and allows retry", async () => {
    vi.useFakeTimers();
    const first = loadPaymentSdk("fixture://timeout", () => false);
    const failed = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(12001);
    await failed;
    expect(script().remove).toHaveBeenCalledOnce();
    const second = loadPaymentSdk("fixture://timeout", () => false);
    expect(scripts).toHaveLength(2);
    scripts[1]?.onerror?.();
    await expect(second).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears timers when the browser cannot insert a script", async () => {
    vi.useFakeTimers();
    append.mockImplementation(() => {
      throw Error("fixture DOM failure");
    });
    await expect(loadPaymentSdk("fixture://dom", () => false)).rejects.toThrow("formulario seguro");
    expect(vi.getTimerCount()).toBe(0);
  });
});
