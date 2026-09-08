import { describe, expect, it } from "vitest";
import { resolveApiBase } from "../src/lib/api-base.js";

describe("POS API destination", () => {
  it("preserves same-origin proxy for web builds", () => {
    expect(resolveApiBase(undefined, false)).toBe("/api");
  });
  it("uses an explicit HTTPS base path in desktop builds", () => {
    expect(resolveApiBase("https://store.example.test/api/", false)).toBe(
      "https://store.example.test/api",
    );
  });
  it.each([
    "http://example.test/api",
    "http://127.0.0.1:3000",
    "file:///api",
    "javascript:alert(1)",
    "https://user:password@example.test/api",
    "https://example.test/api?token=x",
    "https://example.test/api#fragment",
    "/other",
  ])("rejects unsafe production configuration %s", (value) => {
    expect(() => resolveApiBase(value, false)).toThrow();
  });
  it("allows unencrypted loopback only in development", () => {
    expect(resolveApiBase("http://127.0.0.1:3000/", true)).toBe("http://127.0.0.1:3000");
    expect(() => resolveApiBase("http://remote.example.test/api", true)).toThrow();
  });
});
