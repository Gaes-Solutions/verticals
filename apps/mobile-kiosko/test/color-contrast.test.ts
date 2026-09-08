import { describe, expect, it } from "vitest";
import { accentForeground, priceColor } from "../src/lib/color-contrast";
describe("price visibility", () => {
  it("replaces invisible tenant accents against dark or light surfaces", () => {
    expect(priceColor("#1e293b", "#1e293b", "#ffffff")).toBe("#ffffff");
    expect(priceColor("#ffffff", "#ffffff", "#000000")).toBe("#000000");
  });
  it("keeps a legible accent", () => {
    expect(priceColor("#000000", "#ffffff", "#123456")).toBe("#000000");
  });
  it("uses the theme fallback for malformed colors", () => {
    expect(priceColor("invalid", "#ffffff", "#123456")).toBe("#123456");
  });
  it("chooses contrasting badge foreground", () => {
    expect(accentForeground("#ffffff")).toBe("#000000");
    expect(accentForeground("#000000")).toBe("#ffffff");
  });
});
